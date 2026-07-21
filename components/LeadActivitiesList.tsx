"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { formatIngreso } from "../lib/format";
import type { ActividadRow } from "../lib/types";
import { TIPO_LABEL, groupActividades } from "./activityShared";
import { useActivityActions } from "./useActivityActions";
import ActivityActionModals from "./ActivityActionModals";

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
// modo ?lead_id=. Un solo componente para no triplicar el fetch, el
// agrupado próximas/anteriores y ahora también Completar/Reabrir/Editar
// (misma lógica que /calendario, vía useActivityActions/ActivityActionModals).
// showToast se recibe del padre porque las 3 páginas que lo usan ya montan
// su propio ToastHost — evitar un segundo host anidado.
export default function LeadActivitiesList({
  leadId,
  showToast,
}: {
  leadId: string;
  showToast: (msg: string) => void;
}) {
  const [actividades, setActividades] = useState<ActividadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activityActions = useActivityActions({
    showToast,
    onUpdated: (id, patch) => setActividades((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a))),
  });

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

  const grupos = groupActividades(actividades);

  const renderRow = (a: ActividadRow) => {
    const completada = a.estado === "completada";
    return (
      <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border)", fontSize: 12.5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 600, textDecoration: completada ? "line-through" : "none" }}>
            {a.descripcion || TIPO_LABEL[a.tipo] || a.tipo}
          </div>
          <div style={{ color: "var(--color-muted)", flexShrink: 0 }}>{formatIngreso(a.fecha)}</div>
        </div>
        <div style={{ color: "var(--color-muted)", marginTop: 2 }}>
          {TIPO_LABEL[a.tipo] ?? a.tipo}
          {a.responsable_nombre ? ` · ${a.responsable_nombre}` : ""}
          {completada ? " · Completada" : ""}
        </div>
        {a.resultado ? <div style={{ marginTop: 2 }}>Resultado: {a.resultado}</div> : null}
        {a.proxima_accion ? <div style={{ marginTop: 2 }}>Próxima acción: {a.proxima_accion}</div> : null}

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            onClick={() =>
              completada ? activityActions.reabrirActividad(a) : activityActions.abrirCompletarActividad(a)
            }
            disabled={activityActions.togglingId === a.id}
            style={{
              fontSize: 11,
              padding: "4px 9px",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              background: completada ? "transparent" : "var(--color-red)",
              color: completada ? "var(--color-muted)" : "#fff",
              opacity: activityActions.togglingId === a.id ? 0.6 : 1,
            }}
          >
            {completada ? "Reabrir" : "Completar"}
          </button>
          <button
            onClick={() => activityActions.abrirEditarActividad(a)}
            style={{
              fontSize: 11,
              padding: "4px 9px",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              background: "var(--color-panel)",
              color: "var(--color-text)",
            }}
          >
            Editar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {grupos
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.key} style={{ marginBottom: 14 }}>
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
              {g.label}
            </div>
            {g.items.map(renderRow)}
          </div>
        ))}

      <ActivityActionModals actions={activityActions} />
    </div>
  );
}
