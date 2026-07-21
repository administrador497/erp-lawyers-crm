// Correo transaccional (Postmark/SendGrid) para notificaciones automáticas
// del sistema — nunca correspondencia con clientes (eso es Gmail vía
// buzones_correo, ver _shared/gmailApi.ts/googleMailbox.ts). Se usa para
// avisos internos a cualquier usuario del CRM sin depender de que esa
// persona tenga un buzón de Gmail conectado — a diferencia del envío por
// Gmail, que es por-usuario y opcional, esto funciona igual para cualquier
// destinatario interno una vez configurado el proveedor.
async function sendTransactionalEmail(params: { to: string; subject: string; textBody: string }): Promise<void> {
  const provider = process.env.TRANSACTIONAL_EMAIL_PROVIDER;
  const apiKey = process.env.TRANSACTIONAL_EMAIL_API_KEY;
  const from = process.env.TRANSACTIONAL_EMAIL_FROM;

  if (!provider || !apiKey || !from) {
    console.info(`[transactionalEmail] Proveedor no configurado — se omite el correo a ${params.to}.`);
    return;
  }

  try {
    if (provider === "postmark") {
      await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Postmark-Server-Token": apiKey,
        },
        body: JSON.stringify({
          From: from,
          To: params.to,
          Subject: params.subject,
          TextBody: params.textBody,
        }),
      });
      return;
    }

    if (provider === "sendgrid") {
      await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: params.to }] }],
          from: { email: from },
          subject: params.subject,
          content: [{ type: "text/plain", value: params.textBody }],
        }),
      });
      return;
    }

    console.warn(`[transactionalEmail] Proveedor desconocido: ${provider}.`);
  } catch (err) {
    console.error("[transactionalEmail] Falló el envío:", err);
  }
}

// Best-effort transactional email to Bayron when a new lead lands in his
// queue. The in-app alert (row in `alertas`, written by the DB trigger in
// migrations/003_lead_assignment_rule.sql) is the durable source of truth —
// this is a courtesy notification and must never block or fail lead
// creation if the transactional provider isn't configured yet.
export async function notifyBayronOfNewLead(params: {
  leadId: string;
  contactoNombre: string;
  canalOrigen: string;
}) {
  const appUrl = process.env.APP_BASE_URL ?? "";
  const subject = `Nuevo lead sin asignar: ${params.contactoNombre}`;
  const textBody = `Ingresó un nuevo lead por ${params.canalOrigen}: ${params.contactoNombre}.\n\nRevíselo en la bandeja "Nuevos leads por asignar": ${appUrl}/leads`;

  await sendTransactionalEmail({ to: "bayron@erplawyers.com", subject, textBody });
}

const TIPO_ACTIVIDAD_LABEL: Record<string, string> = {
  llamada: "Llamada",
  correo: "Correo",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  tarea: "Tarea",
  recordatorio: "Recordatorio",
};

function formatFechaEs(iso: string): string {
  return new Date(iso).toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short" });
}

// Best-effort — igual que notifyBayronOfNewLead, nunca debe bloquear ni
// fallar la creación de la actividad si el proveedor transaccional no está
// configurado. Se llama desde activity-create.ts tanto si la actividad
// queda asignada al propio creador como a otra persona explícita.
export async function notifyActivityAssigned(params: {
  responsableCorreo: string;
  tipo: string;
  fecha: string;
  descripcion: string | null;
  contactoNombre: string;
  servicio: string | null;
}) {
  const appUrl = process.env.APP_BASE_URL ?? "";
  const tipoLabel = TIPO_ACTIVIDAD_LABEL[params.tipo] ?? params.tipo;

  const subject = `Nueva actividad: ${tipoLabel} — ${params.contactoNombre}`;
  const lineas = [
    `Se le asignó una actividad en el CRM.`,
    ``,
    `Tipo: ${tipoLabel}`,
    `Contacto/Lead: ${params.contactoNombre}${params.servicio ? ` (${params.servicio})` : ""}`,
    `Fecha y hora: ${formatFechaEs(params.fecha)}`,
    ...(params.descripcion ? [`Descripción: ${params.descripcion}`] : []),
    ``,
    `Verla en el CRM: ${appUrl}/calendario`,
  ];

  await sendTransactionalEmail({ to: params.responsableCorreo, subject, textBody: lineas.join("\n") });
}
