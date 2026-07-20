// Shared by contact-detail.ts (historial tab) and dashboard-summary.ts
// (actividad reciente) — turns one `auditoria` row (entidad='leads') into a
// short Spanish sentence. Kept in one place so both screens describe the
// same accion the same way.
export type AuditoriaLeadRow = {
  accion: string;
  usuario_id?: string | null;
  estado_anterior?: Record<string, any> | null;
  estado_posterior?: Record<string, any> | null;
};

export function textoAuditoriaLead(
  a: AuditoriaLeadRow,
  usuarioNombre: Map<string, string>,
  etapaNombre: Map<string, string>,
  canalOrigenFallback?: string | null
): string {
  if (a.accion === "asignacion_automatica") {
    return `Lead creado desde ${
      a.estado_posterior?.canal_origen ?? canalOrigenFallback ?? "un canal"
    } y asignado automáticamente a Bayron.`;
  }
  if (a.accion === "reasignacion_manual") {
    return `Reasignado por ${(a.usuario_id && usuarioNombre.get(a.usuario_id)) ?? "un administrador"}.`;
  }
  if (a.accion === "movimiento_pipeline") {
    const anterior = a.estado_anterior?.etapa_id ? etapaNombre.get(a.estado_anterior.etapa_id) : null;
    const nueva = a.estado_posterior?.etapa_id ? etapaNombre.get(a.estado_posterior.etapa_id) : null;
    return `Movido${anterior ? ` de "${anterior}"` : ""}${nueva ? ` a "${nueva}"` : ""} en el pipeline.`;
  }
  if (a.accion === "edicion_contacto_lead") {
    return `Información actualizada por ${(a.usuario_id && usuarioNombre.get(a.usuario_id)) ?? "un usuario"}.`;
  }
  return `Acción registrada: ${a.accion}.`;
}
