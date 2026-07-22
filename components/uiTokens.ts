import type { CSSProperties } from "react";

// Tokens visuales compartidos del rediseño (densidad + radios tipo
// ClickUp/Asana) — un solo lugar para no tener que ajustar el mismo
// borderRadius/padding en cada pantalla por separado. Siempre var(--color-*)
// existentes, nunca un tono nuevo.
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};

export const cardStyle: CSSProperties = {
  background: "var(--color-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: radius.md,
};

export const panelStyle: CSSProperties = {
  ...cardStyle,
  padding: 20,
};

export const buttonPrimaryStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 16px",
  border: "none",
  borderRadius: radius.sm,
  background: "var(--color-red)",
  color: "#fff",
};

export const buttonSecondaryStyle: CSSProperties = {
  fontSize: 13,
  padding: "9px 16px",
  border: "1px solid var(--color-border)",
  borderRadius: radius.sm,
  background: "var(--color-panel)",
  color: "var(--color-text)",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: "1px solid var(--color-border)",
  borderRadius: radius.sm,
  background: "var(--color-bg)",
  color: "var(--color-text)",
  fontSize: 13,
};

type BadgeVariant = "alert" | "info" | "muted";

export function badgeStyle(variant: BadgeVariant = "muted"): CSSProperties {
  const colors: Record<BadgeVariant, { bg: string; fg: string }> = {
    alert: { bg: "var(--color-red)", fg: "#fff" },
    info: { bg: "var(--color-blue)", fg: "#fff" },
    muted: { bg: "var(--color-panel-2)", fg: "var(--color-muted)" },
  };
  const { bg, fg } = colors[variant];
  return {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10.5,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: radius.pill,
    background: bg,
    color: fg,
  };
}

// Avatar circular con iniciales — mismo patrón que ya usaba el usuario
// actual en el sidebar, ahora reutilizable en listas (inbox, leads,
// contactos) para darles la densidad/jerarquía de ClickUp/Asana.
export function avatarStyle(size = 30): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    background: "var(--color-red)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: Math.round(size * 0.4),
    fontWeight: 700,
    flexShrink: 0,
  };
}

export function initials(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}
