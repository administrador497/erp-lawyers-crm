"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { useToast } from "../../../components/useToast";
import ToastHost from "../../../components/ToastHost";
import type { CurrentUsuario } from "../../../lib/types";

async function authedFetch(path: string, init: RequestInit = {}) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
  });
}

type BuzonRow = {
  id: string;
  proveedor: "google" | "microsoft";
  correo: string;
  expires_at: string;
  conectado_en: string;
};

const CORREO_ERROR_MESSAGES: Record<string, string> = {
  consentimiento_denegado: "No se otorgó el permiso en Google — inténtelo de nuevo si fue un error.",
  solicitud_invalida: "La respuesta de Google llegó incompleta. Intente conectar de nuevo.",
  estado_invalido_o_expirado: "La solicitud expiró o no es válida. Intente conectar de nuevo.",
  oauth_no_configurado: "La integración con Google no está configurada en el servidor.",
  intercambio_de_token_fallido: "No fue posible completar la conexión con Google. Intente de nuevo.",
  no_fue_posible_leer_el_correo: "No fue posible confirmar la cuenta de Google. Intente de nuevo.",
  usuario_invalido: "Su sesión no es válida. Vuelva a iniciar sesión e intente de nuevo.",
  no_fue_posible_guardar_el_buzon: "La conexión con Google funcionó, pero no se pudo guardar. Intente de nuevo.",
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  padding: 24,
  marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-muted)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  background: "var(--color-bg)",
  color: "var(--color-text)",
  fontSize: 13.5,
};

const primaryButtonStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 16px",
  border: "none",
  borderRadius: 2,
  background: "var(--color-red)",
  color: "#fff",
};

const secondaryButtonStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 16px",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  background: "var(--color-panel)",
  color: "var(--color-text)",
};

