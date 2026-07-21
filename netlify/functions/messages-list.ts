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

  const mensajeIds = (mensajes ?? []).map((m) => m.id);
  const archivosPorMensaje = new Map<string, { id: string; nombre_original: string; tipo_mime: string | null; tamano_bytes: number | null }[]>();

  if (mensajeIds.length > 0) {
    const { data: archivos } = await admin
      .from("archivos")
      .select("id, mensaje_id, nombre_original, tipo_mime, tamano_bytes")
      .in("mensaje_id", mensajeIds);

    for (const a of archivos ?? []) {
      const lista = archivosPorMensaje.get(a.mensaje_id) ?? [];
      lista.push({ id: a.id, nombre_original: a.nombre_original, tipo_mime: a.tipo_mime, tamano_bytes: a.tamano_bytes });
      archivosPorMensaje.set(a.mensaje_id, lista);
    }
  }

  const result = (mensajes ?? []).map((m) => ({
    id: m.id,
    canal: m.canal,
    direccion: m.direccion,
    remitente: m.remitente,
    destinatarios: m.destinatarios,
    asunto: m.asunto,
    cuerpo: m.cuerpo,
    created_at: m.created_at,
    adjuntos: archivosPorMensaje.get(m.id) ?? [],
  }));

  return jsonResponse(200, { mensajes: result });
};
