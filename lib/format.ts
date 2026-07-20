export function formatIngreso(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });

  // Calendar-day difference (not millisecond difference) so this works the
  // same for past dates (mensajes, historial) and future ones (actividades
  // agendadas) without the "< 7" check silently misfiring for far-future
  // dates when the raw ms difference goes negative.
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);

  if (dayDiff === 0) return `Hoy, ${time}`;
  if (dayDiff === -1) return `Ayer, ${time}`;
  if (dayDiff === 1) return `Mañana, ${time}`;

  if (Math.abs(dayDiff) < 7) {
    const weekday = date.toLocaleDateString("es-CR", { weekday: "short" });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${time}`;
  }

  return date.toLocaleDateString("es-CR", { day: "numeric", month: "short" });
}

export function priorityStyle(priority: string): { bg: string; color: string } {
  if (priority === "Alta") return { bg: "#FBE1E4", color: "#B0132A" };
  if (priority === "Media") return { bg: "#FDF1DC", color: "#946A1A" };
  return { bg: "#E4E9F5", color: "#3349AA" };
}

export function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);
}
