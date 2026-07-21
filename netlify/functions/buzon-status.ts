import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

// GET /api/buzon-status — estado de los buzones del usuario autenticado
// (los suyos únicamente). Nunca selecciona access_token_cifrado ni
// refresh_token_cifrado — tampoco podría: migrations/011_buzones_correo.sql
// revoca esas dos columnas para el rol 'authenticated' a nivel de base de
// datos, así que este es el mismo límite aplicado dos veces.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();
  const { data: buzones, error } = await admin
    .from("buzones_correo")
    .select("id, proveedor, correo, expires_at, conectado_en")
    .eq("usuario_id", auth.usuario.id);

  if (error) {
    return jsonResponse(500, { error: "No fue posible consultar el estado del buzón." });
  }

  return jsonResponse(200, { buzones: buzones ?? [] });
};
