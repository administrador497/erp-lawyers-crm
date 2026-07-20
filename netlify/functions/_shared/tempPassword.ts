import { randomBytes } from "crypto";

// Ambiguous characters (I, l, 1, O, 0) excluded on purpose — an admin often
// has to read this out loud or retype it to hand off to a new hire.
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";

export function generateTempPassword(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARS[bytes[i] % CHARS.length];
  }
  return out;
}
