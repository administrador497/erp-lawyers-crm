import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { verifyOauthState } from "./_shared/oauthState";
import { encryptToken } from "./_shared/tokenCrypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function redirectToPerfil(query: string) {
  return {
    statusCode: 302,
    headers: { Location: `/perfil?${query}` },
  };
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

// GET /api/oauth-google-callback?code=...&state=...  — Google redirige aquí
// al navegador después del consentimiento. No hay header Authorization
// disponible (es una navegación del navegador, no un fetch nuestro); el
// usuario se identifica por completo a través del `state` firmado que
// generó oauth-google-start.ts. Este endpoint es, por naturaleza, público
// (Google es quien lo llama) — la autenticidad la da el `state`, no una
// sesión.
export const handler: Handler = async (event) => {
  const { code, state, error: googleError } = event.queryStringParameters ?? {};

  if (googleError) {
    return redirectToPerfil("correo_error=consentimiento_denegado");
  }
  if (!code || !state) {
    return redirectToPerfil("correo_error=solicitud_invalida");
  }

  const verified = verifyOauthState(state);
  if (!verified) {
    return redirectToPerfil("correo_error=estado_invalido_o_expirado");
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return redirectToPerfil("correo_error=oauth_no_configurado");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenBody = (await tokenRes.json().catch(() => ({}))) as GoogleTokenResponse;

  if (!tokenRes.ok || !tokenBody.access_token || !tokenBody.refresh_token) {
    // Falta de refresh_token casi siempre pasa si Google ya lo había
    // emitido antes y esta vez no reconsintió — no debería ocurrir porque
    // oauth-google-start.ts siempre pide prompt=consent, pero se rechaza
    // explícitamente en vez de guardar un buzón que dejaría de funcionar en
    // silencio en cuanto venza el access_token actual.
    return redirectToPerfil("correo_error=intercambio_de_token_fallido");
  }

  const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const userInfo = (await userInfoRes.json().catch(() => ({}))) as { email?: string };
  if (!userInfoRes.ok || !userInfo.email) {
    return redirectToPerfil("correo_error=no_fue_posible_leer_el_correo");
  }

  const admin = getSupabaseAdmin();

  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, activo")
    .eq("id", verified.usuario_id)
    .maybeSingle();

  if (!usuario || !usuario.activo) {
    return redirectToPerfil("correo_error=usuario_invalido");
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (tokenBody.expires_in ?? 3600) * 1000).toISOString();

  const { data: buzon, error: upsertError } = await admin
    .from("buzones_correo")
    .upsert(
      {
        usuario_id: usuario.id,
        proveedor: "google",
        correo: userInfo.email,
        access_token_cifrado: encryptToken(tokenBody.access_token),
        refresh_token_cifrado: encryptToken(tokenBody.refresh_token),
        expires_at: expiresAt,
        conectado_en: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "usuario_id,proveedor" }
    )
    .select("id")
    .single();

  if (upsertError || !buzon) {
    return redirectToPerfil("correo_error=no_fue_posible_guardar_el_buzon");
  }

  await admin.from("auditoria").insert({
    usuario_id: usuario.id,
    accion: "buzon_correo_conectado",
    entidad: "buzones_correo",
    entidad_id: buzon.id,
    estado_posterior: { proveedor: "google", correo: userInfo.email },
  });

  return redirectToPerfil("correo_conectado=1");
};
