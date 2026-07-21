/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Documented Next 14.x escape hatch (nextjs.org/docs/messages/missing-
    // suspense-with-csr-bailout). Our only useSearchParams() usages
    // (app/login/page.tsx, app/(app)/inbox/page.tsx, app/(app)/perfil/page.tsx)
    // are already wrapped in <Suspense>, so disabling the bailout check
    // doesn't hide a real bug.
    // Gone entirely in Next 15+.
    missingSuspenseWithCSRBailout: false,
  },
  // Content-Security-Policy used to live here, but a static header can't
  // carry a per-request nonce — it now lives in middleware.ts instead,
  // which is the only place Next.js can generate one per request and still
  // have its own hydration <script> tags pick it up automatically.
};

export default nextConfig;
