"use client";

import "./globals.css";

// Replaces Next's auto-generated default error page for root-layout-level
// (500-class) errors — same reason as app/not-found.tsx. Must be a Client
// Component and render its own <html>/<body>: global-error.tsx completely
// replaces app/layout.tsx when active, so it also imports globals.css
// directly rather than relying on the root layout to have loaded it.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "var(--color-bg)",
            color: "var(--color-text)",
            // Plain system fallbacks, not var(--font-*): those resolve via
            // next/font's className on <html> in the real root layout, which
            // this file bypasses entirely (see comment above).
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            padding: 24,
          }}
        >
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 600 }}>
            Ocurrió un error
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-muted)", maxWidth: 360 }}>
            Algo salió mal. Intente de nuevo.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              background: "var(--color-red)",
              color: "#fff",
              border: "none",
              borderRadius: 2,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
