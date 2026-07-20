/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Documented Next 14.x escape hatch (nextjs.org/docs/messages/missing-
    // suspense-with-csr-bailout). Trying this because the build is failing
    // on Next's own internal /_not-found, /404, /500 fallback rendering —
    // exactly the kind of implicit CSR-bailout path this flag affects —
    // and every login/search-param page we actually wrote is already
    // wrapped in <Suspense> (app/login/page.tsx, app/(app)/inbox/page.tsx),
    // so disabling the bailout check doesn't hide a real bug in our code.
    // Remove if it doesn't help — it's gone entirely in Next 15+.
    missingSuspenseWithCSRBailout: false,
  },
  async headers() {
    // Content-Security-Policy lives here instead of netlify.toml so it can
    // differ between development and production. Next's dev server
    // (webpack HMR / React Fast Refresh) needs eval()-based code
    // generation — a strict `script-src 'self'` (correct and required in
    // production) throws `EvalError: Code generation from strings
    // disallowed for this context` in the browser during `next dev` /
    // `netlify dev`, which silently breaks hydration: React never attaches
    // event handlers, so forms fall back to native submission. Netlify
    // doesn't support scoping [[headers]] to a single context, so the
    // branch has to happen here instead, in code that can read NODE_ENV.
    if (process.env.NODE_ENV !== "production") {
      return [];
    }

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
