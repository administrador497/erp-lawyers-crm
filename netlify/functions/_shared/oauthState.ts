import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

// Signed, short-lived `state` param for the OAuth redirect round-trip.
// Google's callback is a plain top-level browser navigation — it can't
// carry an Authorization header — so this is how oauth-google-callback.ts
// knows which usuario started the flow, and that the code it received
// wasn't forged or replayed against a different user's session.
//
// Derives its own HMAC key from TOKEN_ENCRYPTION_KEY (hashed with a
// distinct context label) instead of reusing that raw key directly: same
// secret, but not the same key material doing double duty across two
// different algorithms.
type StatePayload = { usuario_id: string; nonce: string; exp: number };

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos — de sobra para completar el consentimiento en Google

function deriveStateKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Falta TOKEN_ENCRYPTION_KEY en las variables de entorno de la función.");
  }
  return createHash("sha256").update(`${raw}:oauth-state`).digest();
}

export function createOauthState(usuarioId: string): string {
  const payload: StatePayload = {
    usuario_id: usuarioId,
    nonce: randomBytes(9).toString("base64url"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", deriveStateKey()).update(json).digest("base64url");
  return `${json}.${signature}`;
}

export function verifyOauthState(state: string): { usuario_id: string } | null {
  const [json, signature] = state.split(".");
  if (!json || !signature) return null;

  const expectedSignature = createHmac("sha256", deriveStateKey()).update(json).digest("base64url");
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload.usuario_id || Date.now() > payload.exp) {
    return null;
  }

  return { usuario_id: payload.usuario_id };
}
