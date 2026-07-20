"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import type { ReportsSummary } from "../../../lib/types";

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

const panelStyle: React.CSSProperties = {
  background: "var(--color-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  padding: 20,
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 18,
};

export default function ReportesPage() {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await authedFetch("/api/reports-summary");
      if (!res.ok) {
        setError("No fue posible cargar los reportes.");
        setLoading(false);
        return;
      }
      const body = await res.json();
      setSummary(body);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Cargando reportes…</div>;
  }

  if (error || !summary) {
    return (
      <div style={{ fontSize: 13, color: "var(--color-red)" }}>
        {error || "No fue posible cargar los reportes."}
      </div>
    );
  }

  const maxCanal = Math.max(...summary.channelBars.map((b) => b.value), 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div style={panelStyle}>
        <h2 style={panelTitleStyle}>Leads por canal</h2>
        {summary.channelBars.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin leads todavía.</div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 160 }}>
            {summary.channelBars.map((b) => (
              <div
                key={b.canal_origen}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-blue)" }}>{b.value}</div>
                <div
                  style={{
                    width: "100%",
                    background: "var(--color-blue)",
                    borderRadius: "2px 2px 0 0",
                    height: `${Math.round((b.value / maxCanal) * 130)}px`,
                  }}
                />
                <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{b.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={panelStyle}>
        <h2 style={panelTitleStyle}>Embudo de conversión</h2>
        {summary.funnel.map((f) => (
          <div key={f.label} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              <span>{f.label}</span>
              <span style={{ color: "var(--color-muted)" }}>{f.value}</span>
            </div>
            <div style={{ background: "var(--color-panel-2)", borderRadius: 2, height: 10 }}>
              <div
                style={{
                  width: `${f.pct}%`,
                  background: "var(--color-red)",
                  height: "100%",
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...panelStyle, gridColumn: "span 2" }}>
        <h2 style={panelTitleStyle}>Cumplimiento de SLA por usuario</h2>
        {summary.slaByUser.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin datos todavía.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {summary.slaByUser.map((s) => (
              <div
                key={s.usuario_id}
                style={{ borderTop: "3px solid var(--color-accent-info)", paddingTop: 10 }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.nombre}</div>
                <h3
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: 22,
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  {s.leads_asignados}
                </h3>
                <div style={{ fontSize: 11, color: "var(--color-muted)" }}>
                  leads asignados
                  {s.tiempo_promedio_horas != null
                    ? ` · resp. prom. ${s.tiempo_promedio_horas.toFixed(1)}h`
                    : " · sin respuestas aún"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
