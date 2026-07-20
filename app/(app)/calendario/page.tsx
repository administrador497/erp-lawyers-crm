"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { formatIngreso } from "../../../lib/format";
import { useToast } from "../../../components/useToast";
import ToastHost from "../../../components/ToastHost";
import type { ActividadRow, ContactListRow } from "../../../lib/types";

const TIPOS = [
  { value: "llamada", label: "Llamada" },
  { value: "correo", label: "Correo" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "reunion", label: "Reunión" },
  { value: "tarea", label: "Tarea" },
  { value: "recordatorio", label: "Recordatorio" },
];

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

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  background: "var(--color-bg)",
  color: "var(--color-text)",
  fontSize: 13,
};

const modalLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-muted)",
  marginBottom: 6,
};

export default function CalendarioPage() {
  const { toast, showToast } = useToast();
  const [actividades, setActividades] = useState<ActividadRow[]>([]);
  const [contactos, setContactos] = useState<ContactListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formTipo, setFormTipo] = useState("llamada");
  const [formLeadId, setFormLeadId] = useState("");
  const [formFecha, setFormFecha] = useState(toDatetimeLocalValue(new Date()));
  const [formDescripcion, setFormDescripcion] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const [actRes, contRes] = await Promise.all([
      authedFetch("/api/activities-list"),
      authedFetch("/api/contacts-list"),
    ]);

    if (!actRes.ok) {
      setError("No fue posible cargar las actividades.");
      setLoading(false);
      return;
    }

    const actBody = await actRes.json();
    setActividades(actBody.actividades ?? []);

    if (contRes.ok) {
      const contBody = await contRes.json();
      const lista: ContactListRow[] = contBody.contactos ?? [];
      setContactos(lista);
      setFormLeadId((prev) => prev || lista[0]?.id || "");
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleActividad = async (actividad: ActividadRow) => {
    setTogglingId(actividad.id);
    const nuevoEstado = actividad.estado === "completada" ? "pendiente" : "completada";

    const res = await authedFetch("/api/activity-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activity_id: actividad.id, estado: nuevoEstado }),
    });

    setTogglingId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible actualizar la actividad.");
      return;
    }

    setActividades((prev) =>
      prev.map((a) => (a.id === actividad.id ? { ...a, estado: nuevoEstado } : a))
    );
    showToast(nuevoEstado === "completada" ? "Actividad completada." : "Actividad reabierta.");
  };

  const crearActividad = async () => {
    if (!formLeadId || !formTipo || !formFecha) {
      showToast("Complete tipo, lead y fecha.");
      return;
    }
    setCreating(true);

    const res = await authedFetch("/api/activity-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: formLeadId,
        tipo: formTipo,
        fecha: new Date(formFecha).toISOString(),
        descripcion: formDescripcion.trim() || null,
      }),
    });

    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible crear la actividad.");
      return;
    }

    setShowModal(false);
    setFormDescripcion("");
    setFormFecha(toDatetimeLocalValue(new Date()));
    showToast("Actividad creada.");
    load();
  };

  const ordenadas = [...actividades].sort((a, b) => {
    const aCompleta = a.estado === "completada" ? 1 : 0;
    const bCompleta = b.estado === "completada" ? 1 : 0;
    if (aCompleta !== bCompleta) return aCompleta - bCompleta;
    return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
  });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          onClick={() => setShowModal(true)}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "9px 16px",
            border: "none",
            borderRadius: 2,
            background: "var(--color-red)",
            color: "#fff",
          }}
        >
          + Nueva actividad
        </button>
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{error}</div>
      ) : null}

      <div
        style={{
          background: "var(--color-panel)",
          border: "1px solid var(--color-border)",
          borderRadius: 2,
          padding: "8px 0",
        }}
      >
        {loading ? (
          <div style={{ padding: "20px", fontSize: 13, color: "var(--color-muted)" }}>Cargando…</div>
        ) : ordenadas.length === 0 ? (
          <div style={{ padding: "20px", fontSize: 13, color: "var(--color-muted)" }}>
            No hay actividades registradas.
          </div>
        ) : (
          ordenadas.map((a) => {
            const completada = a.estado === "completada";
            return (
              <div
                key={a.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 140px",
                  gap: 14,
                  alignItems: "center",
                  padding: "13px 20px",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
                  {formatIngreso(a.fecha)}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      textDecoration: completada ? "line-through" : "none",
                    }}
                  >
                    {a.descripcion || TIPOS.find((t) => t.value === a.tipo)?.label || a.tipo}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 2 }}>
                    {a.lead_nombre} · {TIPOS.find((t) => t.value === a.tipo)?.label ?? a.tipo}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <button
                    onClick={() => toggleActividad(a)}
                    disabled={togglingId === a.id}
                    style={{
                      fontSize: 12,
                      padding: "6px 12px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 2,
                      background: completada ? "transparent" : "var(--color-red)",
                      color: completada ? "var(--color-muted)" : "#fff",
                      opacity: togglingId === a.id ? 0.6 : 1,
                    }}
                  >
                    {completada ? "Reabrir" : "Completar"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
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
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              Nueva actividad
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={modalLabelStyle}>Tipo</div>
                <select
                  value={formTipo}
                  onChange={(e) => setFormTipo(e.target.value)}
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
                <div style={modalLabelStyle}>Lead</div>
                <select
                  value={formLeadId}
                  onChange={(e) => setFormLeadId(e.target.value)}
                  style={modalInputStyle}
                >
                  {contactos.length === 0 ? <option value="">Sin leads disponibles</option> : null}
                  {contactos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_completo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={modalLabelStyle}>Fecha y hora</div>
                <input
                  type="datetime-local"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                  style={modalInputStyle}
                />
              </div>

              <div>
                <div style={modalLabelStyle}>Descripción</div>
                <textarea
                  value={formDescripcion}
                  onChange={(e) => setFormDescripcion(e.target.value)}
                  rows={3}
                  style={{ ...modalInputStyle, resize: "vertical" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={creating}
                style={{
                  fontSize: 13,
                  padding: "9px 16px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 2,
                  background: "var(--color-panel)",
                  color: "var(--color-text)",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={crearActividad}
                disabled={creating || !formLeadId}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 16px",
                  border: "none",
                  borderRadius: 2,
                  background: "var(--color-red)",
                  color: "#fff",
                  opacity: creating || !formLeadId ? 0.6 : 1,
                }}
              >
                {creating ? "Creando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastHost message={toast} />
    </>
  );
}
