import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { buscarOCrearContacto, buscarOCrearEmpresa } from "./_shared/contacto";
import { notifyBayronOfNewLead } from "./_shared/notifyBayron";
import { loadBuzonGoogle } from "./_shared/googleMailbox";

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

type CreateBody = {
  nombre?: string;
  primer_apellido?: string;
  segundo_apellido?: string;
  correo?: string;
  telefono_e164?: string;
  pais?: string;
  empresa_nombre?: string;
  servicio_id?: string;
};

// POST /api/contact-create — creación manual de contacto desde /contactos
// ("+ Nuevo contacto"). Mismo criterio de permisos que leads-create.ts (el
// otro punto de entrada "manual" ya existente): cualquier usuario
// autenticado y activo puede crearlo, sin restricción de rol adicional —
// no hay razón de negocio para que solo un admin pueda registrar un
// contacto a mano. Como todo lead nuevo, responsable_id/estado/etapa_id
// nunca se aceptan del cuerpo: el trigger de
// migrations/003_lead_assignment_rule.sql es lo único que los asigna, para
// que la regla de asignación automática a Bayron se cumpla igual que en
// cualquier otro canal.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  let body: CreateBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  const nombre = body.nombre?.trim();
  if (!nombre) {
    return jsonResponse(400, { error: "El nombre es obligatorio." });
  }

  const telefono = body.telefono_e164?.trim() || null;
  if (telefono && !E164_REGEX.test(telefono)) {
    return jsonResponse(400, { error: "El teléfono debe estar en formato E.164, por ejemplo +50688000000." });
  }

  const correo = body.correo?.trim() || null;
  if (correo && !/^\S+@\S+\.\S+$/.test(correo)) {
    return jsonResponse(400, { error: "El correo no es válido." });
  }

  const admin = getSupabaseAdmin();

  let empresaId: string | null = null;
  if (body.empresa_nombre?.trim()) {
    empresaId = await buscarOCrearEmpresa(admin, body.empresa_nombre);
  }

  let servicioId: string | null = null;
  if (body.servicio_id) {
    const { data: servicio } = await admin.from("servicios").select("id").eq("id", body.servicio_id).maybeSingle();
    if (!servicio) {
      return jsonResponse(400, { error: "servicio_id inválido." });
    }
    servicioId = servicio.id;
  }

  const contactoResult = await buscarOCrearContacto(admin, {
    nombre,
    primer_apellido: body.primer_apellido,
    segundo_apellido: body.segundo_apellido,
    correo,
    telefono_e164: telefono,
    pais: body.pais,
    empresa_id: empresaId,
  });

  if ("error" in contactoResult) {
    return jsonResponse(500, { error: contactoResult.error });
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      contacto_id: contactoResult.contactoId,
      servicio_id: servicioId,
      canal_origen: "manual",
      fuente: `Creado manualmente por ${auth.usuario.nombre_completo}`,
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    return jsonResponse(500, { error: "No fue posible crear el lead." });
  }

  await notifyBayronOfNewLead({
    leadId: lead.id,
    contactoNombre: nombre,
    canalOrigen: "manual",
  });

  // Conversación inicial — sin esto el lead nunca aparece en la Bandeja
  // omnicanal: conversations-list.ts lista conversaciones, no leads. Ni
  // leads-create.ts ni forms-submit.ts tienen este paso tampoco (mismo
  // hueco ahí, sin tocar esos dos archivos ya en producción porque no fue
  // lo que se pidió). channel 'correo': si quien crea el contacto tiene un
  // buzón de Gmail conectado, la conversación queda ligada a ese canal
  // (reutiliza la fila de `canales` si ya existe una con ese identificador,
  // en vez de crear una nueva cada vez); si no, queda sin canal_id — la UI
  // ya sabe mostrar el canal_origen del lead como respaldo en ese caso
  // (ver conversations-list.ts). Sin hilo_externo_id todavía: se completa
  // solo la primera vez que alguien responda por Gmail desde /inbox (ver
  // messages-send.ts).
  let canalId: string | null = null;
  const buzon = await loadBuzonGoogle(auth.usuario.id);
  if (buzon) {
    const { data: canalExistente } = await admin
      .from("canales")
      .select("id")
      .eq("tipo", "correo")
      .eq("identificador", buzon.correo)
      .maybeSingle();

    if (canalExistente) {
      canalId = canalExistente.id;
    } else {
      const { data: nuevoCanal } = await admin
        .from("canales")
        .insert({ tipo: "correo", identificador: buzon.correo })
        .select("id")
        .single();
      canalId = nuevoCanal?.id ?? null;
    }
  }

  const { error: conversacionError } = await admin.from("conversaciones").insert({
    lead_id: lead.id,
    contacto_id: contactoResult.contactoId,
    canal_id: canalId,
    estado: "abierta",
  });

  if (conversacionError) {
    // No revierte el contacto/lead ya creados — el lead sigue siendo válido
    // y visible en Contactos/Pipeline; solo queda sin conversación inicial,
    // recuperable a mano si hace falta. No tiene sentido devolver un error
    // 500 por esto cuando la parte que sí importa (contacto + lead +
    // asignación a Bayron) ya se completó.
    console.error("[contact-create] No fue posible crear la conversación inicial:", conversacionError.message);
  }

  return jsonResponse(201, { ok: true, lead_id: lead.id, contacto_id: contactoResult.contactoId });
};
