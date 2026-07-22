"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import type { ReportsSummary } from "../../../lib/types";
import { panelStyle, badgeStyle } from "../../../components/uiTokens";

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

const panelTitleStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  marginBottom: 16,
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

  const maxCanal = Math.max(...summary.leadsPorCanal.map((b) => b.count), 1);
  const maxMotivo = Math.max(...summary.motivosPerdida.map((m) => m.count), 1);
  const maxServicio = Math.max(...summary.leadsPorServicio.map((s) => s.count), 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={panelStyle}>
        <h2 style={panelTitleStyle}>Leads recibidos (últimos 30 días)</h2>
        {summary.leadsPorCanal.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin leads en este período.</div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 150 }}>
            {summary.leadsPorCanal.map((b) => (
              <div
                key={b.canal_origen}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-blue)" }}>{b.count}</div>
                <div
                  style={{
                    width: "100%",
                    background: "var(--color-blue)",
                    borderRadius: "4px 4px 0 0",
                    height: `${Math.round((b.count / maxCanal) * 120)}px`,
                  }}
                />
                <div style={{ fontSize: 10.5, color: "var(--color-muted)", textAlign: "center" }}>{b.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={panelStyle}>
        <h2 style={panelTitleStyle}>Tasa de conversión</h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 42, fontWeight: 600, color: "var(--color-blue)" }}>
            {summary.tasaConversion.pct}%
          </div>
          <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
            {summary.tasaConversion.ganados} de {summary.tasaConversion.totalConsiderado} leads considerados llegaron a
            &quot;Ganado&quot;
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 10 }}>
          No incluye leads en &quot;Duplicado&quot; o &quot;Descartado&quot; — no son parte del progreso real de un
          lead.
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={panelTitleStyle}>Motivos de pérdida</h2>
        {summary.motivosPerdida.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin leads perdidos todavía.</div>
        ) : (
          summary.motivosPerdida.map((m) => (
            <div key={m.motivo} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span>{m.motivo}</span>
                <span style={{ color: "var(--color-muted)" }}>{m.count}</span>
              </div>
              <div style={{ background: "var(--color-panel-2)", borderRadius: 6, height: 8 }}>
                <div
                  style={{
                    width: `${Math.round((m.count / maxMotivo) * 100)}%`,
                    background: "var(--color-red)",
                    height: "100%",
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div style={panelStyle}>
        <h2 style={panelTitleStyle}>Leads por servicio</h2>
        {summary.leadsPorServicio.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin leads todavía.</div>
        ) : (
          summary.leadsPorServicio.map((s) => (
            <div key={s.servicio} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span>{s.servicio}</span>
                <span style={{ color: "var(--color-muted)" }}>{s.count}</span>
              </div>
              <div style={{ background: "var(--color-panel-2)", borderRadius: 6, height: 8 }}>
                <div
                  style={{
                    width: `${Math.round((s.count / maxServicio) * 100)}%`,
                    background: "var(--color-blue)",
                    height: "100%",
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ ...panelStyle, gridColumn: "span 2" }}>
        <h2 style={panelTitleStyle}>Desempeño por responsable</h2>
        {summary.desempenoPorUsuario.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin datos todavía.</div>
        ) : (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
                gap: 8,
                padding: "8px 0",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div>Responsable</div>
              <div>Leads asignados</div>
              <div>Resp. promedio</div>
              <div>Actividades atrasadas</div>
            </div>
            {summary.desempenoPorUsuario.map((u) => (
              <div
                key={u.usuario_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
                  gap: 8,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--color-border)",
                  alignItems: "center",
                  fontSize: 12.5,
                }}
              >
                <div style={{ fontWeight: 600 }}>{u.nombre}</div>
                <div>{u.leads_asignados}</div>
                <div style={{ color: "var(--color-muted)" }}>
                  {u.tiempo_respuesta_promedio_horas != null
                    ? `${u.tiempo_respuesta_promedio_horas.toFixed(1)}h`
                    : "Sin respuestas aún"}
                </div>
                <div>
                  {u.actividades_atrasadas > 0 ? (
                    <span style={badgeStyle("alert")}>{u.actividades_atrasadas}</span>
                  ) : (
                    <span style={badgeStyle("muted")}>0</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
