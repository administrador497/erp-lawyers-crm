import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

// Called right after the client updates its own password via
// supabase.auth.updateUser(). Flips the forced-change flag server-side so
// the guard in lib/authGuard.ts (and RLS-backed self-read of `usuarios`)
// can't be bypassed by simply not calling this endpoint.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();

  const { error } = await admin
    .from("usuarios")
    .update({ debe_cambiar_password: false, correo_verificado: true, updated_at: new Date().toISOString() })
    .eq("id", auth.usuario.id);

  if (error) {
    return jsonResponse(500, { error: "No fue posible confirmar el cambio de contraseña." });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "cambio_password_obligatorio",
    entidad: "usuarios",
    entidad_id: auth.usuario.id,
    estado_anterior: { debe_cambiar_password: true },
    estado_posterior: { debe_cambiar_password: false },
  });

  return jsonResponse(200, { ok: true });
};
