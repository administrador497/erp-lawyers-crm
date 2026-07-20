import Link from "next/link";

// A real not-found.tsx, instead of relying on Next's auto-generated
// default one — that internal fallback is what breaks the build for
// /404 and /_not-found (see app/page.tsx for the full explanation).
export default function NotFound() {
  return (
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
        textAlign: "center",
        padding: 24,
      }}
    >
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 600 }}>
        Página no encontrada
      </h1>
      <p style={{ fontSize: 14, color: "var(--color-muted)", maxWidth: 360 }}>
        La página que busca no existe o fue movida.
      </p>
      <Link href="/leads" style={{ fontSize: 14, fontWeight: 600, color: "var(--color-blue)" }}>
        Volver al CRM
      </Link>
    </div>
  );
}
