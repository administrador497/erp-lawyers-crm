import { createClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createClient> | null = null;

// Service-role client for Netlify Functions only. Bypasses RLS — every
// permission check (role, active account, ownership) must happen in the
// function itself before touching the database.
export function getSupabaseAdmin() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de la función."
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cached;
}
