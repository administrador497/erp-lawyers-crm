"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { useToast } from "../../../components/useToast";
import ToastHost from "../../../components/ToastHost";
import type { EquipoRow, RolRow, UsuarioRow } from "../../../lib/types";

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
  width: 380,
  background: "var(--color-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  padding: 24,
  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
};

const tempPasswordBoxStyle: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 15,
  fontWeight: 700,
  padding: "10px 12px",
  background: "var(--color-panel-2)",
  border: "1px solid var(--color-border)",
  borderRadius: 2,
  marginBottom: 8,
  wordBreak: "break-all",
};

export default function UsuariosPage() {
  const { toast, showToast } = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [roles, setRoles] = useState<RolRow[]>([]);
  const [equipos, setEquipos] = useState<EquipoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createNombre, setCreateNombre] = useState("");
  const [createCorreo, setCreateCorreo] = useState("");
  const [createRolId, setCreateRolId] = useState("");
  const [createEquipoId, setCreateEquipoId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<UsuarioRow | null>(null);
  const [editRolId, setEditRolId] = useState("");
  const [editEquipoId, setEditEquipoId] = useState("");
  const [editActivo, setEditActivo] = useState(true);
  const [editCanalCorreo, setEditCanalCorreo] = useState(false);
  const [editCanalWhatsapp, setEditCanalWhatsapp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editTempPasswordResult, setEditTempPasswordResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    const res = await authedFetch("/api/users-list");

    if (res.status === 403) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError("No fue posible cargar los usuarios.");
      setLoading(false);
      return;
    }

    const body = await res.json();
    setUsuarios(body.usuarios ?? []);
    setRoles(body.roles ?? []);
    setEquipos(body.equipos ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreateModal = () => {
    setCreateNombre("");
    setCreateCorreo("");
    setCreateRolId(roles[0]?.id ?? "");
    setCreateEquipoId("");
    setCreatedTempPassword(null);
    setShowCreateModal(true);
  };

  const submitCreate = async () => {
    if (!createNombre.trim() || !createCorreo.trim() || !createRolId) {
      showToast("Nombre, correo y rol son obligatorios.");
      return;
    }
    setCreating(true);
    const res = await authedFetch("/api/user-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre_completo: createNombre.trim(),
        correo: createCorreo.trim(),
        rol_id: createRolId,
        equipo_id: createEquipoId || null,
        canales_autorizados: [],
      }),
    });
    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible crear el usuario.");
      return;
    }

    const body = await res.json();
    setCreatedTempPassword(body.temp_password);
    load();
  };

  const openEditModal = (u: UsuarioRow) => {
    setEditingUser(u);
    setEditRolId(u.rol_id ?? "");
    setEditEquipoId(u.equipo_id ?? "");
    setEditActivo(u.activo);
    setEditCanalCorreo(u.canales_autorizados.includes("correo"));
    setEditCanalWhatsapp(u.canales_autorizados.includes("whatsapp"));
    setEditTempPasswordResult(null);
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    const canales = [
      ...(editCanalCorreo ? ["correo"] : []),
      ...(editCanalWhatsapp ? ["whatsapp"] : []),
    ];
    const res = await authedFetch("/api/user-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usuario_id: editingUser.id,
        rol_id: editRolId || undefined,
        equipo_id: editEquipoId || null,
        activo: editActivo,
        canales_autorizados: canales,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible guardar los cambios.");
      return;
    }

    showToast("Usuario actualizado.");
    setEditingUser(null);
    load();
  };

  const resetPassword = async () => {
    if (!editingUser) return;
    if (
      !window.confirm(
        `¿Restablecer la contraseña de ${editingUser.nombre_completo}? Deberá cambiarla en su próximo ingreso.`
      )
    ) {
      return;
    }
    setResetting(true);
    const res = await authedFetch("/api/user-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario_id: editingUser.id, forzar_reset_password: true }),
    });
    setResetting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible restablecer la contraseña.");
      return;
    }

    const body = await res.json();
    setEditTempPasswordResult(body.temp_password);
    load();
  };

  if (accessDenied) {
    return (
      <div style={{ fontSize: 13, color: "var(--color-muted)" }}>
        Solo Administrador general puede ver Usuarios y roles.
      </div>
    );
  }

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
          + Crear usuario
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
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr 0.8fr",
            gap: 8,
            padding: "12px 16px",
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--color-blue)",
            textTransform: "uppercase",
            background: "var(--color-panel-2)",
          }}
        >
          <div>Usuario</div>
          <div>Correo</div>
          <div>Rol</div>
          <div>Estado</div>
          <div>Acción</div>
        </div>

        {loading ? (
          <div style={{ padding: "20px 16px", fontSize: 13, color: "var(--color-muted)" }}>Cargando…</div>
        ) : usuarios.length === 0 ? (
          <div style={{ padding: "20px 16px", fontSize: 13, color: "var(--color-muted)" }}>
            No hay usuarios registrados.
          </div>
        ) : (
          usuarios.map((u) => (
            <div
              key={u.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr 0.8fr",
                gap: 8,
                padding: "13px 16px",
                borderTop: "1px solid var(--color-border)",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{u.nombre_completo}</div>
              <div style={{ fontSize: 12.5, color: "var(--color-muted)" }}>{u.correo}</div>
              <div style={{ fontSize: 12.5 }}>{u.rol_nombre}</div>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 9px",
                    borderRadius: 10,
                    background: u.activo ? "#E1F0E5" : "var(--color-panel-2)",
                    color: u.activo ? "#1E8A4C" : "var(--color-muted)",
                  }}
                >
                  {u.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div
                onClick={() => openEditModal(u)}
                style={{ fontSize: 12, color: "var(--color-blue)", cursor: "pointer", fontWeight: 600 }}
              >
                Editar
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal ? (
        <div style={overlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              Crear usuario
            </h2>

            {createdTempPassword ? (
              <>
                <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 10 }}>
                  Usuario creado. Esta es su contraseña temporal — cópiela ahora, no se mostrará de nuevo:
                </div>
                <div style={tempPasswordBoxStyle}>{createdTempPassword}</div>
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 20 }}>
                  Deberá cambiarla al iniciar sesión por primera vez.
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowCreateModal(false)}
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
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={modalLabelStyle}>Nombre completo</div>
                    <input
                      value={createNombre}
                      onChange={(e) => setCreateNombre(e.target.value)}
                      style={modalInputStyle}
                    />
                  </div>
                  <div>
                    <div style={modalLabelStyle}>Correo electrónico</div>
                    <input
                      type="email"
                      value={createCorreo}
                      onChange={(e) => setCreateCorreo(e.target.value)}
                      placeholder="nombre@erplawyers.com"
                      style={modalInputStyle}
                    />
                  </div>
                  <div>
                    <div style={modalLabelStyle}>Rol</div>
                    <select
                      value={createRolId}
                      onChange={(e) => setCreateRolId(e.target.value)}
                      style={modalInputStyle}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={modalLabelStyle}>Equipo (opcional)</div>
                    <select
                      value={createEquipoId}
                      onChange={(e) => setCreateEquipoId(e.target.value)}
                      style={modalInputStyle}
                    >
                      <option value="">Sin equipo</option>
                      {equipos.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.nombre}
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
                    {creating ? "Creando…" : "Crear"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {editingUser ? (
        <div style={overlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Editar usuario
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 16 }}>
              {editingUser.nombre_completo} · {editingUser.correo}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={modalLabelStyle}>Rol</div>
                <select value={editRolId} onChange={(e) => setEditRolId(e.target.value)} style={modalInputStyle}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={modalLabelStyle}>Equipo</div>
                <select
                  value={editEquipoId}
                  onChange={(e) => setEditEquipoId(e.target.value)}
                  style={modalInputStyle}
                >
                  <option value="">Sin equipo</option>
                  {equipos.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={editActivo} onChange={(e) => setEditActivo(e.target.checked)} />
                Cuenta activa
              </label>
              <div>
                <div style={modalLabelStyle}>Canales autorizados</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={editCanalCorreo}
                      onChange={(e) => setEditCanalCorreo(e.target.checked)}
                    />
                    Correo
                  </label>
                  <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={editCanalWhatsapp}
                      onChange={(e) => setEditCanalWhatsapp(e.target.checked)}
                    />
                    WhatsApp
                  </label>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid var(--color-border)",
              }}
            >
              {editTempPasswordResult ? (
                <>
                  <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 8 }}>
                    Nueva contraseña temporal — cópiela ahora, no se mostrará de nuevo:
                  </div>
                  <div style={tempPasswordBoxStyle}>{editTempPasswordResult}</div>
                </>
              ) : (
                <button
                  onClick={resetPassword}
                  disabled={resetting}
                  style={{
                    fontSize: 12.5,
                    padding: "8px 14px",
                    border: "1px solid var(--color-border)",
                    borderRadius: 2,
                    background: "var(--color-panel)",
                    color: "var(--color-red)",
                    fontWeight: 600,
                    opacity: resetting ? 0.6 : 1,
                  }}
                >
                  {resetting ? "Restableciendo…" : "Restablecer contraseña"}
                </button>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setEditingUser(null)}
                disabled={saving}
                style={{
                  fontSize: 13,
                  padding: "9px 16px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 2,
                  background: "var(--color-panel)",
                  color: "var(--color-text)",
                }}
              >
                Cerrar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 16px",
                  border: "none",
                  borderRadius: 2,
                  background: "var(--color-red)",
                  color: "#fff",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastHost message={toast} />
    </>
  );
}
