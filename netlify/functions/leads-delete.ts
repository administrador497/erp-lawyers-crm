import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

type DeleteBody = {
  lead_ids?: string[];
};

// POST /api/leads-delete { lead_ids } — solo Administrador general, igual
// que contact-delete.ts. Soft-delete masivo: marca leads.deleted_at (esa
// columna ya existe desde migrations/013_soft_delete_contactos.sql, que la
// agregó junto con contactos.deleted_at para propagar el borrado de un
// contacto a sus leads — esto solo la usa desde el otro ángulo: eliminar
// leads directamente, sin tocar su contacto ni el resto de sus leads).
//
// Sin cascada a `conversaciones`: esa tabla no tiene su propia columna
// deleted_at y no le hace falta — conversations-list.ts/activities-list.ts
// ya filtran por `lead.deleted_at` a través del join con el lead, así que
// una conversación de un lead recién eliminado deja de listarse sola. El
// acceso directo por conversacion_id (messages-list.ts/messages-send.ts)
// también queda cerrado, vía el mismo chequeo agregado en
// _shared/conversationAccess.ts.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }
  if (auth.usuario.rol !== "Administrador general") {
    return jsonResponse(403, { error: "Solo Administrador general puede eliminar leads." });
  }

  let body: DeleteBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  const leadIds = Array.from(
    new Set((body.lead_ids ?? []).filter((id): id is string => typeof id === "string" && id.length > 0))
  );

  if (leadIds.length === 0) {
    return jsonResponse(400, { error: "lead_ids debe ser un arreglo con al menos un id." });
  }

  const admin = getSupabaseAdmin();

  const { data: leadsExistentes, error: leadsError } = await admin
    .from("leads")
    .select("id, deleted_at")
    .in("id", leadIds);

  if (leadsError) {
    return jsonResponse(500, { error: "No fue posible verificar los leads." });
  }

  const idsValidos = (leadsExistentes ?? []).filter((l) => !l.deleted_at).map((l) => l.id);

  if (idsValidos.length === 0) {
    return jsonResponse(400, { error: "Ninguno de los leads indicados existe o ya estaba eliminado." });
  }

  const nowIso = new Date().toISOString();

  const { error: updateError } = await admin
    .from("leads")
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .in("id", idsValidos);

  if (updateError) {
    return jsonResponse(500, { error: "No fue posible eliminar los leads." });
  }

  // Una fila de auditoria POR lead (no una sola fila "en bloque") — así
  // contact-detail.ts sigue pudiendo armar el historial de cada lead
  // individual filtrando auditoria por entidad_id, exactamente como ya
  // hace con cualquier otra acción (asignación, movimiento de pipeline).
  await admin.from("auditoria").insert(
    idsValidos.map((leadId) => ({
      usuario_id: auth.usuario.id,
      accion: "lead_eliminado",
      entidad: "leads",
      entidad_id: leadId,
      estado_anterior: { deleted_at: null },
      estado_posterior: { deleted_at: nowIso },
    }))
  );

  return jsonResponse(200, { ok: true, eliminados: idsValidos.length, ids: idsValidos });
};
