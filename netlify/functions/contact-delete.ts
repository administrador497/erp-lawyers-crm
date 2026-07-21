import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

type DeleteBody = {
  contacto_id?: string;
};

// POST /api/contact-delete { contacto_id } — solo Administrador general.
// Soft-delete: marca contactos.deleted_at y lo propaga a todos los leads de
// ese contacto (leads.deleted_at) para que desaparezca de pipeline/inbox/
// bandeja omnicanal/calendario, que filtran por ahí. No borra ninguna fila
// — conversaciones, mensajes, actividades, auditoria y consentimientos
// quedan intactos, solo dejan de ser alcanzables desde la UI. Ver
// migrations/013_soft_delete_contactos.sql para el porqué.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }
  if (auth.usuario.rol !== "Administrador general") {
    return jsonResponse(403, { error: "Solo Administrador general puede eliminar contactos." });
  }

  let body: DeleteBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  if (!body.contacto_id) {
    return jsonResponse(400, { error: "contacto_id es obligatorio." });
  }

  const admin = getSupabaseAdmin();

  const { data: contacto, error: contactoError } = await admin
    .from("contactos")
    .select("id, nombre, primer_apellido, segundo_apellido, deleted_at")
    .eq("id", body.contacto_id)
    .maybeSingle();

  if (contactoError || !contacto) {
    return jsonResponse(404, { error: "Contacto no encontrado." });
  }
  if (contacto.deleted_at) {
    return jsonResponse(400, { error: "Este contacto ya fue eliminado." });
  }

  const nowIso = new Date().toISOString();

  const { error: contactoUpdateError } = await admin
    .from("contactos")
    .update({ deleted_at: nowIso })
    .eq("id", contacto.id);

  if (contactoUpdateError) {
    return jsonResponse(500, { error: "No fue posible eliminar el contacto." });
  }

  const { data: leadsAfectados, error: leadsUpdateError } = await admin
    .from("leads")
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .eq("contacto_id", contacto.id)
    .is("deleted_at", null)
    .select("id");

  if (leadsUpdateError) {
    // El contacto ya quedó marcado como eliminado — no revierte esa parte
    // (que sí funcionó) por un fallo en la propagación a sus leads. Queda
    // registrado para revisar manualmente en vez de perder el rastro.
    console.error(
      `[contact-delete] Contacto ${contacto.id} eliminado, pero no fue posible propagar a sus leads:`,
      leadsUpdateError.message
    );
  }

  const nombreCompleto = [contacto.nombre, contacto.primer_apellido, contacto.segundo_apellido]
    .filter(Boolean)
    .join(" ");

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "contacto_eliminado",
    entidad: "contactos",
    entidad_id: contacto.id,
    estado_anterior: { deleted_at: null },
    estado_posterior: {
      deleted_at: nowIso,
      nombre: nombreCompleto,
      leads_afectados: (leadsAfectados ?? []).map((l) => l.id),
    },
  });

  return jsonResponse(200, {
    ok: true,
    contacto_id: contacto.id,
    leads_afectados: (leadsAfectados ?? []).map((l) => l.id),
  });
};
