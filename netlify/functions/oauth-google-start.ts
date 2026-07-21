import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { createOauthState } from "./_shared/oauthState";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// gmail.readonly cubre listar/leer mensajes; gmail.send cubre el envío
// real que reemplazará el TODO(real-send) de messages-send.ts. No se pide
// gmail.modify (marcar leído, mover, archivar) porque nada de lo construido
// hasta ahora lo necesita — pedir de más solo aumenta lo que un usuario ve
// en la pantalla de consentimiento de Google sin beneficio real.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
].join(" ");

// GET /api/oauth-google-start — arma la URL de consentimiento de Google
// para el usuario autenticado. Devuelve la URL en vez de redirigir
// directamente porque esta función SÍ puede leer el header Authorization
// (el frontend la llama con fetch); oauth-google-callback.ts, en cambio, la
// visita Google como una navegación de nivel superior y no puede llevar
// ese header — de ahí el `state` firmado que se genera aquí.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return jsonResponse(500, { error: "La integración de Google no está configurada en el servidor." });
  }

  const state = createOauthState(auth.usuario.id);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline", // requerido para recibir refresh_token
    prompt: "consent", // fuerza a Google a reemitir refresh_token aunque ya se hubiera conectado antes
    include_granted_scopes: "true",
    state,
  });

  return jsonResponse(200, { url: `${GOOGLE_AUTH_URL}?${params.toString()}` });
};
