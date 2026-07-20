"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatIngreso } from "@/lib/format";
import type { DashboardSummary } from "@/lib/types";

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

const cardStyle: React.CSSProperties = {
  background: "var(--color-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  padding: 18,
};

const panelStyle: React.CSSProperties = {
  background: "var(--color-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  padding: 20,
};

export default function DashboardPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [scope, setScope] = useState<"general" | "personal">("general");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const init = async () => {
      const meRes = await authedFetch("/api/auth-me");
      if (meRes.ok) {
        const meBody = await meRes.json();
        const admin = meBody.usuario?.rol === "Administrador general";
        setIsAdmin(admin);
        if (!admin) setScope("personal");
      }
    };
    init();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      const res = await authedFetch(`/api/dashboard-summary?scope=${scope}`);
      if (!res.ok) {
        setError("No fue posible cargar el panel general.");
        setLoading(false);
        return;
      }
      const body = await res.json();
      setSummary(body);
      setLoading(false);
    };
    load();
  }, [scope]);

  const kpis = summary?.kpis;

  const kpiCards = [
    {
      label: "Leads recibidos (mes)",
      value: kpis ? String(kpis.leadsRecibidosMes) : "—",
      delta: "este mes",
      deltaColor: "var(--color-blue)",
      accent: "var(--color-accent-info)",
    },
    {
      label: "Tiempo prom. 1ra respuesta",
      value: kpis?.tiempoPromedioRespuestaHoras != null ? `${kpis.tiempoPromedioRespuestaHoras.toFixed(1)}h` : "—",
      delta: kpis?.tiempoPromedioRespuestaHoras != null ? "promedio calculado" : "sin respuestas aún",
      deltaColor: "var(--color-muted)",
      accent: "var(--color-accent-info)",
    },
    {
      label: "Tasa de conversión",
      value: kpis ? `${kpis.tasaConversionPct}%` : "—",
      delta: "leads en etapa Ganado",
      deltaColor: "#1E8A4C",
      accent: "var(--color-accent-info)",
    },
    {
      // The one alert-type KPI here — everything else is informational.
      label: "Leads sin seguimiento",
      value: kpis ? String(kpis.leadsSinSeguimiento) : "—",
      delta: kpis && kpis.leadsSinSeguimiento > 0 ? "requieren atención" : "todo al día",
      deltaColor: kpis && kpis.leadsSinSeguimiento > 0 ? "var(--color-red)" : "#1E8A4C",
      accent: "var(--color-accent-alert)",
    },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        {isAdmin ? (
          <div
            onClick={() => setScope("general")}
            style={{
              padding: "8px 16px",
              borderRadius: 2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: scope === "general" ? "var(--color-red)" : "transparent",
              color: scope === "general" ? "#fff" : "var(--color-muted)",
            }}
          >
            Vista general
          </div>
        ) : null}
        <div
          onClick={() => setScope("personal")}
          style={{
            padding: "8px 16px",
            borderRadius: 2,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            background: scope === "personal" ? "var(--color-red)" : "transparent",
            color: scope === "personal" ? "#fff" : "var(--color-muted)",
          }}
        >
          Mi actividad
        </div>
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{error}</div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 26,
        }}
      >
        {kpiCards.map((k) => (
          <div key={k.label} style={{ ...cardStyle, borderTop: `4px solid ${k.accent}` }}>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 600, color: k.accent }}>
              {loading ? "…" : k.value}
            </div>
            <div style={{ fontSize: 11.5, color: k.deltaColor, marginTop: 4 }}>{k.delta}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
        <div style={panelStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Actividad reciente</h2>
          {loading ? (
            <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Cargando…</div>
          ) : !summary || summary.actividadReciente.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin actividad reciente.</div>
          ) : (
            summary.actividadReciente.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--color-blue)",
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{a.text}</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 2 }}>
                    {formatIngreso(a.when)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={panelStyle}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Próximas actividades</h2>
          {loading ? (
            <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Cargando…</div>
          ) : !summary || summary.proximasActividades.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin actividades próximas.</div>
          ) : (
            summary.proximasActividades.map((u) => (
              <div key={u.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{u.tipo}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 2 }}>
                  {u.lead_nombre} · {formatIngreso(u.fecha)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
