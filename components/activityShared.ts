import type { CSSProperties } from "react";

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
