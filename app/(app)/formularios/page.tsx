"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { useToast } from "../../../components/useToast";
import ToastHost from "../../../components/ToastHost";
import type { FormularioCampo, FormularioListRow } from "../../../lib/types";

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

function nuevoCampo(): FormularioCampo {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : `campo-${Date.now()}`,
    label: "Campo nuevo",
    type: "texto",
    required: false,
    placeholder: "",
  };
}

const rowInputStyle: React.CSSProperties = {
  boxSizing: "border-box",
  padding: "6px 8px",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  background: "var(--color-bg)",
  color: "var(--color-text)",
  fontSize: 12.5,
};

export default function FormulariosPage() {
  const { toast, showToast } = useToast();
  const [formularios, setFormularios] = useState<FormularioListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);
  const [campos, setCampos] = useState<FormularioCampo[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingForm, setLoadingForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadList = async (selectAfter?: string) => {
    setLoadingList(true);
    const res = await authedFetch("/api/forms-list");
    if (!res.ok) {
      setError("No fue posible cargar los formularios.");
      setLoadingList(false);
      return;
    }
    const body = await res.json();
    const lista: FormularioListRow[] = body.formularios ?? [];
    setFormularios(lista);
    setSelectedId(selectAfter ?? lista[0]?.id ?? "new");
    setLoadingList(false);
  };

  useEffect(() => {
    const init = async () => {
      const meRes = await authedFetch("/api/auth-me");
      if (meRes.ok) {
        const meBody = await meRes.json();
        setCanEdit(
          meBody.usuario?.rol === "Administrador general" || meBody.usuario?.rol === "Supervisor"
        );
      }
      await loadList();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId || selectedId === "new") {
      setNombre("Nuevo formulario");
      setActivo(true);
      setCampos([]);
      return;
    }

    let cancelled = false;
    const loadForm = async () => {
      setLoadingForm(true);
      const res = await authedFetch(`/api/forms-get?id=${encodeURIComponent(selectedId)}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("No fue posible cargar el formulario.");
        setLoadingForm(false);
        return;
      }
      const body = await res.json();
      setNombre(body.formulario.nombre);
      setActivo(body.formulario.activo);
      setCampos(body.formulario.campos ?? []);
      setLoadingForm(false);
    };

    loadForm();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const addField = () => setCampos((prev) => [...prev, nuevoCampo()]);
  const removeField = (id: string) => setCampos((prev) => prev.filter((c) => c.id !== id));
  const updateField = (id: string, patch: Partial<FormularioCampo>) =>
    setCampos((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const guardar = async () => {
    if (!nombre.trim()) {
      showToast("El nombre del formulario es obligatorio.");
      return;
    }
    setSaving(true);
    const res = await authedFetch("/api/forms-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedId && selectedId !== "new" ? selectedId : undefined,
        nombre: nombre.trim(),
        activo,
        campos,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible guardar el formulario.");
      return;
    }

    const body = await res.json();
    showToast("Formulario guardado.");
    await loadList(body.id);
  };

  return (
    <>
      {error ? (
        <div style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{error}</div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value as string)}
          disabled={loadingList}
          style={{ ...rowInputStyle, fontSize: 13, padding: "8px 10px" }}
        >
          {formularios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre} {f.activo ? "" : "(inactivo)"}
            </option>
          ))}
          <option value="new">+ Nuevo formulario…</option>
        </select>

        {canEdit ? (
          <>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del formulario"
              style={{ ...rowInputStyle, fontSize: 13, padding: "8px 10px", minWidth: 220 }}
            />
            <label style={{ fontSize: 12.5, color: "var(--color-muted)", display: "flex", gap: 6 }}>
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Activo
            </label>
            <button
              onClick={guardar}
              disabled={saving}
              style={{
                marginLeft: "auto",
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 16px",
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
          <div style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
            Solo Administrador general o Supervisor pueden editar formularios.
          </div>
        )}
      </div>

      {loadingForm ? (
        <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Cargando formulario…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div
            style={{
              background: "var(--color-panel)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
              Campos del formulario — {nombre}
            </h2>

            {campos.map((f) => (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 0",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {canEdit ? (
                  <>
                    <input
                      value={f.label}
                      onChange={(e) => updateField(f.id, { label: e.target.value })}
                      style={{ ...rowInputStyle, flex: "1 1 140px" }}
                    />
                    <input
                      value={f.type}
                      onChange={(e) => updateField(f.id, { type: e.target.value })}
                      style={{ ...rowInputStyle, width: 100 }}
                      title="Tipo (texto, correo, teléfono, selección, texto largo)"
                    />
                    <label style={{ fontSize: 10.5, color: "var(--color-muted)", display: "flex", gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => updateField(f.id, { required: e.target.checked })}
                      />
                      requerido
                    </label>
                    <div
                      onClick={() => removeField(f.id)}
                      style={{ cursor: "pointer", color: "var(--color-muted)", fontSize: 13 }}
                      title="Quitar campo"
                    >
                      ✕
                    </div>
                    <div
                      style={{
                        flexBasis: "100%",
                        fontSize: 10.5,
                        color: "var(--color-muted)",
                        fontFamily: "monospace",
                      }}
                    >
                      id: {f.id}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, fontSize: 13 }}>{f.label}</div>
                    <span
                      style={{
                        fontSize: 10.5,
                        color: "var(--color-muted)",
                        border: "1px solid var(--color-border)",
                        padding: "2px 8px",
                        borderRadius: 10,
                      }}
                    >
                      {f.type}
                    </span>
                    {f.required ? (
                      <span style={{ fontSize: 10.5, color: "var(--color-red)", fontWeight: 700 }}>
                        requerido
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            ))}

            {canEdit ? (
              <button
                onClick={addField}
                style={{
                  marginTop: 14,
                  padding: "9px 16px",
                  border: "1px dashed var(--color-border)",
                  borderRadius: 2,
                  background: "none",
                  color: "var(--color-blue)",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                + Agregar campo
              </button>
            ) : null}
          </div>

          <div
            style={{
              background: "var(--color-panel)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Vista previa</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {campos.map((f) => (
                <div key={f.id}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-muted)",
                      marginBottom: 5,
                    }}
                  >
                    {f.label}
                    {f.required ? " *" : ""}
                  </div>
                  <input
                    disabled
                    placeholder={f.placeholder}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "9px 11px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 2,
                      background: "var(--color-bg)",
                      color: "var(--color-text)",
                      fontSize: 13,
                    }}
                  />
                </div>
              ))}
              <button
                disabled
                style={{
                  marginTop: 6,
                  padding: 11,
                  background: "var(--color-red)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 2,
                  fontWeight: 600,
                  fontSize: 13,
                  opacity: 0.85,
                }}
              >
                Enviar consulta
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastHost message={toast} />
    </>
  );
}
