import type { HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./supabaseAdmin";

export type AuthedUsuario = {
  id: string;
  auth_user_id: string;
  nombre_completo: string;
  correo: string;
  rol: string | null;
  activo: boolean;
  debe_cambiar_password: boolean;
};

export type RequireUserResult =
  | { ok: true; usuario: AuthedUsuario }
  | { ok: false; status: number; message: string };

// Verifies the bearer token against Supabase Auth and resolves the matching
// `usuarios` row + role. Every Netlify Function that touches business data
// must call this first — permissions are enforced here, not in the UI.
export async function requireUser(event: HandlerEvent): Promise<RequireUserResult> {
  const authHeader = event.headers.authorization ?? event.headers.Authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: "Falta el token de autenticación." };
  }

  const admin = getSupabaseAdmin();
  const { data: authData, error: authError } = await admin.auth.getUser(token);

  if (authError || !authData.user) {
    return { ok: false, status: 401, message: "Sesión inválida o expirada." };
  }

  const { data: usuario, error: usuarioError } = await admin
    .from("usuarios")
    .select("id, auth_user_id, nombre_completo, correo, activo, debe_cambiar_password, roles(nombre)")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (usuarioError || !usuario) {
    return { ok: false, status: 403, message: "Usuario no encontrado en el sistema." };
  }

  if (!usuario.activo) {
    return { ok: false, status: 403, message: "Cuenta inactiva." };
  }

  const rolRow = Array.isArray(usuario.roles) ? usuario.roles[0] : usuario.roles;

  return {
    ok: true,
    usuario: {
      id: usuario.id,
      auth_user_id: usuario.auth_user_id,
      nombre_completo: usuario.nombre_completo,
      correo: usuario.correo,
      rol: (rolRow as { nombre: string } | null)?.nombre ?? null,
      activo: usuario.activo,
      debe_cambiar_password: usuario.debe_cambiar_password,
    },
  };
}

export function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
