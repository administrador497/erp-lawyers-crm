/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
