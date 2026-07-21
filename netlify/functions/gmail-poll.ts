import type { Handler } from "@netlify/functions";
import { jsonResponse } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { loadAllBuzonesGoogle, getValidAccessToken, type BuzonRow } from "./_shared/googleMailbox";
import { notifyBayronOfNewLead } from "./_shared/notifyBayron";
import {
  getGmailProfile,
  listGmailHistory,
  getGmailMessage,
  getGmailAttachment,
  extractEmail,
  extractDisplayName,
  type ParsedGmailMessage,
} from "./_shared/gmailApi";
import { uploadToS3, buildStorageKey } from "./_shared/s3Client";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

// POST /api/gmail-poll — recorre todos los buzones de Gmail conectados y
// procesa el correo entrante nuevo desde el último `gmail_history_id`
// guardado. No hay sesión de usuario en un cron job, así que se protege con
// un secreto compartido en vez de requireUser() — igual al patrón que ya
// usan los webhooks de WhatsApp/WordPress documentados en SETUP.md
// (secreto fijo en encabezado/env var, no JWT de usuario).
//
// "Simple polling invocable manual o por cron", tal como se pidió: esta
// función NO usa el helper `schedule()` de @netlify/functions (que registra
// un Netlify Scheduled Function real, invocable solo por el scheduler
// interno de Netlify) porque no se pudo verificar en este entorno si ese
// modo bloquea la invocación manual por HTTP que también se pidió. Queda
// como una función HTTP normal que cualquier programador de tareas externo
// (cron-job.org, GitHub Actions, un Netlify Scheduled Function que llame a
// esta URL, etc.) puede invocar con el secreto — ver SETUP.md para cómo
// conectarla a un cron real.
//
// TODO(mejora-futura): reemplazar este polling por push notifications de
// Gmail vía Google Cloud Pub/Sub (users.watch) para recibir el correo casi
// en tiempo real en vez de cada N minutos — requiere configurar un tópico
// de Pub/Sub y un endpoint que verifique las notificaciones firmadas de
// Google, fuera de alcance de esta implementación inicial.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const secretoEsperado = process.env.CRON_POLL_SECRET;
  const secretoRecibido = event.headers["x-cron-secret"] ?? event.headers["X-Cron-Secret"];
  if (!secretoEsperado || secretoRecibido !== secretoEsperado) {
    return jsonResponse(401, { error: "No autorizado." });
  }

  const admin = getSupabaseAdmin();
  const buzones = await loadAllBuzonesGoogle();

  const resultados = [];
  for (const buzon of buzones) {
    resultados.push(await pollBuzon(admin, buzon));
  }

  return jsonResponse(200, { resultados });
};

