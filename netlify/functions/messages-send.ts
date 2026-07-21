import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { loadConversacionForAccessCheck, usuarioPuedeVerConversacion } from "./_shared/conversationAccess";

const CANALES_VALIDOS = ["correo", "whatsapp"];

type SendBody = {
  conversacion_id?: string;
  canal?: string;
  cuerpo?: string;
};

// POST /api/messages-send  { conversacion_id, canal, cuerpo }
//
// IMPORTANT — this only PERSISTS the outbound message to `mensajes` and
// marks the conversación as active. It does NOT actually dispatch anything
// over email or WhatsApp yet.
//
// TODO(real-send): the OAuth *connection* now exists (migrations/
// 011_buzones_correo.sql + oauth-google-start.ts/oauth-google-callback.ts),
// but nothing here uses it yet. Once wired up, this should: look up the
// sender's row in `buzones_correo` (proveedor = 'correo' → 'google' for
// now), decrypt access_token_cifrado/refresh_token_cifrado via
// _shared/tokenCrypto.ts, refresh the access_token with Google if
// expires_at has passed, then call the Gmail API — same for the WhatsApp
// Business Platform integration (README "WhatsApp"), still unbuilt. Do
// this after the insert below succeeds, before returning, so a DB row
// never exists without an attempted real delivery, and a delivery failure
// can be reflected back (e.g. an `estado_envio` column) instead of
// silently pretending it worked.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  let body: SendBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  const { conversacion_id, canal, cuerpo } = body;

  if (!conversacion_id || !canal || !cuerpo?.trim()) {
    return jsonResponse(400, { error: "conversacion_id, canal y cuerpo son obligatorios." });
  }
  if (!CANALES_VALIDOS.includes(canal)) {
    return jsonResponse(400, { error: `canal inválido. Use uno de: ${CANALES_VALIDOS.join(", ")}.` });
  }

  const conversacion = await loadConversacionForAccessCheck(conversacion_id);
  if (!conversacion) {
    return jsonResponse(404, { error: "Conversación no encontrada." });
  }
  if (!usuarioPuedeVerConversacion(auth.usuario, conversacion.responsableId)) {
    return jsonResponse(403, { error: "No tiene acceso a esta conversación." });
  }

  const admin = getSupabaseAdmin();

  let destinatario: string | null = null;
  if (conversacion.contactoId) {
    if (canal === "correo") {
      const { data } = await admin
        .from("contacto_correos")
        .select("correo")
        .eq("contacto_id", conversacion.contactoId)
        .order("es_principal", { ascending: false })
        .limit(1)
        .maybeSingle();
      destinatario = data?.correo ?? null;
    } else {
      const { data } = await admin
        .from("contacto_telefonos")
        .select("numero_e164")
        .eq("contacto_id", conversacion.contactoId)
        .order("es_principal", { ascending: false })
        .limit(1)
        .maybeSingle();
      destinatario = data?.numero_e164 ?? null;
    }
  }

  const { data: mensaje, error: insertError } = await admin
    .from("mensajes")
    .insert({
      conversacion_id,
      canal,
      direccion: "saliente",
      remitente: auth.usuario.correo,
      destinatarios: destinatario ? [destinatario] : null,
      cuerpo: cuerpo.trim(),
    })
    .select("id, canal, direccion, remitente, destinatarios, asunto, cuerpo, created_at")
    .single();

  if (insertError || !mensaje) {
    return jsonResponse(500, { error: "No fue posible guardar el mensaje." });
  }

  // TODO(real-send): dispatch via the connected buzón (see header comment
  // above) / WhatsApp Business Platform here. Nothing has actually been
  // sent to the contact at this point — only saved to our own database.

  await admin
    .from("conversaciones")
    .update({ estado: "abierta" })
    .eq("id", conversacion_id);

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "mensaje_saliente_creado",
    entidad: "mensajes",
    entidad_id: mensaje.id,
    estado_posterior: { conversacion_id, canal, direccion: "saliente" },
  });

  return jsonResponse(201, { mensaje });
};
