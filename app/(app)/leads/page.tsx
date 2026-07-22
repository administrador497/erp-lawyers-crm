"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { formatIngreso, priorityStyle } from "../../../lib/format";
import { useToast } from "../../../components/useToast";
import ToastHost from "../../../components/ToastHost";
import type { AssignableUsuario, NewLeadRow } from "../../../lib/types";

export default function LeadsInboxPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [leads, setLeads] = useState<NewLeadRow[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUsuario[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingLeads, setDeletingLeads] = useState(false);
  const [nuevosIds, setNuevosIds] = useState<Set<string>>(new Set());

  // Evita que el polling de fondo pise una asignación/eliminación en curso
  // (mismo criterio que /pipeline).
  const mutatingRef = useRef(false);

  // Marca ids como "nuevos" para el badge y los quita solos 60s después.
  const marcarNuevos = (ids: string[]) => {
    if (ids.length === 0) return;
    setNuevosIds((prev) => new Set([...prev, ...ids]));
    setTimeout(() => {
      setNuevosIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, 60000);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setLoading(false);
      return;
    }

    const [inboxRes, meRes] = await Promise.all([
      fetch("/api/leads-inbox", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
      fetch("/api/auth-me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
    ]);

    if (!inboxRes.ok) {
      setError("No fue posible cargar los leads nuevos.");
      setLoading(false);
      return;
    }

    const inboxBody = await inboxRes.json();
    setLeads(inboxBody.leads ?? []);
    setAssignableUsers(inboxBody.assignableUsers ?? []);

    if (meRes.ok) {
      const meBody = await meRes.json();
      setIsAdmin(meBody.usuario?.rol === "Administrador general");
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling de fondo cada 45s — para enterarse de leads nuevos sin recargar
  // la página. Se salta el ciclo si hay una asignación/eliminación en curso.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (mutatingRef.current) return;
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/leads-inbox", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      const frescos: NewLeadRow[] = body.leads ?? [];

      setLeads((prev) => {
        const idsPrevios = new Set(prev.map((l) => l.id));
        const idsNuevos = frescos.filter((l) => !idsPrevios.has(l.id)).map((l) => l.id);
        if (idsNuevos.length > 0) {
          marcarNuevos(idsNuevos);
          showToast(
            `${idsNuevos.length} lead${idsNuevos.length === 1 ? "" : "s"} nuevo${idsNuevos.length === 1 ? "" : "s"} por asignar.`
          );
        }
        return frescos;
      });
      setAssignableUsers(body.assignableUsers ?? []);
      setSeleccionados((prev) => new Set(Array.from(prev).filter((id) => frescos.some((l) => l.id === id))));
    }, 45000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assignLead = async (leadId: string, responsableId: string) => {
    if (!responsableId) return;
    mutatingRef.current = true;
    setAssigningId(leadId);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch("/api/leads-assign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ lead_id: leadId, responsable_id: responsableId }),
    });

    setAssigningId(null);
    mutatingRef.current = false;

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible asignar el lead.");
      return;
    }

    const body = await res.json();
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    showToast(`Lead asignado a ${body.responsable_nombre}.`);
  };

  const toggleSeleccionado = (leadId: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  const todosSeleccionados = leads.length > 0 && leads.every((l) => seleccionados.has(l.id));

  const toggleSeleccionarTodos = () => {
    setSeleccionados(todosSeleccionados ? new Set() : new Set(leads.map((l) => l.id)));
  };

  // Mismo endpoint que /pipeline (netlify/functions/leads-delete.ts) — sin
  // lógica nueva del lado del servidor, solo el mismo POST desde otra
  // pantalla.
  const eliminarSeleccionados = async () => {
    mutatingRef.current = true;
    setDeletingLeads(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch("/api/leads-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ lead_ids: Array.from(seleccionados) }),
    });

    setDeletingLeads(false);
    mutatingRef.current = false;

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible eliminar los leads.");
      return;
    }

    setLeads((prev) => prev.filter((l) => !seleccionados.has(l.id)));
    showToast(
      `${seleccionados.size} lead${seleccionados.size === 1 ? "" : "s"} eliminado${seleccionados.size === 1 ? "" : "s"}.`
    );
    setSeleccionados(new Set());
    setShowDeleteModal(false);
  };

  const gridColumns = isAdmin
    ? "28px 1.4fr 1fr 1fr 1fr 0.8fr 1.3fr"
    : "1.4fr 1fr 1fr 1fr 0.8fr 1.3fr";

  return (
    <>
      <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 16 }}>
        Todo lead nuevo ingresa aquí asignado inicialmente a Bayron. Asigne o responda sin
        salir de esta pantalla.
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{error}</div>
      ) : null}

      {isAdmin && seleccionados.size > 0 ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button
            onClick={() => setShowDeleteModal(true)}
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
            Eliminar seleccionados ({seleccionados.size})
          </button>
        </div>
      ) : null}

      <div
        style={{
          background: "var(--color-panel)",
          border: "1px solid var(--color-border)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridColumns,
            gap: 8,
            padding: "12px 16px",
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--color-blue)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            background: "var(--color-panel-2)",
          }}
        >
          {isAdmin ? (
            <input
              type="checkbox"
              checked={todosSeleccionados}
              onChange={toggleSeleccionarTodos}
              title="Seleccionar todos"
              style={{ cursor: "pointer" }}
            />
          ) : null}
          <div>Contacto</div>
          <div>Canal / Origen</div>
          <div>Servicio</div>
          <div>Ingresó</div>
          <div>Prioridad</div>
          <div>Acción</div>
        </div>

        {loading ? (
          <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--color-muted)", fontSize: 13 }}>
            Cargando…
          </div>
        ) : leads.length === 0 ? (
          <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--color-muted)", fontSize: 13 }}>
            No hay leads pendientes de asignación.
          </div>
        ) : (
          leads.map((lead) => {
            const prio = priorityStyle(lead.prioridad);
            return (
              <div
                key={lead.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridColumns,
                  gap: 8,
                  padding: "14px 16px",
                  borderTop: "1px solid var(--color-border)",
                  alignItems: "center",
                }}
              >
                {isAdmin ? (
                  <input
                    type="checkbox"
                    checked={seleccionados.has(lead.id)}
                    onChange={() => toggleSeleccionado(lead.id)}
                    style={{ cursor: "pointer" }}
                  />
                ) : null}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lead.nombre_completo}</div>
                    {nuevosIds.has(lead.id) ? (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 10,
                          background: "var(--color-red)",
                          color: "#fff",
                          textTransform: "uppercase",
                          letterSpacing: "0.02em",
                        }}
                      >
                        Nuevo
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                    {[lead.correo, lead.telefono].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ fontSize: 12.5 }}>{lead.canal_origen}</div>
                <div style={{ fontSize: 12.5 }}>{lead.servicio ?? "—"}</div>
                <div style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
                  {formatIngreso(lead.ingreso)}
                </div>
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 9px",
                      borderRadius: 10,
                      background: prio.bg,
                      color: prio.color,
                    }}
                  >
                    {lead.prioridad}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {isAdmin ? (
                    <select
                      defaultValue=""
                      disabled={assigningId === lead.id}
                      onChange={(e) => assignLead(lead.id, e.target.value)}
                      style={{
                        fontSize: 12,
                        padding: "6px 8px",
                        border: "1px solid var(--color-border)",
                        borderRadius: 2,
                        background: "var(--color-bg)",
                        color: "var(--color-text)",
                      }}
                    >
                      <option value="">Asignar a…</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre_completo}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    onClick={() => router.push(`/inbox?lead=${lead.id}`)}
                    style={{
                      fontSize: 12,
                      padding: "6px 10px",
                      border: "none",
                      borderRadius: 2,
                      background: "var(--color-red)",
                      color: "#fff",
                    }}
                  >
                    Responder
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showDeleteModal ? (
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
              width: 360,
              background: "var(--color-panel)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              Eliminar leads
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 20 }}>
              ¿Eliminar {seleccionados.size} lead{seleccionados.size === 1 ? "" : "s"} seleccionado
              {seleccionados.size === 1 ? "" : "s"}? Dejará{seleccionados.size === 1 ? "" : "n"} de aparecer en
              Pipeline, Contactos, Bandeja y Calendario. No se borra su historial y puede revertirse solo desde la
              base de datos.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingLeads}
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
                onClick={eliminarSeleccionados}
                disabled={deletingLeads}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 16px",
                  border: "none",
                  borderRadius: 2,
                  background: "var(--color-red)",
                  color: "#fff",
                  opacity: deletingLeads ? 0.6 : 1,
                }}
              >
                {deletingLeads ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastHost message={toast} />
    </>
  );
}