async function pollBuzon(admin: SupabaseAdmin, buzon: BuzonRow) {
  const accessToken = await getValidAccessToken(buzon);
  if (!accessToken) {
    return { buzon_id: buzon.id, correo: buzon.correo, ok: false, motivo: "sin_access_token_valido" };
  }

  if (!buzon.gmail_history_id) {
    // Primera vez: solo establece la línea base, no procesa nada — evitar
    // importar todo el historial existente del buzón como leads.
    const profile = await getGmailProfile(accessToken);
    if (!profile) {
      return { buzon_id: buzon.id, correo: buzon.correo, ok: false, motivo: "no_fue_posible_leer_perfil" };
    }
    await admin
      .from("buzones_correo")
      .update({ gmail_history_id: profile.historyId, ultimo_poll_en: new Date().toISOString() })
      .eq("id", buzon.id);
    return { buzon_id: buzon.id, correo: buzon.correo, ok: true, mensajes_nuevos: 0, motivo: "linea_base_establecida" };
  }

  const historial = await listGmailHistory(accessToken, buzon.gmail_history_id);

  if ("error" in historial) {
    if (historial.error === "historyId_expirado") {
      const profile = await getGmailProfile(accessToken);
      if (profile) {
        await admin
          .from("buzones_correo")
          .update({ gmail_history_id: profile.historyId, ultimo_poll_en: new Date().toISOString() })
          .eq("id", buzon.id);
      }
      return { buzon_id: buzon.id, correo: buzon.correo, ok: false, motivo: "historyId_expirado_reiniciado" };
    }
    return { buzon_id: buzon.id, correo: buzon.correo, ok: false, motivo: historial.error };
  }

  let procesados = 0;
  for (const messageId of historial.messageIds) {
    try {
      const { data: existente } = await admin
        .from("mensajes")
        .select("id")
        .eq("identificador_externo", messageId)
        .maybeSingle();
      if (existente) continue;

      const creado = await procesarMensajeEntrante(admin, buzon, accessToken, messageId);
      if (creado) procesados++;
    } catch (err) {
      await admin.from("errores_integracion").insert({
        origen: "correo",
        payload: { buzon_id: buzon.id, gmail_message_id: messageId },
        error_detalle: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await admin
    .from("buzones_correo")
    .update({ gmail_history_id: historial.historyId, ultimo_poll_en: new Date().toISOString() })
    .eq("id", buzon.id);

  return { buzon_id: buzon.id, correo: buzon.correo, ok: true, mensajes_nuevos: procesados };
}

// Devuelve true si se creó un mensaje entrante, false si se descartó
// (copia de un correo saliente propio, remitente es el dueño del buzón,
// etc. — no es un error, solo no había nada que registrar).
async function procesarMensajeEntrante(
  admin: SupabaseAdmin,
  buzon: BuzonRow,
  accessToken: string,
  messageId: string
): Promise<boolean> {
  const gmailMsg = await getGmailMessage(accessToken, messageId);
  if (!gmailMsg) {
    throw new Error("No fue posible obtener el mensaje completo desde la API de Gmail.");
  }

  // El historial de Gmail incluye TODO lo que se agrega a cualquier label,
  // incluida la copia en "Enviados" de lo que este mismo buzón mandó (por
  // ejemplo, vía messages-send.ts) — sin este filtro, cada envío nuestro se
  // reprocesaría aquí como si fuera un mensaje entrante nuevo.
  if (!gmailMsg.labelIds.includes("INBOX") || gmailMsg.labelIds.includes("SENT")) {
    return false;
  }

  const remitente = extractEmail(gmailMsg.headers.from);
  if (!remitente) {
    throw new Error("No fue posible extraer el correo del remitente del header From.");
  }
  if (remitente === buzon.correo.toLowerCase()) {
    return false; // el dueño del buzón enviándose algo a sí mismo — no es un lead
  }

  let contactoId = await buscarContactoPorCorreo(admin, remitente);
  let leadId: string;
  let conversacionId: string;
  let esLeadNuevo = false;

  let conversacionExistente: { id: string; lead_id: string; contacto_id: string | null } | null = null;
  if (gmailMsg.threadId) {
    const { data } = await admin
      .from("conversaciones")
      .select("id, lead_id, contacto_id")
      .eq("hilo_externo_id", gmailMsg.threadId)
      .maybeSingle();
    conversacionExistente = data;
  }

  if (conversacionExistente) {
    conversacionId = conversacionExistente.id;
    leadId = conversacionExistente.lead_id;
    contactoId = conversacionExistente.contacto_id ?? contactoId;
  } else {
    if (!contactoId) {
      contactoId = await crearContacto(admin, remitente, gmailMsg.headers.from);
    }
    leadId = await crearLead(admin, contactoId, gmailMsg);
    esLeadNuevo = true;
    conversacionId = await crearConversacion(admin, leadId, contactoId, gmailMsg.threadId);
  }

  const { data: mensajeCreado, error: insertError } = await admin
    .from("mensajes")
    .insert({
      conversacion_id: conversacionId,
      canal: "correo",
      direccion: "entrante",
      remitente,
      destinatarios: [buzon.correo],
      asunto: gmailMsg.headers.subject,
      cuerpo: gmailMsg.bodyText,
      identificador_externo: gmailMsg.id,
      referencias_hilo: gmailMsg.headers.messageId,
    })
    .select("id")
    .single();

  if (insertError || !mensajeCreado) {
    // No cuenta como procesado: sin identificador_externo guardado, el
    // chequeo de duplicados de pollBuzon no lo encontrará, así que el
    // próximo poll lo vuelve a intentar solo.
    throw new Error(`No fue posible guardar el mensaje entrante: ${insertError?.message}`);
  }

  await admin.from("conversaciones").update({ estado: "abierta" }).eq("id", conversacionId);

  // Adjuntos entrantes: se bajan de Gmail y se suben a S3 uno por uno. Un
  // adjunto que falle no descarta el mensaje ya guardado (ni a los demás
  // adjuntos) — queda registrado en errores_integracion para revisar aparte.
  for (const adjunto of gmailMsg.attachments) {
    if (!adjunto.attachmentId) continue;
    try {
      const contenido = await getGmailAttachment(accessToken, gmailMsg.id, adjunto.attachmentId);
      if (!contenido) {
        throw new Error("La API de Gmail no devolvió los bytes del adjunto.");
      }
      const key = buildStorageKey(leadId, adjunto.filename);
      await uploadToS3(key, contenido, adjunto.mimeType);
      await admin.from("archivos").insert({
        mensaje_id: mensajeCreado.id,
        lead_id: leadId,
        nombre_original: adjunto.filename,
        tipo_mime: adjunto.mimeType,
        tamano_bytes: contenido.length,
        ruta_almacenamiento: key,
      });
    } catch (err) {
      console.error(`[gmail-poll] No fue posible descargar/guardar el adjunto "${adjunto.filename}":`, err);
      await admin.from("errores_integracion").insert({
        origen: "correo",
        payload: { mensaje_id: mensajeCreado.id, gmail_message_id: gmailMsg.id, nombre: adjunto.filename },
        error_detalle: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (esLeadNuevo) {
    await notifyBayronOfNewLead({
      leadId,
      contactoNombre: extractDisplayName(gmailMsg.headers.from) ?? remitente,
      canalOrigen: "correo",
    });
  }

  return true;
}

async function buscarContactoPorCorreo(admin: SupabaseAdmin, correo: string): Promise<string | null> {
  const { data } = await admin.from("contacto_correos").select("contacto_id").eq("correo", correo).maybeSingle();
  return data?.contacto_id ?? null;
}

async function crearContacto(admin: SupabaseAdmin, correo: string, fromHeaderRaw: string | null): Promise<string> {
  const nombre = extractDisplayName(fromHeaderRaw) ?? correo;
  const { data, error } = await admin.from("contactos").insert({ nombre }).select("id").single();
  if (error || !data) throw new Error(`No fue posible crear el contacto: ${error?.message}`);

  await admin.from("contacto_correos").insert({ contacto_id: data.id, correo, es_principal: true });
  return data.id;
}

async function crearLead(admin: SupabaseAdmin, contactoId: string, gmailMsg: ParsedGmailMessage): Promise<string> {
  const mensajeRecibido = [gmailMsg.headers.subject, gmailMsg.bodyText].filter(Boolean).join("\n\n").slice(0, 2000);

  const { data, error } = await admin
    .from("leads")
    .insert({
      contacto_id: contactoId,
      canal_origen: "correo",
      fuente: "Gmail",
      mensaje_recibido: mensajeRecibido || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`No fue posible crear el lead: ${error?.message}`);
  return data.id;
}

async function crearConversacion(
  admin: SupabaseAdmin,
  leadId: string,
  contactoId: string | null,
  threadId: string | null
): Promise<string> {
  const { data, error } = await admin
    .from("conversaciones")
    .insert({ lead_id: leadId, contacto_id: contactoId, hilo_externo_id: threadId, estado: "abierta" })
    .select("id")
    .single();

  if (error || !data) throw new Error(`No fue posible crear la conversación: ${error?.message}`);
  return data.id;
}
