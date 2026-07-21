import { getSupabaseAdmin } from "./supabaseAdmin";
import { decryptToken, encryptToken } from "./tokenCrypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const EXPIRY_SAFETY_MARGIN_MS = 60_000; // renueva si vence en menos de 1 minuto

export type BuzonRow = {
  id: string;
  usuario_id: string;
  proveedor: string;
  correo: string;
  access_token_cifrado: string;
  refresh_token_cifrado: string;
  expires_at: string;
  gmail_history_id: string | null;
};

const BUZON_SELECT =
  "id, usuario_id, proveedor, correo, access_token_cifrado, refresh_token_cifrado, expires_at, gmail_history_id";

// Buzón de Google del usuario autenticado — usado por messages-send.ts para
// saber con qué cuenta enviar (o si no hay ninguna conectada, en cuyo caso
// el llamador debe seguir con el comportamiento actual de solo guardar en
// Supabase).
export async function loadBuzonGoogle(usuarioId: string): Promise<BuzonRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("buzones_correo")
    .select(BUZON_SELECT)
    .eq("usuario_id", usuarioId)
    .eq("proveedor", "google")
    .maybeSingle();

  if (error || !data) return null;
  return data as BuzonRow;
}

// Todos los buzones de Google conectados — usado por gmail-poll.ts para
// recorrerlos uno por uno.
export async function loadAllBuzonesGoogle(): Promise<BuzonRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("buzones_correo").select(BUZON_SELECT).eq("proveedor", "google");

  if (error || !data) return [];
  return data as BuzonRow[];
}

type RefreshResult = { accessToken: string } | { error: string };

async function refreshAccessToken(buzon: BuzonRow): Promise<RefreshResult> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { error: "oauth_no_configurado" };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(buzon.refresh_token_cifrado);
  } catch (err) {
    return { error: `no_fue_posible_descifrar_refresh_token: ${err instanceof Error ? err.message : String(err)}` };
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!res.ok || !body.access_token) {
    // El refresh_token puede haber sido revocado (el usuario le quitó
    // acceso a la app desde su cuenta de Google, cambió su contraseña, o
    // pasaron más de 6 meses sin usarlo) — no hay forma de recuperarlo
    // automáticamente, debe reconectar desde Mi perfil.
    return { error: body.error ?? `refresh_http_${res.status}` };
  }

  const admin = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString();
  const { error: updateError } = await admin
    .from("buzones_correo")
    .update({
      access_token_cifrado: encryptToken(body.access_token),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", buzon.id);

  if (updateError) {
    console.error("[googleMailbox] No fue posible guardar el access_token renovado:", updateError.message);
  }

  return { accessToken: body.access_token };
}

// Access token utilizable para `buzon`, renovándolo primero si ya venció o
// está por vencer. null si no se pudo obtener uno válido — quien llama debe
// tratarlo igual que "no hay buzón conectado" (nunca reventar la función
// que lo pidió).
export async function getValidAccessToken(buzon: BuzonRow): Promise<string | null> {
  const expiresAtMs = new Date(buzon.expires_at).getTime();
  const stillValid = Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > EXPIRY_SAFETY_MARGIN_MS;

  if (stillValid) {
    try {
      return decryptToken(buzon.access_token_cifrado);
    } catch (err) {
      console.error(`[googleMailbox] No fue posible descifrar el access_token del buzón ${buzon.id}:`, err);
      // sigue abajo e intenta renovarlo de todas formas
    }
  }

  const result = await refreshAccessToken(buzon);
  if ("error" in result) {
    console.error(`[googleMailbox] No fue posible renovar el access_token del buzón ${buzon.id}: ${result.error}`);
    return null;
  }
  return result.accessToken;
}
