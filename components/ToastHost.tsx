export default function ToastHost({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "var(--color-text)",
        color: "var(--color-bg)",
        padding: "12px 20px",
        borderRadius: 2,
        fontSize: 13,
        fontWeight: 500,
        animation: "toastIn 0.25s ease",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        zIndex: 50,
      }}
    >
      {message}
    </div>
  );
}
