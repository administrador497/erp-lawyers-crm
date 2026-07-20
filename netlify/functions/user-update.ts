import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { generateTempPassword } from "./_shared/tempPassword";

const CANALES_VALIDOS = ["correo", "whatsapp"];

type UpdateBody = {
  usuario_id?: string;
  rol_id?: string;
  equipo_id?: string | null;
  activo?: boolean;
  canales_autorizados?: string[];
  forzar_reset_password?: boolean;
};

// POST /api/user-update — Administrador general only, enforced before
// anything else, so a non-admin can't call this even to edit their own
// row. Handles rol/equipo/activo/canales_autorizados, plus the separate
// "forzar reseteo de contraseña" action (generates a new temp password via
// Supabase Auth and flips debe_cambiar_password back to true).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }
  if (auth.usuario.rol !== "Administrador general") {
    return jsonResponse(403, { error: "Solo Administrador general puede editar usuarios." });
  }

  let body: UpdateBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  if (!body.usuario_id) {
    return jsonResponse(400, { error: "usuario_id es obligatorio." });
  }
  if (body.canales_autorizados?.some((c) => !CANALES_VALIDOS.includes(c))) {
    return jsonResponse(400, {
      error: `canales_autorizados solo admite: ${CANALES_VALIDOS.join(", ")}.`,
    });
  }

  const admin = getSupabaseAdmin();

  const { data: target, error: targetError } = await admin
    .from("usuarios")
    .select("id, auth_user_id, rol_id, equipo_id, activo, canales_autorizados")
    .eq("id", body.usuario_id)
    .maybeSingle();

  if (targetError || !target) {
    return jsonResponse(404, { error: "Usuario no encontrado." });
  }

  if (body.activo === false && target.id === auth.usuario.id) {
    return jsonResponse(400, { error: "No puede desactivar su propia cuenta." });
  }

  if (body.rol_id !== undefined) {
    const { data: rol } = await admin.from("roles").select("id").eq("id", body.rol_id).maybeSingle();
    if (!rol) return jsonResponse(400, { error: "rol_id inválido." });
  }
  if (body.equipo_id) {
    const { data: equipo } = await admin
      .from("equipos")
      .select("id")
      .eq("id", body.equipo_id)
      .maybeSingle();
    if (!equipo) return jsonResponse(400, { error: "equipo_id inválido." });
  }

  const updates: Record<string, unknown> = {};
  const estadoAnterior: Record<string, unknown> = {};
  const estadoPosterior: Record<string, unknown> = {};

  if (body.rol_id !== undefined && body.rol_id !== target.rol_id) {
    updates.rol_id = body.rol_id;
    estadoAnterior.rol_id = target.rol_id;
    estadoPosterior.rol_id = body.rol_id;
  }
  if (body.equipo_id !== undefined && body.equipo_id !== target.equipo_id) {
    updates.equipo_id = body.equipo_id;
    estadoAnterior.equipo_id = target.equipo_id;
    estadoPosterior.equipo_id = body.equipo_id;
  }
  if (body.activo !== undefined && body.activo !== target.activo) {
    updates.activo = body.activo;
    estadoAnterior.activo = target.activo;
    estadoPosterior.activo = body.activo;
  }
  if (body.canales_autorizados !== undefined) {
    updates.canales_autorizados = body.canales_autorizados;
    estadoAnterior.canales_autorizados = target.canales_autorizados;
    estadoPosterior.canales_autorizados = body.canales_autorizados;
  }

  let tempPassword: string | null = null;

  if (body.forzar_reset_password) {
    if (!target.auth_user_id) {
      return jsonResponse(400, { error: "Este usuario no tiene una cuenta de Supabase Auth vinculada." });
    }
    tempPassword = generateTempPassword();
    const { error: pwError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
      password: tempPassword,
    });
    if (pwError) {
      return jsonResponse(500, { error: "No fue posible restablecer la contraseña." });
    }
    updates.debe_cambiar_password = true;
    estadoPosterior.password_reset = true;
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse(200, { ok: true });
  }

  updates.updated_at = new Date().toISOString();

  const { error: updateError } = await admin.from("usuarios").update(updates).eq("id", body.usuario_id);
  if (updateError) {
    return jsonResponse(500, { error: "No fue posible actualizar el usuario." });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "usuario_actualizado",
    entidad: "usuarios",
    entidad_id: body.usuario_id,
    estado_anterior: estadoAnterior,
    estado_posterior: estadoPosterior,
  });

  return jsonResponse(200, { ok: true, ...(tempPassword ? { temp_password: tempPassword } : {}) });
};
