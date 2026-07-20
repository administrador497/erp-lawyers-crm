"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { formatCurrency, formatIngreso, priorityStyle } from "../../../lib/format";
import { useToast } from "../../../components/useToast";
import ToastHost from "../../../components/ToastHost";
import type { ContactDetail, ContactListRow, HistorialItem } from "../../../lib/types";

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

type Draft = {
  nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  telefono: string;
  notas: string;
  etiquetasText: string;
  prioridad: string;
  valorPotencialText: string;
};

function draftFromDetail(detail: ContactDetail): Draft {
  return {
    nombre: detail.nombre ?? "",
    primer_apellido: detail.primer_apellido ?? "",
    segundo_apellido: detail.segundo_apellido ?? "",
    telefono: detail.telefono ?? "",
    notas: detail.notas ?? "",
    etiquetasText: (detail.etiquetas ?? []).join(", "),
    prioridad: detail.prioridad,
    valorPotencialText: detail.valor_potencial != null ? String(detail.valor_potencial) : "",
  };
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  background: "var(--color-bg)",
  color: "var(--color-text)",
  fontSize: 13,
};

export default function ContactosPage() {
  const { toast, showToast } = useToast();
  const [contactos, setContactos] = useState<ContactListRow[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [tab, setTab] = useState<"info" | "historial">("info");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoadingList(true);
      const res = await authedFetch("/api/contacts-list");
      if (!res.ok) {
        setError("No fue posible cargar los contactos.");
        setLoadingList(false);
        return;
      }
      const body = await res.json();
      const lista: ContactListRow[] = body.contactos ?? [];
      setContactos(lista);
      setSelectedLeadId(lista[0]?.id ?? null);
      setLoadingList(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedLeadId) {
      setDetail(null);
      setHistorial([]);
      return;
    }

    let cancelled = false;
    const loadDetail = async () => {
      setLoadingDetail(true);
      setEditing(false);
      const res = await authedFetch(`/api/contact-detail?lead_id=${encodeURIComponent(selectedLeadId)}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("No fue posible cargar la ficha del contacto.");
        setLoadingDetail(false);
        return;
      }
      const body = await res.json();
      setDetail(body.contacto);
      setHistorial(body.historial ?? []);
      setDraft(draftFromDetail(body.contacto));
      setLoadingDetail(false);
    };

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedLeadId]);

  const startEditing = () => {
    if (!detail) return;
    setDraft(draftFromDetail(detail));
    setEditing(true);
  };

  const cancelEditing = () => {
    if (detail) setDraft(draftFromDetail(detail));
    setEditing(false);
  };

  const saveEditing = async () => {
    if (!detail || !draft || !selectedLeadId) return;
    setSaving(true);

    const valorPotencial =
      draft.valorPotencialText.trim() === "" ? null : Number(draft.valorPotencialText);

    if (valorPotencial !== null && (!Number.isFinite(valorPotencial) || valorPotencial < 0)) {
      setSaving(false);
      showToast("Valor potencial inválido.");
      return;
    }

    const res = await authedFetch("/api/contact-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: selectedLeadId,
        nombre: draft.nombre,
        primer_apellido: draft.primer_apellido || null,
        segundo_apellido: draft.segundo_apellido || null,
        telefono_principal: draft.telefono || null,
        notas: draft.notas || null,
        etiquetas: draft.etiquetasText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        prioridad: draft.prioridad,
        valor_potencial: valorPotencial,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible guardar los cambios.");
      return;
    }

    // Refetch to get canonical values + the new historial entry.
    const refreshed = await authedFetch(
      `/api/contact-detail?lead_id=${encodeURIComponent(selectedLeadId)}`
    );
    if (refreshed.ok) {
      const body = await refreshed.json();
      setDetail(body.contacto);
      setHistorial(body.historial ?? []);
      setDraft(draftFromDetail(body.contacto));
      setContactos((prev) =>
        prev.map((c) =>
          c.id === selectedLeadId
            ? { ...c, nombre_completo: body.contacto.nombre_completo, prioridad: body.contacto.prioridad }
            : c
        )
      );
    }
    setEditing(false);
    showToast("Información actualizada.");
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
      <div
        style={{
          background: "var(--color-panel)",
          border: "1px solid var(--color-border)",
          borderRadius: 2,
          overflow: "hidden",
          height: "fit-content",
        }}
      >
        {loadingList ? (
          <div style={{ padding: "16px", fontSize: 13, color: "var(--color-muted)" }}>Cargando…</div>
        ) : contactos.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 13, color: "var(--color-muted)" }}>
            No hay contactos todavía.
          </div>
        ) : (
          contactos.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelectedLeadId(c.id)}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border)",
                cursor: "pointer",
                background: c.id === selectedLeadId ? "var(--color-panel-2)" : "transparent",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nombre_completo}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{c.servicio ?? "—"}</div>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          background: "var(--color-panel)",
          border: "1px solid var(--color-border)",
          borderRadius: 2,
          padding: 24,
        }}
      >
        {error ? <div style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{error}</div> : null}

        {loadingDetail || !detail ? (
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>
            {loadingDetail ? "Cargando ficha…" : "Seleccione un contacto."}
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600 }}>
                  {detail.nombre_completo}
                </h2>
                <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginTop: 4 }}>
                  {detail.servicio ?? "Sin servicio"} · {detail.pais ?? "—"}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 12px",
                  borderRadius: 10,
                  background: "var(--color-panel-2)",
                  color: "var(--color-blue)",
                }}
              >
                {detail.etapa ?? detail.estado}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center" }}>
              <div
                onClick={() => setTab("info")}
                style={{
                  padding: "7px 14px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: 2,
                  background: tab === "info" ? "var(--color-red)" : "transparent",
                  color: tab === "info" ? "#fff" : "var(--color-muted)",
                }}
              >
                Información
              </div>
              <div
                onClick={() => setTab("historial")}
                style={{
                  padding: "7px 14px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: 2,
                  background: tab === "historial" ? "var(--color-red)" : "transparent",
                  color: tab === "historial" ? "#fff" : "var(--color-muted)",
                }}
              >
                Historial
              </div>

              {tab === "info" ? (
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  {editing ? (
                    <>
                      <button
                        onClick={cancelEditing}
                        disabled={saving}
                        style={{
                          fontSize: 12,
                          padding: "6px 12px",
                          border: "1px solid var(--color-border)",
                          borderRadius: 2,
                          background: "var(--color-panel)",
                          color: "var(--color-text)",
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={saveEditing}
                        disabled={saving}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "6px 12px",
                          border: "none",
                          borderRadius: 2,
                          background: "var(--color-red)",
                          color: "#fff",
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        {saving ? "Guardando…" : "Guardar"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={startEditing}
                      style={{
                        fontSize: 12,
                        padding: "6px 12px",
                        border: "1px solid var(--color-border)",
                        borderRadius: 2,
                        background: "var(--color-panel)",
                        color: "var(--color-blue)",
                        fontWeight: 600,
                      }}
                    >
                      Editar
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {tab === "info" && draft ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 28px" }}>
                <div>
                  <div style={fieldLabelStyle}>Nombre completo</div>
                  {editing ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={draft.nombre}
                        onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                        placeholder="Nombre"
                        style={inputStyle}
                      />
                      <input
                        value={draft.primer_apellido}
                        onChange={(e) => setDraft({ ...draft, primer_apellido: e.target.value })}
                        placeholder="1er apellido"
                        style={inputStyle}
                      />
                      <input
                        value={draft.segundo_apellido}
                        onChange={(e) => setDraft({ ...draft, segundo_apellido: e.target.value })}
                        placeholder="2do apellido"
                        style={inputStyle}
                      />
                    </div>
                  ) : (
                    <div style={{ fontSize: 13.5 }}>{detail.nombre_completo}</div>
                  )}
                </div>

                <div>
                  <div style={fieldLabelStyle}>Correo electrónico</div>
                  <div style={{ fontSize: 13.5 }}>{detail.correo ?? "—"}</div>
                </div>

                <div>
                  <div style={fieldLabelStyle}>Teléfono / WhatsApp</div>
                  {editing ? (
                    <input
                      value={draft.telefono}
                      onChange={(e) => setDraft({ ...draft, telefono: e.target.value })}
                      placeholder="+506 8000 0000"
                      style={inputStyle}
                    />
                  ) : (
                    <div style={{ fontSize: 13.5 }}>{detail.telefono ?? "—"}</div>
                  )}
                </div>

                <div>
                  <div style={fieldLabelStyle}>País</div>
                  <div style={{ fontSize: 13.5 }}>{detail.pais ?? "—"}</div>
                </div>

                <div>
                  <div style={fieldLabelStyle}>Servicio de interés</div>
                  <div style={{ fontSize: 13.5 }}>{detail.servicio ?? "—"}</div>
                </div>

                <div>
                  <div style={fieldLabelStyle}>Canal de origen</div>
                  <div style={{ fontSize: 13.5 }}>{detail.canal_origen}</div>
                </div>

                <div>
                  <div style={fieldLabelStyle}>Responsable</div>
                  <div style={{ fontSize: 13.5 }}>{detail.responsable_nombre ?? "Sin asignar"}</div>
                </div>

                <div>
                  <div style={fieldLabelStyle}>Prioridad</div>
                  {editing ? (
                    <select
                      value={draft.prioridad}
                      onChange={(e) => setDraft({ ...draft, prioridad: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                  ) : (
                    (() => {
                      const prio = priorityStyle(detail.prioridad);
                      return (
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
                          {detail.prioridad}
                        </span>
                      );
                    })()
                  )}
                </div>

                <div>
                  <div style={fieldLabelStyle}>Valor potencial</div>
                  {editing ? (
                    <input
                      value={draft.valorPotencialText}
                      onChange={(e) => setDraft({ ...draft, valorPotencialText: e.target.value })}
                      placeholder="0"
                      inputMode="numeric"
                      style={inputStyle}
                    />
                  ) : (
                    <div style={{ fontSize: 13.5, color: "var(--color-blue)", fontWeight: 600 }}>
                      {formatCurrency(detail.valor_potencial)}
                    </div>
                  )}
                </div>

                <div>
                  <div style={fieldLabelStyle}>Estado</div>
                  <div style={{ fontSize: 13.5 }}>{detail.estado}</div>
                </div>

                <div>
                  <div style={fieldLabelStyle}>Fecha de ingreso</div>
                  <div style={{ fontSize: 13.5 }}>{formatIngreso(detail.ingreso)}</div>
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  <div style={fieldLabelStyle}>Etiquetas</div>
                  {editing ? (
                    <input
                      value={draft.etiquetasText}
                      onChange={(e) => setDraft({ ...draft, etiquetasText: e.target.value })}
                      placeholder="separadas por coma"
                      style={inputStyle}
                    />
                  ) : (
                    <div style={{ fontSize: 13.5 }}>
                      {detail.etiquetas.length > 0 ? detail.etiquetas.join(", ") : "—"}
                    </div>
                  )}
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  <div style={fieldLabelStyle}>Notas</div>
                  {editing ? (
                    <textarea
                      value={draft.notas}
                      onChange={(e) => setDraft({ ...draft, notas: e.target.value })}
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  ) : (
                    <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{detail.notas || "—"}</div>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "historial" ? (
              <div>
                {historial.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Sin historial todavía.</div>
                ) : (
                  historial.map((t, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "11px 0",
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      <div style={{ fontSize: 11.5, color: "var(--color-muted)", width: 120, flexShrink: 0 }}>
                        {formatIngreso(t.when)}
                      </div>
                      <div style={{ fontSize: 13 }}>{t.text}</div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      <ToastHost message={toast} />
    </div>
  );
}
