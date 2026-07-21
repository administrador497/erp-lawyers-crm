import { randomBytes } from "crypto";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// ---------------------------------------------------------------------------
// Perfil — solo se usa para leer el historyId actual (línea base para el
// primer poll de un buzón, o para reiniciar cuando Gmail purga uno viejo).
// ---------------------------------------------------------------------------
export async function getGmailProfile(accessToken: string): Promise<{ historyId: string } | null> {
  const res = await fetch(`${GMAIL_API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { historyId?: string | number };
  return body.historyId !== undefined ? { historyId: String(body.historyId) } : null;
}

// ---------------------------------------------------------------------------
// Historial — lista mensajes nuevos desde startHistoryId. Solo pide
// historyTypes=messageAdded (no nos interesan labelAdded/labelRemoved para
// este propósito). Pagina hasta agotar nextPageToken.
// ---------------------------------------------------------------------------
type HistoryResult = { historyId: string; messageIds: string[] } | { error: string };

export async function listGmailHistory(accessToken: string, startHistoryId: string): Promise<HistoryResult> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${GMAIL_API_BASE}/history?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) {
      // Gmail purga historyId viejos (~1 semana) — no es un error real,
      // solo significa que hay que reiniciar la línea base.
      return { error: "historyId_expirado" };
    }
    if (!res.ok) {
      return { error: `gmail_history_http_${res.status}` };
    }

    const body = (await res.json().catch(() => ({}))) as {
      history?: { messagesAdded?: { message?: { id?: string } }[] }[];
      historyId?: string | number;
      nextPageToken?: string;
    };

    for (const h of body.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) messageIds.add(m.message.id);
      }
    }
    if (body.historyId !== undefined) latestHistoryId = String(body.historyId);
    pageToken = body.nextPageToken;
  } while (pageToken);

  return { historyId: latestHistoryId, messageIds: Array.from(messageIds) };
}

// ---------------------------------------------------------------------------
// Mensaje completo — camina el árbol MIME (payload.parts anidados) para
// sacar el cuerpo de texto y la lista de adjuntos (metadata: nombre, tipo,
// tamaño, attachmentId). Los bytes de cada adjunto se piden aparte con
// getGmailAttachment() más abajo — separado porque puede haber varios
// adjuntos y no siempre hace falta bajarlos todos a la vez.
// ---------------------------------------------------------------------------
export type ParsedGmailMessage = {
  id: string;
  threadId: string | null;
  labelIds: string[];
  headers: { from: string | null; subject: string | null; messageId: string | null };
  bodyText: string;
  attachments: { filename: string; mimeType: string; size: number; attachmentId: string }[];
};

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function walkParts(
  part: GmailPart | undefined,
  acc: { text: string | null; html: string | null; attachments: ParsedGmailMessage["attachments"] }
) {
  if (!part) return;

  if (part.filename) {
    acc.attachments.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
      attachmentId: part.body?.attachmentId ?? "",
    });
    return;
  }

  if (part.mimeType === "text/plain" && part.body?.data) {
    acc.text = decodeBase64Url(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data) {
    acc.html = decodeBase64Url(part.body.data);
  }

  for (const sub of part.parts ?? []) walkParts(sub, acc);
}

export async function getGmailMessage(accessToken: string, messageId: string): Promise<ParsedGmailMessage | null> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    threadId?: string;
    labelIds?: string[];
    payload?: GmailPart & { headers?: { name: string; value: string }[] };
  };
  if (!body.id) return null;

  const headersList = body.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headersList.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

  const acc: { text: string | null; html: string | null; attachments: ParsedGmailMessage["attachments"] } = {
    text: null,
    html: null,
    attachments: [],
  };
  walkParts(body.payload, acc);

  return {
    id: body.id,
    threadId: body.threadId ?? null,
    labelIds: body.labelIds ?? [],
    headers: {
      from: getHeader("From"),
      subject: getHeader("Subject"),
      messageId: getHeader("Message-ID") ?? getHeader("Message-Id"),
    },
    bodyText: acc.text ?? (acc.html ? stripHtml(acc.html) : ""),
    attachments: acc.attachments,
  };
}

// Bytes de un adjunto puntual de un mensaje ya conocido (id + attachmentId
// vienen de ParsedGmailMessage.attachments, arriba).
export async function getGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { data?: string };
  if (!body.data) return null;
  return Buffer.from(body.data, "base64url");
}

// "Nombre Apellido" <correo@dominio.com>  →  correo@dominio.com
export function extractEmail(fromHeader: string | null): string | null {
  if (!fromHeader) return null;
  const match = fromHeader.match(/<([^>]+)>/);
  const email = (match ? match[1] : fromHeader).trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? email : null;
}

// "Nombre Apellido" <correo@dominio.com>  →  Nombre Apellido
export function extractDisplayName(fromHeader: string | null): string | null {
  if (!fromHeader) return null;
  const match = fromHeader.match(/^"?([^"<]+)"?\s*<[^>]+>$/);
  const name = match?.[1]?.trim();
  return name || null;
}

// ---------------------------------------------------------------------------
// Envío — construye el mensaje RFC 2822 crudo (base64url, como pide la API)
// y lo manda. El cuerpo va en base64 (no 7bit/quoted-printable) para no
// arriesgar corromper tildes/eñes del español al cruzar servidores.
// ---------------------------------------------------------------------------
function encodeHeaderValue(value: string): string {
  // RFC 2047 — evita que un asunto con tildes llegue roto en el header crudo.
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export type EmailAttachment = { filename: string; mimeType: string; content: Buffer };

function base64Lines(data: Buffer | string): string[] {
  const base64 = Buffer.isBuffer(data) ? data.toString("base64") : Buffer.from(data, "utf8").toString("base64");
  return base64.match(/.{1,76}/g) ?? [""]; // RFC 2045: máx 76 caracteres por línea
}

export function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: EmailAttachment[];
}): string {
  const headerLines = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeaderValue(params.subject)}`,
    `MIME-Version: 1.0`,
  ];
  if (params.inReplyTo) headerLines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headerLines.push(`References: ${params.references}`);

  if (!params.attachments || params.attachments.length === 0) {
    headerLines.push(`Content-Type: text/plain; charset="UTF-8"`, `Content-Transfer-Encoding: base64`);
    const raw = [...headerLines, "", ...base64Lines(params.body)].join("\r\n");
    return Buffer.from(raw, "utf8").toString("base64url");
  }

  // Con adjuntos: multipart/mixed — una parte de texto + una parte por
  // adjunto, cada una en su propio bloque delimitado por boundary.
  const boundary = `----erplawyers-${randomBytes(12).toString("hex")}`;
  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    "",
    ...base64Lines(params.body),
  ];

  for (const attachment of params.attachments) {
    const filenameHeader = encodeHeaderValue(attachment.filename);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType || "application/octet-stream"}; name="${filenameHeader}"`,
      `Content-Disposition: attachment; filename="${filenameHeader}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      ...base64Lines(attachment.content)
    );
  }
  parts.push(`--${boundary}--`);

  const raw = [...headerLines, "", ...parts].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

export async function sendGmailMessage(
  accessToken: string,
  raw: string,
  threadId?: string | null
): Promise<{ id: string; threadId: string } | { error: string }> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    threadId?: string;
    error?: { message?: string };
  };

  if (!res.ok || !body.id || !body.threadId) {
    return { error: body.error?.message ?? `gmail_send_http_${res.status}` };
  }
  return { id: body.id, threadId: body.threadId };
}

// Tras enviar, Gmail solo devuelve {id, threadId} — no el header Message-ID
// RFC822 que necesitamos para encadenar la PRÓXIMA respuesta (In-Reply-To/
// References). Se pide aparte, en modo metadata (liviano, sin bajar el
// cuerpo otra vez). Nunca debe tumbar el envío si falla — el mensaje ya se
// mandó; en el peor caso, la siguiente respuesta de este lado no queda
// perfectamente encadenada para clientes no-Gmail (Gmail igual la asocia
// bien por threadId).
export async function getSentMessageHeaderId(accessToken: string, messageId: string): Promise<string | null> {
  const params = new URLSearchParams({ format: "metadata", metadataHeaders: "Message-Id" });
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { payload?: { headers?: { name: string; value: string }[] } };
  return body.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value ?? null;
}
