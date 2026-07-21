import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

const PROVEEDORES_VALIDOS = ["google", "microsoft"];

type DisconnectBody = { proveedor?: string };

// POST /api/buzon-disconnect { proveedor } — elimina la conexión del propio
// usuario autenticado. Sin excepción para admin: "cada usuario solo
// ve/edita su propio buzón" no distingue por rol para esta acción.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  let body: DisconnectBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  if (!body.proveedor || !PROVEEDORES_VALIDOS.includes(body.proveedor)) {
    return jsonResponse(400, { error: `proveedor debe ser uno de: ${PROVEEDORES_VALIDOS.join(", ")}.` });
  }

  const admin = getSupabaseAdmin();

  const { data: buzon } = await admin
    .from("buzones_correo")
    .select("id")
    .eq("usuario_id", auth.usuario.id)
    .eq("proveedor", body.proveedor)
    .maybeSingle();

  if (!buzon) {
    return jsonResponse(404, { error: "No hay un buzón conectado con ese proveedor." });
  }

  const { error: deleteError } = await admin.from("buzones_correo").delete().eq("id", buzon.id);
  if (deleteError) {
    return jsonResponse(500, { error: "No fue posible desconectar el buzón." });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "buzon_correo_desconectado",
    entidad: "buzones_correo",
    entidad_id: buzon.id,
    estado_anterior: { proveedor: body.proveedor },
  });

  return jsonResponse(200, { ok: true });
};