function PerfilContent() {
  const { toast, showToast } = useToast();
  const searchParams = useSearchParams();

  const [usuario, setUsuario] = useState<CurrentUsuario | null>(null);

  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [buzones, setBuzones] = useState<BuzonRow[]>([]);
  const [loadingBuzones, setLoadingBuzones] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadUsuario = async () => {
    const res = await authedFetch("/api/auth-me");
    if (!res.ok) return;
    const body = await res.json();
    setUsuario(body.usuario ?? null);
  };

  const loadBuzones = async () => {
    setLoadingBuzones(true);
    const res = await authedFetch("/api/buzon-status");
    if (res.ok) {
      const body = await res.json();
      setBuzones(body.buzones ?? []);
    }
    setLoadingBuzones(false);
  };

  useEffect(() => {
    loadUsuario();
    loadBuzones();
  }, []);

  useEffect(() => {
    const correoError = searchParams.get("correo_error");
    const correoConectado = searchParams.get("correo_conectado");
    if (correoError) {
      showToast(CORREO_ERROR_MESSAGES[correoError] ?? "No fue posible conectar el correo.");
    } else if (correoConectado) {
      showToast("Buzón de Gmail conectado correctamente.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const changePassword = async () => {
    if (!pass1 || pass1.length < 8) {
      showToast("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (pass1 !== pass2) {
      showToast("Las contraseñas no coinciden.");
      return;
    }
    setChangingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pass1 });
    setChangingPassword(false);

    if (error) {
      showToast(
        error.message.includes("weak")
          ? "La contraseña es demasiado débil. Use letras, números y símbolos."
          : "No fue posible actualizar la contraseña."
      );
      return;
    }
    setPass1("");
    setPass2("");
    showToast("Contraseña actualizada.");
  };

  const connectGmail = async () => {
    setConnecting(true);
    const res = await authedFetch("/api/oauth-google-start");
    if (!res.ok) {
      setConnecting(false);
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible iniciar la conexión con Google.");
      return;
    }
    const body = await res.json();
    // Navegación completa a propósito: la pantalla de consentimiento de
    // Google no puede abrirse dentro de un fetch.
    window.location.href = body.url;
  };

  const disconnectGmail = async () => {
    if (!window.confirm("¿Desconectar el buzón de Gmail? Podrá volver a conectarlo cuando quiera.")) {
      return;
    }
    setDisconnecting(true);
    const res = await authedFetch("/api/buzon-disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proveedor: "google" }),
    });
    setDisconnecting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible desconectar el buzón.");
      return;
    }
    showToast("Buzón de Gmail desconectado.");
    loadBuzones();
  };

  const buzonGoogle = buzones.find((b) => b.proveedor === "google");

  return (
    <>
      <div style={cardStyle}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          Mis datos
        </h2>
        <div style={{ display: "flex", gap: 32 }}>
          <div>
            <div style={labelStyle}>Nombre completo</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{usuario?.nombre_completo ?? "…"}</div>
          </div>
          <div>
            <div style={labelStyle}>Correo</div>
            <div style={{ fontSize: 14 }}>{usuario?.correo ?? "…"}</div>
          </div>
          <div>
            <div style={labelStyle}>Rol</div>
            <div style={{ fontSize: 14 }}>{usuario?.rol ?? "…"}</div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          Cambiar contraseña
        </h2>
        <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 16 }}>
          Se cerrará sesión en otros dispositivos la próxima vez que inicien sesión.
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            changePassword();
          }}
          style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <div style={{ minWidth: 220 }}>
            <div style={labelStyle}>Nueva contraseña</div>
            <input
              type="password"
              value={pass1}
              onChange={(e) => setPass1(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>
          <div style={{ minWidth: 220 }}>
            <div style={labelStyle}>Confirmar nueva contraseña</div>
            <input
              type="password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>
          <button type="submit" disabled={changingPassword} style={{ ...primaryButtonStyle, opacity: changingPassword ? 0.6 : 1 }}>
            {changingPassword ? "Guardando…" : "Actualizar contraseña"}
          </button>
        </form>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          Autenticación de dos factores (MFA)
        </h2>
        <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 12 }}>
          Próximamente. Esta sección quedará disponible cuando se habilite MFA para todas las cuentas.
        </div>
        <button disabled style={{ ...secondaryButtonStyle, opacity: 0.5, cursor: "not-allowed" }}>
          Activar MFA
        </button>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          Gestión de correo
        </h2>
        <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 16 }}>
          Conecte su propio buzón de Google Workspace para enviar y recibir correo desde su cuenta.
        </div>

        {loadingBuzones ? (
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Cargando…</div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              background: "var(--color-panel-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Gmail (Google Workspace)</div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: 10,
                  background: buzonGoogle ? "#E1F0E5" : "var(--color-panel)",
                  color: buzonGoogle ? "#1E8A4C" : "var(--color-muted)",
                }}
              >
                {buzonGoogle ? "Conectado" : "Desconectado"}
              </span>
              {buzonGoogle ? (
                <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>{buzonGoogle.correo}</span>
              ) : null}
            </div>

            {buzonGoogle ? (
              <button
                onClick={disconnectGmail}
                disabled={disconnecting}
                style={{ ...secondaryButtonStyle, color: "var(--color-red)", opacity: disconnecting ? 0.6 : 1 }}
              >
                {disconnecting ? "Desconectando…" : "Desconectar"}
              </button>
            ) : (
              <button
                onClick={connectGmail}
                disabled={connecting}
                style={{ ...primaryButtonStyle, opacity: connecting ? 0.6 : 1 }}
              >
                {connecting ? "Redirigiendo…" : "Conectar Gmail"}
              </button>
            )}
          </div>
        )}

        <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 12 }}>
          Microsoft 365 estará disponible próximamente con el mismo flujo.
        </div>
      </div>

      <ToastHost message={toast} />
    </>
  );
}

export default function PerfilPage() {
  return (
    <Suspense fallback={null}>
      <PerfilContent />
    </Suspense>
  );
}
