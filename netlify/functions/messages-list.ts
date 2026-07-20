import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { loadConversacionForAccessCheck, usuarioPuedeVerConversacion } from "./_shared/conversationAccess";

// GET /api/messages-list?conversacion_id=<uuid> — full thread for the
// right-hand pane of the Bandeja omnicanal, chronological order. Same
// visibility rule as conversations-list.ts: Administrador general or the
// lead's own responsable, checked here again (never trust the list
// endpoint's filtering to also gate this one — a user could request any
// conversacion_id directly).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const conversacionId = event.queryStringParameters?.conversacion_id;
  if (!conversacionId) {
    return jsonResponse(400, { error: "conversacion_id es obligatorio." });
  }

  const conversacion = await loadConversacionForAccessCheck(conversacionId);
  if (!conversacion) {
    return jsonResponse(404, { error: "Conversación no encontrada." });
  }

  if (!usuarioPuedeVerConversacion(auth.usuario, conversacion.responsableId)) {
    return jsonResponse(403, { error: "No tiene acceso a esta conversación." });
  }

  const admin = getSupabaseAdmin();

  const { data: mensajes, error } = await admin
    .from("mensajes")
    .select("id, canal, direccion, remitente, destinatarios, asunto, cuerpo, created_at")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonResponse(500, { error: "No fue posible cargar los mensajes." });
  }

  return jsonResponse(200, { mensajes: mensajes ?? [] });
};
