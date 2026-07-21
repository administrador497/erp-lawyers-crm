import type { Handler } from "@netlify/functions";
import { jsonResponse } from "./_shared/auth";

// TEMPORAL — diagnóstico para confirmar qué variables de entorno de Google
// OAuth ve realmente la función en producción (ver conversación sobre
// oauth-google-start.ts devolviendo "La integración de Google no está
// configurada en el servidor."). Sin autenticación a propósito: se revisa
// pegando la URL directo en el navegador, no con fetch autenticado. Nunca
// expone client_id/client_secret, solo si están presentes o no —
// redirect_uri sí se expone completo porque no es secreto (es la misma URL
// pública que ya está registrada en Google Cloud Console). Borrar este
// archivo en cuanto se confirme el diagnóstico.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  return jsonResponse(200, {
    clientIdPresent: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
    clientSecretPresent: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    redirectUriPresent: Boolean(process.env.GOOGLE_OAUTH_REDIRECT_URI),
    redirectUriValue: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? null,
  });
};
