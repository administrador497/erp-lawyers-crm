import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

// POST /api/leads-assign  { lead_id, responsable_id }
// Reassigns a lead out of the "Nuevos leads por asignar" queue. Only an
// Administrador general may do this — role is checked server-side, not just
// hidden in the UI, per README "Seguridad — no negociable".
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  if (auth.usuario.rol !== "Administrador general") {
    return jsonResponse(403, { error: "Solo un administrador general puede asignar leads." });
  }

  let body: { lead_id?: string; responsable_id?: string };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  const { lead_id, responsable_id } = body;
  if (!lead_id || !responsable_id) {
    return jsonResponse(400, { error: "lead_id y responsable_id son obligatorios." });
  }

  const admin = getSupabaseAdmin();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, responsable_id, estado")
    .eq("id", lead_id)
    .maybeSingle();

  if (leadError || !lead) {
    return jsonResponse(404, { error: "Lead no encontrado." });
  }

  if (lead.estado !== "Nuevo") {
    return jsonResponse(409, { error: "Este lead ya fue asignado o cambió de estado." });
  }

  const { data: targetUser, error: targetError } = await admin
    .from("usuarios")
    .select("id, nombre_completo, activo")
    .eq("id", responsable_id)
    .maybeSingle();

  if (targetError || !targetUser || !targetUser.activo) {
    return jsonResponse(400, { error: "El usuario destino no existe o está inactivo." });
  }

  const { error: updateError } = await admin
    .from("leads")
    .update({ responsable_id, estado: "Asignado", updated_at: new Date().toISOString() })
    .eq("id", lead_id);

  if (updateError) {
    return jsonResponse(500, { error: "No fue posible reasignar el lead." });
  }

  await admin.from("asignaciones_historial").insert({
    lead_id,
    usuario_anterior_id: lead.responsable_id,
    usuario_nuevo_id: responsable_id,
    asignado_por_id: auth.usuario.id,
    motivo: "Reasignación manual desde bandeja de nuevos leads",
    estado_anterior: "Nuevo",
    estado_posterior: "Asignado",
  });

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "reasignacion_manual",
    entidad: "leads",
    entidad_id: lead_id,
    estado_anterior: { responsable_id: lead.responsable_id, estado: "Nuevo" },
    estado_posterior: { responsable_id, estado: "Asignado" },
  });

  await admin.from("alertas").insert({
    lead_id,
    usuario_id: responsable_id,
    tipo: "lead_reasignado",
    mensaje: `Se le asignó un lead nuevo (por ${auth.usuario.nombre_completo}).`,
  });

  return jsonResponse(200, { ok: true, responsable_nombre: targetUser.nombre_completo });
};
