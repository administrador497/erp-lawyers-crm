import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { correoPrincipal, nombreCompleto, telefonoPrincipal } from "./_shared/contacto";

const CONVERSACION_SELECT = `
  id, estado, created_at,
  lead:lead_id!inner ( id, estado, prioridad, canal_origen, responsable_id,
    servicio:servicio_id ( nombre ),
    etapa:etapa_id ( nombre ),
    responsable:responsable_id ( id, nombre_completo )
  ),
  contacto:contacto_id ( id, nombre, primer_apellido, segundo_apellido,
    contacto_correos ( correo, es_principal ),
    contacto_telefonos ( numero_e164, es_principal )
  ),
  canal:canal_id ( tipo, identificador )
`;

// GET /api/conversations-list — left-hand list of the Bandeja omnicanal.
// Administrador general sees every conversación; a Usuario estándar only
// sees the ones tied to leads assigned to them (enforced with an inner join
// + .eq on the embedded lead, not filtered client-side).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();

  let query = admin
    .from("conversaciones")
    .select(CONVERSACION_SELECT)
    .is("lead.deleted_at", null)
    .order("created_at", { ascending: false });

  if (auth.usuario.rol !== "Administrador general") {
    query = query.eq("lead.responsable_id", auth.usuario.id);
  }

  const { data: conversaciones, error } = await query;

  if (error) {
    return jsonResponse(500, { error: "No fue posible cargar las conversaciones." });
  }

  const ids = (conversaciones ?? []).map((c: any) => c.id);
  const ultimoMensajePorConversacion: Record<
    string,
    { cuerpo: string; canal: string; direccion: string; created_at: string }
  > = {};

  if (ids.length > 0) {
    const { data: mensajes } = await admin
      .from("mensajes")
      .select("conversacion_id, cuerpo, canal, direccion, created_at")
      .in("conversacion_id", ids)
      .order("created_at", { ascending: false });

    for (const m of mensajes ?? []) {
      // Ordered desc, so the first message seen per conversation is the latest.
      if (!ultimoMensajePorConversacion[m.conversacion_id]) {
        ultimoMensajePorConversacion[m.conversacion_id] = m;
      }
    }
  }

  const result = (conversaciones ?? []).map((c: any) => {
    const lead = c.lead ?? {};
    const contacto = c.contacto ?? {};
    const ultimo = ultimoMensajePorConversacion[c.id];

    return {
      id: c.id,
      estado: c.estado,
      lead_id: lead.id ?? null,
      canal: c.canal?.tipo ?? lead.canal_origen ?? null,
      contacto_nombre: nombreCompleto(contacto),
      contacto_correo: correoPrincipal(contacto.contacto_correos),
      contacto_telefono: telefonoPrincipal(contacto.contacto_telefonos),
      servicio: lead.servicio?.nombre ?? null,
      etapa: lead.etapa?.nombre ?? null,
      prioridad: lead.prioridad,
      lead_estado: lead.estado,
      responsable_id: lead.responsable_id,
      responsable_nombre: lead.responsable?.nombre_completo ?? null,
      ultimo_mensaje: ultimo?.cuerpo ?? null,
      ultimo_mensaje_fecha: ultimo?.created_at ?? c.created_at,
    };
  });

  return jsonResponse(200, { conversaciones: result });
};
