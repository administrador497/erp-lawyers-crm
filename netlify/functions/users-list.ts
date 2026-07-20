import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

// GET /api/users-list — Usuarios y roles. Solo Administrador general.
// Bundles the roles/equipos catalogs alongside the table so the frontend
// can populate the create/edit forms from this one call.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }
  if (auth.usuario.rol !== "Administrador general") {
    return jsonResponse(403, { error: "Solo Administrador general puede ver esta sección." });
  }

  const admin = getSupabaseAdmin();

  const { data: usuariosData, error: usuariosError } = await admin
    .from("usuarios")
    .select(
      `id, nombre_completo, correo, activo, debe_cambiar_password, canales_autorizados,
       rol:rol_id ( id, nombre ), equipo:equipo_id ( id, nombre )`
    )
    .order("nombre_completo", { ascending: true });

  if (usuariosError) {
    return jsonResponse(500, { error: "No fue posible cargar los usuarios." });
  }

  const [{ data: roles }, { data: equipos }] = await Promise.all([
    admin.from("roles").select("id, nombre").order("nombre", { ascending: true }),
    admin.from("equipos").select("id, nombre").order("nombre", { ascending: true }),
  ]);

  const usuarios = (usuariosData ?? []).map((u: any) => ({
    id: u.id,
    nombre_completo: u.nombre_completo,
    correo: u.correo,
    activo: u.activo,
    debe_cambiar_password: u.debe_cambiar_password,
    canales_autorizados: u.canales_autorizados ?? [],
    rol_id: u.rol?.id ?? null,
    rol_nombre: u.rol?.nombre ?? "Sin rol",
    equipo_id: u.equipo?.id ?? null,
    equipo_nombre: u.equipo?.nombre ?? null,
  }));

  return jsonResponse(200, { usuarios, roles: roles ?? [], equipos: equipos ?? [] });
};
