import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { verifyOauthState } from "./_shared/oauthState";
import { encryptToken } from "./_shared/tokenCrypto";
import { getGmailProfile } from "./_shared/gmailApi";

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
  error_description?: string;
};

// LOG TEMPORAL — mismo motivo que netlify/functions/diag-env.ts: el
// callback termina en /perfil tanto si todo salió bien como si algo falló
// (la única señal visible es qué query param trae la redirección), así que
// esto es lo único que deja ver, desde los logs de Netlify, en qué paso se
// rompió. console.error (no console.log) a propósito: en el dashboard de
// Netlify los niveles error/warn suelen destacarse o poder filtrarse aparte
// del resto del ruido. Nunca imprime tokens/client_secret — solo
// booleans/longitudes/mensajes de error, igual que diag-env.ts. Quitar
// junto con diag-env.ts en cuanto se confirme el diagnóstico.
function logStep(step: string, detail: Record<string, unknown>) {
  console.error(`[oauth-google-callback] ${step}`, JSON.stringify(detail));
}

// GET /api/oauth-google-callback?code=...&state=...  — Google redirige aquí
// al navegador después del consentimiento. No hay header Authorization
// disponible (es una navegación del navegador, no un fetch nuestro); el
// usuario se identifica por completo a través del `state` firmado que
// generó oauth-google-start.ts. Este endpoint es, por naturaleza, público
// (Google es quien lo llama) — la autenticidad la da el `state`, no una
// sesión.
export const handler: Handler = async (event) => {
  const { code, state, error: googleError } = event.queryStringParameters ?? {};
  logStep("inicio", { codePresente: Boolean(code), statePresente: Boolean(state), googleError: googleError ?? null });

  if (googleError) {
    return redirectToPerfil("correo_error=consentimiento_denegado");
  }
  if (!code || !state) {
    return redirectToPerfil("correo_error=solicitud_invalida");
  }

  const verified = verifyOauthState(state);
  logStep("verificacion_state", { valido: Boolean(verified), usuarioId: verified?.usuario_id ?? null });
  if (!verified) {
    return redirectToPerfil("correo_error=estado_invalido_o_expirado");
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  logStep("variables_entorno", {
    clientIdPresente: Boolean(clientId),
    clientSecretPresente: Boolean(clientSecret),
    redirectUriPresente: Boolean(redirectUri),
  });
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
  logStep("intercambio_code_por_tokens", {
    httpStatus: tokenRes.status,
    ok: tokenRes.ok,
    accessTokenPresente: Boolean(tokenBody.access_token),
    refreshTokenPresente: Boolean(tokenBody.refresh_token),
    // Estos dos SÍ vienen de Google en texto plano cuando falla (p.ej.
    // "redirect_uri_mismatch", "invalid_client") — no son nuestro secreto,
    // son el motivo exacto del rechazo y valen oro para diagnosticar.
    googleError: tokenBody.error ?? null,
    googleErrorDescription: tokenBody.error_description ?? null,
  });

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
  logStep("userinfo", { httpStatus: userInfoRes.status, ok: userInfoRes.ok, emailPresente: Boolean(userInfo.email) });
  if (!userInfoRes.ok || !userInfo.email) {
    return redirectToPerfil("correo_error=no_fue_posible_leer_el_correo");
  }

  const admin = getSupabaseAdmin();

  const { data: usuario, error: usuarioError } = await admin
    .from("usuarios")
    .select("id, activo")
    .eq("id", verified.usuario_id)
    .maybeSingle();
  logStep("busqueda_usuario", {
    encontrado: Boolean(usuario),
    activo: usuario?.activo ?? null,
    supabaseError: usuarioError?.message ?? null,
  });

  if (!usuario || !usuario.activo) {
    return redirectToPerfil("correo_error=usuario_invalido");
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (tokenBody.expires_in ?? 3600) * 1000).toISOString();

  // Línea base para gmail-poll.ts: sin esto, el primer poll no tendría
  // desde dónde arrancar y tendría que decidir (a ciegas) si importar todo
  // el historial del buzón como leads — nunca lo que se quiere. Si esto
  // falla, se deja null a propósito: gmail-poll.ts sabe establecer la línea
  // base él mismo en su primera corrida, sin procesar nada ese primer poll.
  const profile = await getGmailProfile(tokenBody.access_token);
  logStep("perfil_gmail_inicial", { historyIdObtenido: Boolean(profile) });

  let accessTokenCifrado: string;
  let refreshTokenCifrado: string;
  try {
    accessTokenCifrado = encryptToken(tokenBody.access_token);
    refreshTokenCifrado = encryptToken(tokenBody.refresh_token);
    logStep("cifrado", { ok: true });
  } catch (err) {
    // encryptToken lanza si falta TOKEN_ENCRYPTION_KEY o no decodifica a 32
    // bytes — sin este try/catch esa excepción quedaba sin capturar y
    // rompía la función entera en vez de terminar en una redirección
    // legible con el motivo.
    logStep("cifrado", { ok: false, error: err instanceof Error ? err.message : String(err) });
    return redirectToPerfil("correo_error=cifrado_fallido");
  }

  const { data: buzon, error: upsertError } = await admin
    .from("buzones_correo")
    .upsert(
      {
        usuario_id: usuario.id,
        proveedor: "google",
        correo: userInfo.email,
        access_token_cifrado: accessTokenCifrado,
        refresh_token_cifrado: refreshTokenCifrado,
        expires_at: expiresAt,
        gmail_history_id: profile?.historyId ?? null,
        conectado_en: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "usuario_id,proveedor" }
    )
    .select("id")
    .single();
  logStep("upsert_buzones_correo", {
    ok: Boolean(buzon) && !upsertError,
    buzonId: buzon?.id ?? null,
    supabaseErrorCode: upsertError?.code ?? null,
    supabaseErrorMessage: upsertError?.message ?? null,
    supabaseErrorDetails: upsertError?.details ?? null,
    supabaseErrorHint: upsertError?.hint ?? null,
  });

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

  logStep("fin", { resultado: "correo_conectado" });
  return redirectToPerfil("correo_conectado=1");
};
