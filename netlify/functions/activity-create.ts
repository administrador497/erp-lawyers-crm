import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

const TIPOS_VALIDOS = ["llamada", "correo", "whatsapp", "reunion", "tarea", "recordatorio"];

type CreateBody = {
  lead_id?: string;
  tipo?: string;
  fecha?: string;
  descripcion?: string;
  responsable_id?: string;
};

// POST /api/activity-create  { lead_id, tipo, fecha, descripcion, responsable_id? }
// Ownership is checked against the LEAD (same rule as leads-move-stage.ts /
// contact-update.ts), not the activity's own responsable_id — a user can
// only schedule activities on leads they're allowed to touch.
// responsable_id defaults to the requester if not given; if given, it must
// be an active usuario (no restriction on assigning it to someone else on
// your own lead — that's a reasonable admin/delegation use case).
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

  const { lead_id, tipo, fecha, descripcion } = body;

  if (!lead_id || !tipo || !fecha) {
    return jsonResponse(400, { error: "lead_id, tipo y fecha son obligatorios." });
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return jsonResponse(400, { error: `tipo inválido. Use uno de: ${TIPOS_VALIDOS.join(", ")}.` });
  }
  if (Number.isNaN(new Date(fecha).getTime())) {
    return jsonResponse(400, { error: "fecha inválida." });
  }

  const admin = getSupabaseAdmin();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, responsable_id")
    .eq("id", lead_id)
    .maybeSingle();

  if (leadError || !lead) {
    return jsonResponse(404, { error: "Lead no encontrado." });
  }

  if (auth.usuario.rol !== "Administrador general" && lead.responsable_id !== auth.usuario.id) {
    return jsonResponse(403, { error: "No tiene permiso sobre este lead." });
  }

  let responsableId = body.responsable_id ?? auth.usuario.id;

  if (body.responsable_id) {
    const { data: responsable, error: responsableError } = await admin
      .from("usuarios")
      .select("id, activo")
      .eq("id", body.responsable_id)
      .maybeSingle();

    if (responsableError || !responsable || !responsable.activo) {
      return jsonResponse(400, { error: "responsable_id inválido o inactivo." });
    }
    responsableId = responsable.id;
  }

  const { data: actividad, error: insertError } = await admin
    .from("actividades")
    .insert({
      lead_id,
      responsable_id: responsableId,
      tipo,
      fecha,
      descripcion: descripcion ?? null,
      estado: "pendiente",
    })
    .select("id")
    .single();

  if (insertError || !actividad) {
    return jsonResponse(500, { error: "No fue posible crear la actividad." });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "actividad_creada",
    entidad: "actividades",
    entidad_id: actividad.id,
    estado_posterior: { lead_id, tipo, fecha, responsable_id: responsableId },
  });

  return jsonResponse(201, { ok: true, activity_id: actividad.id });
};
