"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { formatCurrency, formatIngreso, priorityStyle } from "../../../lib/format";
import { useToast } from "../../../components/useToast";
import ToastHost from "../../../components/ToastHost";
import LeadActivitiesList from "../../../components/LeadActivitiesList";
import type { ContactDetail, ContactListRow, CurrentUsuario, HistorialItem, ServicioRow } from "../../../lib/types";

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

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalCardStyle: React.CSSProperties = {
  width: 460,
  background: "var(--color-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  padding: 24,
  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
};

const modalLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-muted)",
  marginBottom: 6,
};

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

type NuevoContactoForm = {
  nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  correo: string;
  telefono: string;
  pais: string;
  empresa_nombre: string;
  servicio_id: string;
};

const FORM_VACIO: NuevoContactoForm = {
  nombre: "",
  primer_apellido: "",
  segundo_apellido: "",
  correo: "",
  telefono: "",
  pais: "",
  empresa_nombre: "",
  servicio_id: "",
};

export default function ContactosPage() {
  const { toast, showToast } = useToast();
  const [usuario, setUsuario] = useState<CurrentUsuario | null>(null);
  const [contactos, setContactos] = useState<ContactListRow[]>([]);
  const [servicios, setServicios] = useState<ServicioRow[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [tab, setTab] = useState<"info" | "historial" | "actividades">("info");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<NuevoContactoForm>(FORM_VACIO);
  const [creating, setCreating] = useState(false);

  const loadContactos = async (selectLeadId?: string) => {
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
    setServicios(body.servicios ?? []);
    setSelectedLeadId(selectLeadId ?? lista[0]?.id ?? null);
    setLoadingList(false);
  };

  useEffect(() => {
    loadContactos();
    authedFetch("/api/auth-me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setUsuario(body?.usuario ?? null));
  }, []);

  const openCreateModal = () => {
    setCreateForm(FORM_VACIO);
    setShowCreateModal(true);
  };

  const submitCreate = async () => {
    if (!createForm.nombre.trim()) {
      showToast("El nombre es obligatorio.");
      return;
    }
    setCreating(true);
    const res = await authedFetch("/api/contact-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: createForm.nombre.trim(),
        primer_apellido: createForm.primer_apellido.trim() || undefined,
        segundo_apellido: createForm.segundo_apellido.trim() || undefined,
        correo: createForm.correo.trim() || undefined,
        telefono_e164: createForm.telefono.trim() || undefined,
        pais: createForm.pais.trim() || undefined,
        empresa_nombre: createForm.empresa_nombre.trim() || undefined,
        servicio_id: createForm.servicio_id || undefined,
      }),
    });
    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible crear el contacto.");
      return;
    }

    const body = await res.json();
    setShowCreateModal(false);
    showToast("Contacto creado y asignado a Bayron.");
    await loadContactos(body.lead_id);
  };

  const deleteContact = async () => {
    if (!detail) return;
    if (
      !window.confirm(
        `¿Eliminar a ${detail.nombre_completo}? Dejará de aparecer en Contactos, Pipeline, Bandeja y Calendario. Esta acción no borra su historial y puede revertirse solo desde la base de datos.`
      )
    ) {
      return;
    }
    setDeleting(true);
    const res = await authedFetch("/api/contact-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacto_id: detail.contacto_id }),
    });
    setDeleting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible eliminar el contacto.");
      return;
    }

    showToast("Contacto eliminado.");
    setSelectedLeadId(null);
    await loadContactos();
  };

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
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          onClick={openCreateModal}
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
          + Nuevo contacto
        </button>
      </div>

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
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                {usuario?.rol === "Administrador general" ? (
                  <button
                    onClick={deleteContact}
                    disabled={deleting}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 12px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 2,
                      background: "var(--color-panel)",
                      color: "var(--color-red)",
                      opacity: deleting ? 0.6 : 1,
                    }}
                  >
                    {deleting ? "Eliminando…" : "Eliminar contacto"}
                  </button>
                ) : null}
              </div>
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
              <div
                onClick={() => setTab("actividades")}
                style={{
                  padding: "7px 14px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: 2,
                  background: tab === "actividades" ? "var(--color-red)" : "transparent",
                  color: tab === "actividades" ? "#fff" : "var(--color-muted)",
                }}
              >
                Actividades
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

            {tab === "actividades" ? <LeadActivitiesList leadId={detail.lead_id} /> : null}
          </>
        )}
      </div>
      </div>

      {showCreateModal ? (
        <div style={overlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              Nuevo contacto
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "span 3" }}>
                <div style={modalLabelStyle}>Nombre</div>
                <input
                  value={createForm.nombre}
                  onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })}
                  style={modalInputStyle}
                />
              </div>
              <div>
                <div style={modalLabelStyle}>Primer apellido</div>
                <input
                  value={createForm.primer_apellido}
                  onChange={(e) => setCreateForm({ ...createForm, primer_apellido: e.target.value })}
                  style={modalInputStyle}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <div style={modalLabelStyle}>Segundo apellido</div>
                <input
                  value={createForm.segundo_apellido}
                  onChange={(e) => setCreateForm({ ...createForm, segundo_apellido: e.target.value })}
                  style={modalInputStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <div style={modalLabelStyle}>Correo electrónico</div>
                <input
                  type="email"
                  value={createForm.correo}
                  onChange={(e) => setCreateForm({ ...createForm, correo: e.target.value })}
                  placeholder="nombre@dominio.com"
                  style={modalInputStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <div style={modalLabelStyle}>Teléfono (formato E.164)</div>
                <input
                  value={createForm.telefono}
                  onChange={(e) => setCreateForm({ ...createForm, telefono: e.target.value })}
                  placeholder="+50688000000"
                  style={modalInputStyle}
                />
              </div>

              <div>
                <div style={modalLabelStyle}>País</div>
                <input
                  value={createForm.pais}
                  onChange={(e) => setCreateForm({ ...createForm, pais: e.target.value })}
                  style={modalInputStyle}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <div style={modalLabelStyle}>Empresa (opcional)</div>
                <input
                  value={createForm.empresa_nombre}
                  onChange={(e) => setCreateForm({ ...createForm, empresa_nombre: e.target.value })}
                  style={modalInputStyle}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <div style={modalLabelStyle}>Servicio de interés</div>
                <select
                  value={createForm.servicio_id}
                  onChange={(e) => setCreateForm({ ...createForm, servicio_id: e.target.value })}
                  style={modalInputStyle}
                >
                  <option value="">Sin especificar</option>
                  {servicios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowCreateModal(false)}
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
                onClick={submitCreate}
                disabled={creating}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 16px",
                  border: "none",
                  borderRadius: 2,
                  background: "var(--color-red)",
                  color: "#fff",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? "Creando…" : "Crear contacto"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastHost message={toast} />
    </>
  );
}
