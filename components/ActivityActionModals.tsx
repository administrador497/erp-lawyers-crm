"use client";

import {
  TIPOS,
  modalInputStyle,
  modalLabelStyle,
  modalCancelButtonStyle,
  modalConfirmButtonStyle,
} from "./activityShared";
import type { ActivityActions } from "./useActivityActions";

// Modales de "Completar actividad" y "Editar actividad", compartidos entre
// /calendario y LeadActivitiesList (contactos/pipeline/inbox) — un solo
// lugar para esta UI en vez de cuatro copias. zIndex más alto que cualquier
// modal contenedor (p. ej. el de "Actividades — {lead}" en /pipeline) para
// que siempre quede encima aunque LeadActivitiesList esté dentro de otro modal.
export default function ActivityActionModals({ actions }: { actions: ActivityActions }) {
  return (
    <>
      {actions.completingActivity ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          <div
            style={{
              width: 380,
              background: "var(--color-panel)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Completar actividad
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 16 }}>
              {actions.completingActivity.lead_nombre} ·{" "}
              {TIPOS.find((t) => t.value === actions.completingActivity!.tipo)?.label ??
                actions.completingActivity.tipo}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={modalLabelStyle}>Resultado (opcional)</div>
                <textarea
                  value={actions.completeResultado}
                  onChange={(e) => actions.setCompleteResultado(e.target.value)}
                  rows={2}
                  placeholder="¿Qué pasó?"
                  style={{ ...modalInputStyle, resize: "vertical" }}
                />
              </div>
              <div>
                <div style={modalLabelStyle}>Próxima acción (opcional)</div>
                <textarea
                  value={actions.completeProximaAccion}
                  onChange={(e) => actions.setCompleteProximaAccion(e.target.value)}
                  rows={2}
                  placeholder="Se usa para prellenar 'Generar seguimiento'"
                  style={{ ...modalInputStyle, resize: "vertical" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={actions.cerrarCompletar}
                disabled={actions.completingSubmitting}
                style={modalCancelButtonStyle}
              >
                Cancelar
              </button>
              <button
                onClick={actions.confirmarCompletarActividad}
                disabled={actions.completingSubmitting}
                style={{ ...modalConfirmButtonStyle, opacity: actions.completingSubmitting ? 0.6 : 1 }}
              >
                {actions.completingSubmitting ? "Guardando…" : "Marcar como completada"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actions.editingActivity ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          <div
            style={{
              width: 380,
              background: "var(--color-panel)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              Editar actividad
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={modalLabelStyle}>Tipo</div>
                <select
                  value={actions.editTipo}
                  onChange={(e) => actions.setEditTipo(e.target.value)}
                  style={modalInputStyle}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={modalLabelStyle}>Fecha y hora</div>
                <input
                  type="datetime-local"
                  value={actions.editFecha}
                  onChange={(e) => actions.setEditFecha(e.target.value)}
                  style={modalInputStyle}
                />
              </div>

              <div>
                <div style={modalLabelStyle}>Descripción</div>
                <textarea
                  value={actions.editDescripcion}
                  onChange={(e) => actions.setEditDescripcion(e.target.value)}
                  rows={3}
                  style={{ ...modalInputStyle, resize: "vertical" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={actions.cerrarEditar}
                disabled={actions.editSubmitting}
                style={modalCancelButtonStyle}
              >
                Cancelar
              </button>
              <button
                onClick={actions.confirmarEditarActividad}
                disabled={actions.editSubmitting || !actions.editFecha}
                style={{
                  ...modalConfirmButtonStyle,
                  opacity: actions.editSubmitting || !actions.editFecha ? 0.6 : 1,
                }}
              >
                {actions.editSubmitting ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
