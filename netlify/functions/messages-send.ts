import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { loadConversacionForAccessCheck, usuarioPuedeVerConversacion } from "./_shared/conversationAccess";
import { loadBuzonGoogle, getValidAccessToken } from "./_shared/googleMailbox";
import { buildRawEmail, sendGmailMessage, getSentMessageHeaderId } from "./_shared/gmailApi";

const CANALES_VALIDOS = ["correo", "whatsapp"];
const ASUNTO_POR_DEFECTO = "Mensaje de ERP Lawyers & Associates";

type SendBody = {
  conversacion_id?: string;
  canal?: string;
  cuerpo?: string;
};

// POST /api/messages-send  { conversacion_id, canal, cuerpo }
//
// Cuando canal='correo' y el remitente tiene un buzón de Gmail conectado
// (buzones_correo) con un destinatario resoluble, envía de verdad vía la
// Gmail API antes de guardar nada — así nunca queda una fila en `mensajes`
// que aparente haberse enviado sin que Google realmente lo haya aceptado.
// Si no hay buzón conectado (o el canal es whatsapp, aún sin integrar),
// sigue el comportamiento anterior: solo persiste en Supabase.
//
// TODO(real-send-whatsapp): igual que el correo tenía su TODO antes de
// conectarse a Gmail — falta la integración con WhatsApp Business Platform
// (README "WhatsApp"). Sigue sin implementar.
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

  // --- Intento de envío real por Gmail (solo canal correo + buzón conectado) ---
  let asuntoEnviado: string | null = null;
  let identificadorExterno: string | null = null;
  let referenciasHilo: string | null = null;
  let nuevoHiloExternoId: string | null = null;
  let enviadoRealmente = false;

  if (canal === "correo" && destinatario) {
    const buzon = await loadBuzonGoogle(auth.usuario.id);

    if (buzon) {
      const accessToken = await getValidAccessToken(buzon);

      if (!accessToken) {
        await admin.from("errores_integracion").insert({
          origen: "correo",
          payload: { conversacion_id, usuario_id: auth.usuario.id, buzon_id: buzon.id },
          error_detalle: "No fue posible obtener un access_token válido (ver logs de _shared/googleMailbox).",
        });
        return jsonResponse(502, {
          error: "Su buzón de Gmail no está disponible en este momento. Reconéctelo desde Mi perfil e intente de nuevo.",
        });
      }

      // Contexto del hilo: el último mensaje de correo de esta conversación
      // (en cualquier dirección) trae el asunto y el Message-ID a encadenar.
      const { data: ultimosCorreo } = await admin
        .from("mensajes")
        .select("asunto, identificador_externo, referencias_hilo")
        .eq("conversacion_id", conversacion_id)
        .eq("canal", "correo")
        .order("created_at", { ascending: false })
        .limit(5);

      const ultimoConAsunto = (ultimosCorreo ?? []).find((m) => m.asunto);
      const ultimoConReferencia = (ultimosCorreo ?? [])[0];

      asuntoEnviado = ultimoConAsunto?.asunto
        ? ultimoConAsunto.asunto.toLowerCase().startsWith("re:")
          ? ultimoConAsunto.asunto
          : `Re: ${ultimoConAsunto.asunto}`
        : ASUNTO_POR_DEFECTO;

      const raw = buildRawEmail({
        from: buzon.correo,
        to: destinatario,
        subject: asuntoEnviado ?? ASUNTO_POR_DEFECTO,
        body: cuerpo.trim(),
        inReplyTo: ultimoConReferencia?.referencias_hilo ?? null,
        references: ultimoConReferencia?.referencias_hilo ?? null,
      });

      const envio = await sendGmailMessage(accessToken, raw, conversacion.hiloExternoId ?? undefined);

      if ("error" in envio) {
        await admin.from("errores_integracion").insert({
          origen: "correo",
          payload: { conversacion_id, usuario_id: auth.usuario.id, buzon_id: buzon.id, destinatario },
          error_detalle: envio.error,
        });
        return jsonResponse(502, { error: "No fue posible enviar el correo. Intente de nuevo." });
      }

      enviadoRealmente = true;
      identificadorExterno = envio.id;
      if (!conversacion.hiloExternoId) {
        nuevoHiloExternoId = envio.threadId;
      }
      // Best-effort — nunca debe deshacer un envío que ya salió.
      referenciasHilo = await getSentMessageHeaderId(accessToken, envio.id);
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
      asunto: asuntoEnviado,
      cuerpo: cuerpo.trim(),
      identificador_externo: identificadorExterno,
      referencias_hilo: referenciasHilo,
    })
    .select("id, canal, direccion, remitente, destinatarios, asunto, cuerpo, created_at")
    .single();

  if (insertError || !mensaje) {
    // El correo ya salió por Gmail en este punto si enviadoRealmente=true —
    // no hay forma de "deshacerlo". Queda registrado en errores_integracion
    // para que alguien lo reconcilie manualmente en vez de perderse.
    if (enviadoRealmente) {
      await admin.from("errores_integracion").insert({
        origen: "correo",
        payload: { conversacion_id, identificador_externo: identificadorExterno },
        error_detalle: `Correo enviado por Gmail pero no se pudo guardar en mensajes: ${insertError?.message}`,
      });
    }
    return jsonResponse(500, { error: "No fue posible guardar el mensaje." });
  }

  if (nuevoHiloExternoId) {
    await admin.from("conversaciones").update({ hilo_externo_id: nuevoHiloExternoId }).eq("id", conversacion_id);
  }

  await admin
    .from("conversaciones")
    .update({ estado: "abierta" })
    .eq("id", conversacion_id);

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "mensaje_saliente_creado",
    entidad: "mensajes",
    entidad_id: mensaje.id,
    estado_posterior: { conversacion_id, canal, direccion: "saliente", enviado_realmente: enviadoRealmente },
  });

  return jsonResponse(201, { mensaje });
};
