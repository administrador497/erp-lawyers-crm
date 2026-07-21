"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { formatIngreso } from "../lib/format";
import type { ActividadRow } from "../lib/types";

const TIPO_LABEL: Record<string, string> = {
  llamada: "Llamada",
  correo: "Correo",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  tarea: "Tarea",
  recordatorio: "Recordatorio",
};

async function authedFetch(path: string) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(path, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
}

// Actividades de UN lead específico — usado en /contactos (tab
// "Actividades"), /pipeline (modal al hacer clic en una tarjeta) y /inbox
// (sección junto al hilo de mensajes), todos vía activities-list.ts en su
// modo ?lead_id=. Un solo componente para no triplicar el fetch + el
// agrupado próximas/anteriores en cada página.
export default function LeadActivitiesList({ leadId }: { leadId: string }) {
  const [actividades, setActividades] = useState<ActividadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      const res = await authedFetch(`/api/activities-list?lead_id=${encodeURIComponent(leadId)}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("No fue posible cargar las actividades de este lead.");
        setLoading(false);
        return;
      }
      const body = await res.json();
      setActividades(body.actividades ?? []);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) {
    return <div style={{ fontSize: 12.5, color: "var(--color-muted)" }}>Cargando actividades…</div>;
  }
  if (error) {
    return <div style={{ fontSize: 12.5, color: "var(--color-red)" }}>{error}</div>;
  }
  if (actividades.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
        Sin actividades registradas para este lead.
      </div>
    );
  }

  const ahora = Date.now();
  const esProxima = (a: ActividadRow) => a.estado !== "completada" && new Date(a.fecha).getTime() >= ahora;
  const proximas = actividades.filter(esProxima);
  const anteriores = [...actividades.filter((a) => !esProxima(a))].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );

  const renderRow = (a: ActividadRow) => (
    <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border)", fontSize: 12.5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 600, textDecoration: a.estado === "completada" ? "line-through" : "none" }}>
          {a.descripcion || TIPO_LABEL[a.tipo] || a.tipo}
        </div>
        <div style={{ color: "var(--color-muted)", flexShrink: 0 }}>{formatIngreso(a.fecha)}</div>
      </div>
      <div style={{ color: "var(--color-muted)", marginTop: 2 }}>
        {TIPO_LABEL[a.tipo] ?? a.tipo}
        {a.responsable_nombre ? ` · ${a.responsable_nombre}` : ""}
        {a.estado === "completada" ? " · Completada" : ""}
      </div>
      {a.resultado ? <div style={{ marginTop: 2 }}>Resultado: {a.resultado}</div> : null}
      {a.proxima_accion ? <div style={{ marginTop: 2 }}>Próxima acción: {a.proxima_accion}</div> : null}
    </div>
  );

  return (
    <div>
      {proximas.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-blue)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              marginBottom: 6,
            }}
          >
            Próximas
          </div>
          {proximas.map(renderRow)}
        </div>
      ) : null}

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-blue)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            marginBottom: 6,
          }}
        >
          {proximas.length > 0 ? "Anteriores" : "Actividades"}
        </div>
        {anteriores.length > 0 ? (
          anteriores.map(renderRow)
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--color-muted)" }}>Sin actividades anteriores.</div>
        )}
      </div>
    </div>
  );
}
