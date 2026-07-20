"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "../../lib/supabase/client";

const ACCOUNT_ERROR_MESSAGES: Record<string, string> = {
  cuenta_inactiva: "Su cuenta está inactiva. Contacte al administrador.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const queryError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    queryError ? ACCOUNT_ERROR_MESSAGES[queryError] ?? "" : ""
  );
  const [loading, setLoading] = useState(false);

  const doLogin = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Ingrese su correo y contraseña.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No fue posible iniciar sesión. Intente de nuevo."
      );
      return;
    }

    // Hard navigation on purpose: signInWithPassword() has already resolved,
    // so the session cookie is committed in the browser's cookie jar. But
    // router.replace()+router.refresh() ask Next's client router to refetch
    // RSC data for "/" while still inside the "/login" page's JS context —
    // that request can be served from the Router Cache or race the cookie
    // write's visibility to the server, which is what caused the
    // login → /leads → back to /login loop. A full document navigation
    // sends a brand-new top-level request with whatever cookies are in the
    // jar at that instant, so app/(app)/layout.tsx's requireActiveSession()
    // sees the session immediately, no caching or race involved.
    window.location.replace("/");
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
          width: 380,
          background: "var(--color-panel)",
          border: "1px solid var(--color-border)",
          borderRadius: 2,
          padding: "40px 36px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
        }}
      >
        <Image
          src="/logo-erp.png"
          alt="ERP Lawyers & Associates"
          width={120}
          height={120}
          style={{ width: 120, height: "auto", display: "block", margin: "0 auto 28px" }}
          priority
        />
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 22,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 4,
          }}
        >
          CRM Omnicanal
        </h1>
        <div
          style={{
            fontSize: 13,
            color: "var(--color-muted)",
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          Acceso exclusivo para colaboradores
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doLogin();
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
              Correo electrónico
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@erplawyers.com"
              autoComplete="username"
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
              Contraseña
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
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
              background: "var(--color-red)",
              color: "#fff",
              border: "none",
              borderRadius: 2,
              fontSize: 14,
              fontWeight: 600,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
          <div
            style={{
              textAlign: "center",
              fontSize: 12.5,
              color: "var(--color-muted)",
              marginTop: 6,
            }}
          >
            ¿Olvidó su contraseña? <a href="#">Recuperar acceso</a>
          </div>
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
