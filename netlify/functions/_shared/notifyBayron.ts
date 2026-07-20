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
  const provider = process.env.TRANSACTIONAL_EMAIL_PROVIDER;
  const apiKey = process.env.TRANSACTIONAL_EMAIL_API_KEY;
  const from = process.env.TRANSACTIONAL_EMAIL_FROM;
  const appUrl = process.env.APP_BASE_URL ?? "";

  if (!provider || !apiKey || !from) {
    console.info(
      `[notifyBayron] Proveedor transaccional no configurado — se omite el correo para el lead ${params.leadId}.`
    );
    return;
  }

  const subject = `Nuevo lead sin asignar: ${params.contactoNombre}`;
  const textBody = `Ingresó un nuevo lead por ${params.canalOrigen}: ${params.contactoNombre}.\n\nRevíselo en la bandeja "Nuevos leads por asignar": ${appUrl}/leads`;

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
          To: "bayron@erplawyers.com",
          Subject: subject,
          TextBody: textBody,
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
          personalizations: [{ to: [{ email: "bayron@erplawyers.com" }] }],
          from: { email: from },
          subject,
          content: [{ type: "text/plain", value: textBody }],
        }),
      });
      return;
    }

    console.warn(`[notifyBayron] Proveedor transaccional desconocido: ${provider}.`);
  } catch (err) {
    console.error("[notifyBayron] Falló el envío del correo de notificación:", err);
  }
}
