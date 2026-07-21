import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

const ESTADOS_VALIDOS = ["pendiente", "completada", "vencida"];
const TIPOS_VALIDOS = ["llamada", "correo", "whatsapp", "reunion", "tarea", "recordatorio"];

type UpdateBody = {
  activity_id?: string;
  estado?: string;
  resultado?: string;
  proxima_accion?: string;
  tipo?: string;
  fecha?: string;
  descripcion?: string | null;
};

// POST /api/activity-update  { activity_id, estado?, resultado?, proxima_accion?, tipo?, fecha?, descripcion? }
// Used by the Completar/Reabrir toggle (estado only) and by the "Editar
// actividad" modal (tipo/fecha/descripcion), reutilizado desde /calendario y
// desde LeadActivitiesList (contactos/pipeline/inbox). Ownership:
// Administrador general, the lead's responsable, or the activity's own
// responsable — covers both "I own this lead" and "this task was assigned
// to me" cases.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  let body: UpdateBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  if (!body.activity_id) {
    return jsonResponse(400, { error: "activity_id es obligatorio." });
  }
  if (body.estado !== undefined && !ESTADOS_VALIDOS.includes(body.estado)) {
    return jsonResponse(400, { error: `estado inválido. Use uno de: ${ESTADOS_VALIDOS.join(", ")}.` });
  }
  if (body.tipo !== undefined && !TIPOS_VALIDOS.includes(body.tipo)) {
    return jsonResponse(400, { error: `tipo inválido. Use uno de: ${TIPOS_VALIDOS.join(", ")}.` });
  }
  if (body.fecha !== undefined && Number.isNaN(new Date(body.fecha).getTime())) {
    return jsonResponse(400, { error: "fecha inválida." });
  }

  const admin = getSupabaseAdmin();

  const { data: actividad, error: actividadError } = await admin
    .from("actividades")
    .select("id, estado, resultado, proxima_accion, tipo, fecha, descripcion, responsable_id, lead:lead_id ( responsable_id )")
    .eq("id", body.activity_id)
    .maybeSingle();

  if (actividadError || !actividad) {
    return jsonResponse(404, { error: "Actividad no encontrada." });
  }

  const leadResponsableId = (actividad as any).lead?.responsable_id ?? null;
  const tienePermiso =
    auth.usuario.rol === "Administrador general" ||
    actividad.responsable_id === auth.usuario.id ||
    leadResponsableId === auth.usuario.id;

  if (!tienePermiso) {
    return jsonResponse(403, { error: "No tiene permiso sobre esta actividad." });
  }

  const updates: Record<string, unknown> = {};
  const estadoAnterior: Record<string, unknown> = {};
  const estadoPosterior: Record<string, unknown> = {};

  if (body.estado !== undefined && body.estado !== actividad.estado) {
    updates.estado = body.estado;
    estadoAnterior.estado = actividad.estado;
    estadoPosterior.estado = body.estado;
  }
  if (body.resultado !== undefined && body.resultado !== actividad.resultado) {
    updates.resultado = body.resultado;
    estadoAnterior.resultado = actividad.resultado;
    estadoPosterior.resultado = body.resultado;
  }
  if (body.proxima_accion !== undefined && body.proxima_accion !== actividad.proxima_accion) {
    updates.proxima_accion = body.proxima_accion;
    estadoAnterior.proxima_accion = actividad.proxima_accion;
    estadoPosterior.proxima_accion = body.proxima_accion;
  }
  if (body.tipo !== undefined && body.tipo !== actividad.tipo) {
    updates.tipo = body.tipo;
    estadoAnterior.tipo = actividad.tipo;
    estadoPosterior.tipo = body.tipo;
  }
  if (body.fecha !== undefined && body.fecha !== actividad.fecha) {
    updates.fecha = body.fecha;
    estadoAnterior.fecha = actividad.fecha;
    estadoPosterior.fecha = body.fecha;
  }
  if (body.descripcion !== undefined && body.descripcion !== actividad.descripcion) {
    updates.descripcion = body.descripcion;
    estadoAnterior.descripcion = actividad.descripcion;
    estadoPosterior.descripcion = body.descripcion;
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse(200, { ok: true });
  }

  const { error: updateError } = await admin
    .from("actividades")
    .update(updates)
    .eq("id", body.activity_id);

  if (updateError) {
    return jsonResponse(500, { error: "No fue posible actualizar la actividad." });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "actividad_actualizada",
    entidad: "actividades",
    entidad_id: body.activity_id,
    estado_anterior: estadoAnterior,
    estado_posterior: estadoPosterior,
  });

  return jsonResponse(200, { ok: true });
};
