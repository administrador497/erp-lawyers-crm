"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function ChangePasswordPage() {
  const [newPass1, setNewPass1] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const doChangePassword = async () => {
    setError("");

    if (!newPass1 || newPass1.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPass1 !== newPass2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPass1,
    });

    if (updateError) {
      setLoading(false);
      setError(
        updateError.message.includes("weak")
          ? "La contraseña es demasiado débil. Use letras, números y símbolos."
          : "No fue posible actualizar la contraseña. Intente de nuevo."
      );
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch("/api/auth-complete-password-change", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
    });

    setLoading(false);

    if (!res.ok) {
      setError(
        "Contraseña actualizada, pero hubo un problema al confirmar el cambio. Contacte al administrador."
      );
      return;
    }

    // Hard navigation for the same reason as app/login/page.tsx: avoids
    // Next's client router (Router Cache / RSC refetch race) so the server
    // sees both the updated session and the just-flipped
    // debe_cambiar_password flag on the very next request.
    window.location.replace("/leads");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          width: 400,
          background: "var(--color-panel)",
          border: "1px solid var(--color-border)",
          borderRadius: 2,
          padding: "40px 36px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 20,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Cambio de contraseña obligatorio
        </h1>
        <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 24 }}>
          Por seguridad, defina una nueva contraseña antes de continuar.
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doChangePassword();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--color-muted)",
                marginBottom: 6,
              }}
            >
              Nueva contraseña
            </div>
            <input
              type="password"
              value={newPass1}
              onChange={(e) => setNewPass1(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--color-muted)",
                marginBottom: 6,
              }}
            >
              Confirmar nueva contraseña
            </div>
            <input
              type="password"
              value={newPass2}
              onChange={(e) => setNewPass2(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>
          {error ? (
            <div style={{ fontSize: 12.5, color: "var(--color-red)" }}>{error}</div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: 12,
              background: "var(--color-blue)",
              color: "#fff",
              border: "none",
              borderRadius: 2,
              fontSize: 14,
              fontWeight: 600,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Guardando…" : "Confirmar y continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  background: "var(--color-bg)",
  color: "var(--color-text)",
  fontSize: 14,
};
