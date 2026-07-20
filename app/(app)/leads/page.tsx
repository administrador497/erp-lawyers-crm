"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatIngreso, priorityStyle } from "@/lib/format";
import { useToast } from "@/components/useToast";
import ToastHost from "@/components/ToastHost";
import type { AssignableUsuario, NewLeadRow } from "@/lib/types";

export default function LeadsInboxPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [leads, setLeads] = useState<NewLeadRow[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUsuario[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);

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

  const assignLead = async (leadId: string, responsableId: string) => {
    if (!responsableId) return;
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

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible asignar el lead.");
      return;
    }

    const body = await res.json();
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    showToast(`Lead asignado a ${body.responsable_nombre}.`);
  };

  return (
    <>
      <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 16 }}>
        Todo lead nuevo ingresa aquí asignado inicialmente a Bayron. Asigne o responda sin
        salir de esta pantalla.
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{error}</div>
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
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr 0.8fr 1.3fr",
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
                  gridTemplateColumns: "1.4fr 1fr 1fr 1fr 0.8fr 1.3fr",
                  gap: 8,
                  padding: "14px 16px",
                  borderTop: "1px solid var(--color-border)",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{lead.nombre_completo}</div>
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

      <ToastHost message={toast} />
    </>
  );
}
