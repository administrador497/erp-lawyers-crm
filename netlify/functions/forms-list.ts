import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

// GET /api/forms-list — any authenticated user can view the catalog of
// formularios (read-only, like servicios/roles); only forms-save.ts
// restricts who can edit.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("formularios")
    .select("id, nombre, activo, campos")
    .order("created_at", { ascending: true });

  if (error) {
    return jsonResponse(500, { error: "No fue posible cargar los formularios." });
  }

  const formularios = (data ?? []).map((f: any) => ({
    id: f.id,
    nombre: f.nombre,
    activo: f.activo,
    campos_count: Array.isArray(f.campos) ? f.campos.length : 0,
  }));

  return jsonResponse(200, { formularios });
};
