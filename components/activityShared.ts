import type { CSSProperties } from "react";
import type { ActividadRow } from "../lib/types";

export const TIPOS = [
  { value: "llamada", label: "Llamada" },
  { value: "correo", label: "Correo" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "reunion", label: "Reunión" },
  { value: "tarea", label: "Tarea" },
  { value: "recordatorio", label: "Recordatorio" },
];

export const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export const modalInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  background: "var(--color-bg)",
  color: "var(--color-text)",
  fontSize: 13,
};

export const modalLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-muted)",
  marginBottom: 6,
};

export type ActividadGroup = {
  key: "atrasadas" | "hoy" | "pendientes" | "finalizadas";
  label: string;
  items: ActividadRow[];
};

// Mismo agrupado en las 4 vistas donde aparecen actividades (/calendario y
// LeadActivitiesList) — un solo lugar para el criterio de "hoy" (día
// calendario local, no 24h desde ahora) y el orden de los grupos.
export function groupActividades(actividades: ActividadRow[]): ActividadGroup[] {
  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const inicioManana = inicioHoy + 24 * 60 * 60 * 1000;

  const atrasadas: ActividadRow[] = [];
  const hoy: ActividadRow[] = [];
  const pendientes: ActividadRow[] = [];
  const finalizadas: ActividadRow[] = [];

  for (const a of actividades) {
    if (a.estado === "completada") {
      finalizadas.push(a);
      continue;
    }
    const fechaMs = new Date(a.fecha).getTime();
    if (fechaMs < inicioHoy) atrasadas.push(a);
    else if (fechaMs < inicioManana) hoy.push(a);
    else pendientes.push(a);
  }

  const porFechaAsc = (a: ActividadRow, b: ActividadRow) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
  const porFechaDesc = (a: ActividadRow, b: ActividadRow) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime();

  atrasadas.sort(porFechaAsc);
  hoy.sort(porFechaAsc);
  pendientes.sort(porFechaAsc);
  finalizadas.sort(porFechaDesc);

  return [
    { key: "atrasadas", label: "Actividades Atrasadas", items: atrasadas },
    { key: "hoy", label: "Actividades Hoy", items: hoy },
    { key: "pendientes", label: "Actividades Pendientes", items: pendientes },
    { key: "finalizadas", label: "Actividades Finalizadas", items: finalizadas },
  ];
}

export const modalCancelButtonStyle: CSSProperties = {
  fontSize: 13,
  padding: "9px 16px",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  background: "var(--color-panel)",
  color: "var(--color-text)",
};

export const modalConfirmButtonStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 16px",
  border: "none",
  borderRadius: 2,
  background: "var(--color-red)",
  color: "#fff",
};
