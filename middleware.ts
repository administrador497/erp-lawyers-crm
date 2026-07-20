import { NextResponse, type NextRequest } from "next/server";

// CSP nonce generation ONLY — do not add auth/session logic here. Route
// protection deliberately lives in lib/authGuard.ts, invoked from each
// protected layout (see README "sin alias @/" note and the auth section
// for why): this project's middleware previously handled auth too, but its
// Edge Runtime threw "EvalError: Code generation from strings disallowed
// for this context" on a locked-down Windows dev machine, so that logic
// was moved into plain server-side layout code instead. Re-introducing
// middleware here is a narrower, unavoidable exception: a per-request CSP
// nonce cannot be generated anywhere else in Next.js — next.config.mjs's
// headers() is static (evaluated once at build time), and Server
// Components can't set response headers before the app starts rendering.
// If this brings the EvalError back during local `next dev`/`netlify dev`
// on Windows, that's expected — Netlify's actual build/runtime is Linux
// cloud infrastructure and shouldn't have the same restriction, but there
// is no way to keep a strict script-src CSP without SOME code running here.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Inline style ATTRIBUTES (React's style={{...}}, used throughout this
    // app) have no nonce mechanism in the CSP spec — only <style> tags and
    // stylesheets do. 'unsafe-inline' here is unavoidable without rewriting
    // every component to CSS classes, and is a much narrower risk than
    // unsafe-inline/unsafe-eval on scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  // Matches next.config.mjs's old behavior: no CSP at all outside
  // production, so Next's dev-mode eval()-based HMR/Fast Refresh keeps
  // working. (The middleware file itself still loads either way — only the
  // CSP-setting logic is skipped — see the Windows caveat above.)
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Set on the outgoing request too, not just the response: this is how
  // Next.js's App Router discovers the nonce and automatically stamps it
  // onto the inline hydration <script> tags it injects itself — those
  // aren't scripts we write, so we can't add a nonce prop to them by hand.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-erp.png).*)"],
};
