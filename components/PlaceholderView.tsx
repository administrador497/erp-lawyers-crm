export default function PlaceholderView({ title }: { title: string }) {
  return (
    <div
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 2,
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--color-muted)",
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--color-text)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      Este módulo está en construcción — próxima etapa de la implementación.
    </div>
  );
}
