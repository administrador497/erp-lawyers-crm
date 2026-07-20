"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { formatCurrency } from "../../../lib/format";
import { useToast } from "../../../components/useToast";
import ToastHost from "../../../components/ToastHost";
import type { EtapaRow, MotivoPerdidaRow, PipelineLeadRow } from "../../../lib/types";

const ETAPA_PERDIDO = "Perdido";

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

type LossPrompt = {
  leadId: string;
  etapaId: string;
  etapaNombre: string;
  previousEtapaId: string;
};

export default function PipelinePage() {
  const { toast, showToast } = useToast();
  const [etapas, setEtapas] = useState<EtapaRow[]>([]);
  const [leads, setLeads] = useState<PipelineLeadRow[]>([]);
  const [motivosPerdida, setMotivosPerdida] = useState<MotivoPerdidaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [lossPrompt, setLossPrompt] = useState<LossPrompt | null>(null);
  const [selectedMotivoId, setSelectedMotivoId] = useState("");
  const [confirmingLoss, setConfirmingLoss] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      const res = await authedFetch("/api/pipeline-list");
      if (!res.ok) {
        setError("No fue posible cargar el pipeline.");
        setLoading(false);
        return;
      }
      const body = await res.json();
      setEtapas(body.etapas ?? []);
      setLeads(body.leads ?? []);
      setMotivosPerdida(body.motivosPerdida ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const leadsByEtapa = useMemo(() => {
    const map: Record<string, PipelineLeadRow[]> = {};
    for (const lead of leads) {
      (map[lead.etapa_id] ??= []).push(lead);
    }
    return map;
  }, [leads]);

  const setLeadEtapa = (leadId: string, etapaId: string) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, etapa_id: etapaId } : l)));
  };

  // Normal move (any column except 'Perdido'): optimistic update, revert on
  // API failure. Used directly from handleDrop and also to send the
  // Perdido move once a motivo has been confirmed.
  const moveLead = async (
    leadId: string,
    etapaId: string,
    etapaNombre: string,
    previousEtapaId: string,
    motivoPerdidaId?: string
  ) => {
    const res = await authedFetch("/api/leads-move-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: leadId,
        etapa_id: etapaId,
        ...(motivoPerdidaId ? { motivo_perdida_id: motivoPerdidaId } : {}),
      }),
    });

    if (!res.ok) {
      setLeadEtapa(leadId, previousEtapaId);
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible mover el lead.");
      return false;
    }

    showToast(`Movido a "${etapaNombre}".`);
    return true;
  };

  const handleDrop = (etapa: EtapaRow) => (e: React.DragEvent) => {
    e.preventDefault();
    const leadId = draggingLeadId;
    setDraggingLeadId(null);
    if (!leadId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.etapa_id === etapa.id) return;

    const previousEtapaId = lead.etapa_id;
    setLeadEtapa(leadId, etapa.id);

    if (etapa.nombre === ETAPA_PERDIDO) {
      // Card already jumped to the Perdido column above — hold here until
      // the user confirms a motivo (or cancels, which reverts it back).
      setLossPrompt({ leadId, etapaId: etapa.id, etapaNombre: etapa.nombre, previousEtapaId });
      setSelectedMotivoId(motivosPerdida[0]?.id ?? "");
      return;
    }

    moveLead(leadId, etapa.id, etapa.nombre, previousEtapaId);
  };

  const cancelLossPrompt = () => {
    if (!lossPrompt) return;
    setLeadEtapa(lossPrompt.leadId, lossPrompt.previousEtapaId);
    setLossPrompt(null);
  };

  const confirmLossPrompt = async () => {
    if (!lossPrompt || !selectedMotivoId) return;
    setConfirmingLoss(true);
    await moveLead(
      lossPrompt.leadId,
      lossPrompt.etapaId,
      lossPrompt.etapaNombre,
      lossPrompt.previousEtapaId,
      selectedMotivoId
    );
    setConfirmingLoss(false);
    setLossPrompt(null);
  };

  if (loading) {
    return <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Cargando pipeline…</div>;
  }

  return (
    <>
      {error ? (
        <div style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{error}</div>
      ) : null}

      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 10 }}>
        {etapas.map((etapa) => {
          const cards = leadsByEtapa[etapa.id] ?? [];
          return (
            <div
              key={etapa.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop(etapa)}
              style={{
                minWidth: 230,
                background: "var(--color-panel-2)",
                borderRadius: 2,
                padding: 12,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  marginBottom: 10,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ color: "var(--color-blue)" }}>{etapa.nombre}</span>
                <span style={{ color: "var(--color-muted)" }}>{cards.length}</span>
              </div>

              {cards.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", lead.id);
                    setDraggingLeadId(lead.id);
                  }}
                  onDragEnd={() => setDraggingLeadId(null)}
                  style={{
                    background: "var(--color-panel)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 2,
                    padding: 11,
                    marginBottom: 8,
                    cursor: "grab",
                    opacity: draggingLeadId === lead.id ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{lead.nombre_completo}</div>
                  <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 3 }}>
                    {lead.servicio ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-blue)", marginTop: 5, fontWeight: 600 }}>
                    {formatCurrency(lead.valor_potencial)}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {lossPrompt ? (
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
              width: 340,
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
                marginBottom: 6,
              }}
            >
              Motivo de la pérdida
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 16 }}>
              Indique por qué se pierde este lead antes de confirmar el movimiento.
            </div>

            {motivosPerdida.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--color-red)", marginBottom: 16 }}>
                No hay motivos configurados. Ejecute migrations/007_pipeline_etapas_v2.sql.
              </div>
            ) : (
              <select
                value={selectedMotivoId}
                onChange={(e) => setSelectedMotivoId(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 11px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 2,
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                {motivosPerdida.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={cancelLossPrompt}
                disabled={confirmingLoss}
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
                onClick={confirmLossPrompt}
                disabled={confirmingLoss || !selectedMotivoId}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 16px",
                  border: "none",
                  borderRadius: 2,
                  background: "var(--color-red)",
                  color: "#fff",
                  opacity: confirmingLoss || !selectedMotivoId ? 0.6 : 1,
                }}
              >
                {confirmingLoss ? "Confirmando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastHost message={toast} />
    </>
  );
}
