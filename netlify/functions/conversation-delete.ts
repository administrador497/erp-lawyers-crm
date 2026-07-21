import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

type DeleteBody = {
  conversacion_id?: string;
};

// POST /api/conversation-delete { conversacion_id } — solo Administrador
// general. Soft-delete de UNA conversación (migrations/
// 015_soft_delete_conversaciones.sql): marca conversaciones.deleted_at y
// nada más — a diferencia de contact-delete.ts, no propaga a leads ni
// contactos, porque acá es la conversación puntual la que se elimina, no el
// lead detrás (que sigue intacto en Pipeline/Contactos/Calendario). No se
// borra ninguna fila — mensajes/archivos de esa conversación quedan
// intactos, solo dejan de ser alcanzables desde /inbox.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }
  if (auth.usuario.rol !== "Administrador general") {
    return jsonResponse(403, { error: "Solo Administrador general puede eliminar conversaciones." });
  }

  let body: DeleteBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  if (!body.conversacion_id) {
    return jsonResponse(400, { error: "conversacion_id es obligatorio." });
  }

  const admin = getSupabaseAdmin();

  const { data: conversacion, error: conversacionError } = await admin
    .from("conversaciones")
    .select("id, lead_id, deleted_at")
    .eq("id", body.conversacion_id)
    .maybeSingle();

  if (conversacionError || !conversacion) {
    return jsonResponse(404, { error: "Conversación no encontrada." });
  }
  if (conversacion.deleted_at) {
    return jsonResponse(400, { error: "Esta conversación ya fue eliminada." });
  }

  const nowIso = new Date().toISOString();

  const { error: updateError } = await admin
    .from("conversaciones")
    .update({ deleted_at: nowIso })
    .eq("id", conversacion.id);

  if (updateError) {
    return jsonResponse(500, { error: "No fue posible eliminar la conversación." });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "conversacion_eliminada",
    entidad: "conversaciones",
    entidad_id: conversacion.id,
    estado_anterior: { deleted_at: null },
    estado_posterior: { deleted_at: nowIso, lead_id: conversacion.lead_id },
  });

  return jsonResponse(200, { ok: true, conversacion_id: conversacion.id });
};
