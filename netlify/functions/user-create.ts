import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { generateTempPassword } from "./_shared/tempPassword";

const CANALES_VALIDOS = ["correo", "whatsapp"];
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CreateBody = {
  nombre_completo?: string;
  correo?: string;
  rol_id?: string;
  equipo_id?: string | null;
  canales_autorizados?: string[];
};

// POST /api/user-create — Administrador general only. Creates the Supabase
// Auth user first (with a freshly generated temp password), which fires
// migrations/002's on_auth_user_created trigger and auto-inserts a
// bare-bones `usuarios` row (nombre/correo/auth_user_id/
// debe_cambiar_password) — this function then fills in what the trigger
// doesn't know (rol_id/equipo_id/canales_autorizados). If that second step
// fails, the rollback is just deleting the Auth user: usuarios.auth_user_id
// has `on delete cascade` (migrations/002), so the half-created usuarios
// row disappears with it — no manual multi-table cleanup needed.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }
  if (auth.usuario.rol !== "Administrador general") {
    return jsonResponse(403, { error: "Solo Administrador general puede crear usuarios." });
  }

  let body: CreateBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  const nombreCompleto = body.nombre_completo?.trim();
  const correo = body.correo?.trim().toLowerCase();

  if (!nombreCompleto || !correo || !body.rol_id) {
    return jsonResponse(400, { error: "nombre_completo, correo y rol_id son obligatorios." });
  }
  if (!CORREO_RE.test(correo)) {
    return jsonResponse(400, { error: "correo inválido." });
  }
  if (body.canales_autorizados?.some((c) => !CANALES_VALIDOS.includes(c))) {
    return jsonResponse(400, {
      error: `canales_autorizados solo admite: ${CANALES_VALIDOS.join(", ")}.`,
    });
  }

  const admin = getSupabaseAdmin();

  const { data: rol } = await admin.from("roles").select("id").eq("id", body.rol_id).maybeSingle();
  if (!rol) {
    return jsonResponse(400, { error: "rol_id inválido." });
  }
  if (body.equipo_id) {
    const { data: equipo } = await admin
      .from("equipos")
      .select("id")
      .eq("id", body.equipo_id)
      .maybeSingle();
    if (!equipo) {
      return jsonResponse(400, { error: "equipo_id inválido." });
    }
  }

  const { data: existente } = await admin
    .from("usuarios")
    .select("id")
    .eq("correo", correo)
    .maybeSingle();
  if (existente) {
    return jsonResponse(409, { error: "Ya existe un usuario con ese correo." });
  }

  const tempPassword = generateTempPassword();

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: correo,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreCompleto },
  });

  if (authError || !authUser.user) {
    return jsonResponse(400, {
      error: authError?.message ?? "No fue posible crear el usuario en Supabase Auth.",
    });
  }

  const { data: usuarioActualizado, error: updateError } = await admin
    .from("usuarios")
    .update({
      rol_id: body.rol_id,
      equipo_id: body.equipo_id ?? null,
      canales_autorizados: body.canales_autorizados ?? [],
      activo: true,
    })
    .eq("auth_user_id", authUser.user.id)
    .select("id")
    .single();

  if (updateError || !usuarioActualizado) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return jsonResponse(500, {
      error: "No fue posible completar el usuario — se revirtió la creación en Supabase Auth.",
    });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "usuario_creado",
    entidad: "usuarios",
    entidad_id: usuarioActualizado.id,
    estado_posterior: { correo, rol_id: body.rol_id, equipo_id: body.equipo_id ?? null },
  });

  // temp_password solo se devuelve esta vez — no queda almacenada en texto
  // plano en ningún lado. Comuníquesela al usuario por un canal aparte.
  return jsonResponse(201, { ok: true, usuario_id: usuarioActualizado.id, correo, temp_password: tempPassword });
};
