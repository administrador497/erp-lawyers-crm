import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { correoPrincipal, nombreCompleto, telefonoPrincipal } from "./_shared/contacto";
import { textoAuditoriaLead } from "./_shared/auditoriaTexto";

type HistorialItem = { when: string; text: string };

function truncar(texto: string, max = 90): string {
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

// GET /api/contact-detail?lead_id=<uuid> — full ficha (Información +
// Historial) for the Contactos/Leads screen. Same ownership rule as the
// rest of the app: Administrador general or the lead's own responsable.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const leadId = event.queryStringParameters?.lead_id;
  if (!leadId) {
    return jsonResponse(400, { error: "lead_id es obligatorio." });
  }

  const admin = getSupabaseAdmin();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select(
      `id, canal_origen, prioridad, valor_potencial, estado, responsable_id, created_at,
       contacto:contacto_id ( id, nombre, primer_apellido, segundo_apellido, pais, etiquetas, notas,
         contacto_correos ( correo, es_principal ),
         contacto_telefonos ( numero_e164, es_principal ) ),
       servicio:servicio_id ( nombre ),
       etapa:etapa_id ( nombre ),
       responsable:responsable_id ( nombre_completo )`
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return jsonResponse(404, { error: "Lead no encontrado." });
  }

  if (auth.usuario.rol !== "Administrador general" && lead.responsable_id !== auth.usuario.id) {
    return jsonResponse(403, { error: "No tiene acceso a este contacto." });
  }

  const contacto = (lead as any).contacto ?? {};

  const contactoDetail = {
    lead_id: lead.id,
    contacto_id: contacto.id,
    nombre: contacto.nombre,
    primer_apellido: contacto.primer_apellido,
    segundo_apellido: contacto.segundo_apellido,
    nombre_completo: nombreCompleto(contacto),
    correo: correoPrincipal(contacto.contacto_correos),
    telefono: telefonoPrincipal(contacto.contacto_telefonos),
    pais: contacto.pais,
    etiquetas: contacto.etiquetas ?? [],
    notas: contacto.notas,
    servicio: (lead as any).servicio?.nombre ?? null,
    canal_origen: lead.canal_origen,
    responsable_nombre: (lead as any).responsable?.nombre_completo ?? null,
    prioridad: lead.prioridad,
    valor_potencial: lead.valor_potencial,
    estado: lead.estado,
    etapa: (lead as any).etapa?.nombre ?? null,
    ingreso: lead.created_at,
  };

  // --- Historial: auditoria + asignaciones_historial + mensajes + actividades ---
  const [{ data: auditoria }, { data: asignaciones }, { data: conversaciones }, { data: actividades }] =
    await Promise.all([
      admin
        .from("auditoria")
        .select("usuario_id, accion, estado_anterior, estado_posterior, created_at")
        .eq("entidad", "leads")
        .eq("entidad_id", leadId),
      admin
        .from("asignaciones_historial")
        .select("usuario_anterior_id, usuario_nuevo_id, asignado_por_id, motivo, created_at")
        .eq("lead_id", leadId),
      admin.from("conversaciones").select("id").eq("lead_id", leadId),
      admin
        .from("actividades")
        .select("tipo, fecha, estado, descripcion, resultado, responsable_id")
        .eq("lead_id", leadId),
    ]);

  const conversacionIds = (conversaciones ?? []).map((c: any) => c.id);
  let mensajes: any[] = [];
  if (conversacionIds.length > 0) {
    const { data } = await admin
      .from("mensajes")
      .select("canal, direccion, cuerpo, created_at")
      .in("conversacion_id", conversacionIds);
    mensajes = data ?? [];
  }

  const usuarioIds = new Set<string>();
  (auditoria ?? []).forEach((a: any) => a.usuario_id && usuarioIds.add(a.usuario_id));
  (asignaciones ?? []).forEach((a: any) => {
    if (a.usuario_anterior_id) usuarioIds.add(a.usuario_anterior_id);
    if (a.usuario_nuevo_id) usuarioIds.add(a.usuario_nuevo_id);
    if (a.asignado_por_id) usuarioIds.add(a.asignado_por_id);
  });
  (actividades ?? []).forEach((a: any) => a.responsable_id && usuarioIds.add(a.responsable_id));

  const etapaIds = new Set<string>();
  (auditoria ?? []).forEach((a: any) => {
    if (a.estado_anterior?.etapa_id) etapaIds.add(a.estado_anterior.etapa_id);
    if (a.estado_posterior?.etapa_id) etapaIds.add(a.estado_posterior.etapa_id);
  });

  const [usuariosMapRows, etapasMapRows] = await Promise.all([
    usuarioIds.size > 0
      ? admin.from("usuarios").select("id, nombre_completo").in("id", Array.from(usuarioIds))
      : Promise.resolve({ data: [] }),
    etapaIds.size > 0
      ? admin.from("etapas").select("id, nombre").in("id", Array.from(etapaIds))
      : Promise.resolve({ data: [] }),
  ]);

  const usuarioNombre = new Map<string, string>(
    ((usuariosMapRows as any).data ?? []).map((u: any) => [u.id, u.nombre_completo])
  );
  const etapaNombre = new Map<string, string>(
    ((etapasMapRows as any).data ?? []).map((e: any) => [e.id, e.nombre])
  );

  const historial: HistorialItem[] = [];

  for (const a of auditoria ?? []) {
    historial.push({
      when: a.created_at,
      text: textoAuditoriaLead(a, usuarioNombre, etapaNombre, contactoDetail.canal_origen),
    });
  }

  for (const a of asignaciones ?? []) {
    const nombreNuevo = a.usuario_nuevo_id ? usuarioNombre.get(a.usuario_nuevo_id) : null;
    historial.push({
      when: a.created_at,
      text: `${a.motivo ?? "Asignación registrada."}${nombreNuevo ? ` (responsable: ${nombreNuevo})` : ""}`,
    });
  }

  for (const m of mensajes) {
    historial.push({
      when: m.created_at,
      text: `Mensaje ${m.direccion === "saliente" ? "enviado" : "recibido"} por ${m.canal}: ${truncar(m.cuerpo)}`,
    });
  }

  for (const act of actividades ?? []) {
    const partes = [act.tipo];
    if (act.descripcion) partes.push(act.descripcion);
    if (act.estado === "completada") partes.push("(completada)");
    historial.push({ when: act.fecha, text: partes.join(" — ") });
  }

  historial.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

  return jsonResponse(200, { contacto: contactoDetail, historial });
};
