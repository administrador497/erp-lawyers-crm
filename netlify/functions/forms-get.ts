import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

// GET /api/forms-get?id=<uuid> — full formulario incl. campos, for the
// builder's editor + live preview.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return jsonResponse(400, { error: "id es obligatorio." });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("formularios")
    .select("id, nombre, activo, campos")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return jsonResponse(404, { error: "Formulario no encontrado." });
  }

  return jsonResponse(200, {
    formulario: {
      id: data.id,
      nombre: data.nombre,
      activo: data.activo,
      campos: Array.isArray(data.campos) ? data.campos : [],
    },
  });
};
