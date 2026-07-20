"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatIngreso } from "@/lib/format";
import { useToast } from "@/components/useToast";
import ToastHost from "@/components/ToastHost";
import type { ConversacionRow, MensajeRow } from "@/lib/types";

const CANAL_LABEL: Record<string, string> = {
  correo: "Correo",
  whatsapp: "WhatsApp",
};

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

function InboxView() {
  const searchParams = useSearchParams();
  const leadParam = searchParams.get("lead");
  const { toast, showToast } = useToast();

  const [conversaciones, setConversaciones] = useState<ConversacionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeRow[]>([]);
  const [currentUserCorreo, setCurrentUserCorreo] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyChannel, setReplyChannel] = useState<"correo" | "whatsapp">("correo");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingList(true);
      setError("");

      const [convRes, meRes] = await Promise.all([
        authedFetch("/api/conversations-list"),
        authedFetch("/api/auth-me"),
      ]);

      if (!convRes.ok) {
        setError("No fue posible cargar las conversaciones.");
        setLoadingList(false);
        return;
      }

      const convBody = await convRes.json();
      const lista: ConversacionRow[] = convBody.conversaciones ?? [];
      setConversaciones(lista);

      if (meRes.ok) {
        const meBody = await meRes.json();
        setCurrentUserCorreo(meBody.usuario?.correo ?? null);
      }

      const porLead = leadParam ? lista.find((c) => c.lead_id === leadParam) : null;
      const inicial = porLead ?? lista[0] ?? null;
      setSelectedId(inicial?.id ?? null);
      if (inicial) setReplyChannel(inicial.canal === "whatsapp" ? "whatsapp" : "correo");

      setLoadingList(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMensajes([]);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      setLoadingMessages(true);
      const res = await authedFetch(
        `/api/messages-list?conversacion_id=${encodeURIComponent(selectedId)}`
      );
      if (cancelled) return;
      if (!res.ok) {
        setError("No fue posible cargar los mensajes de esta conversación.");
        setLoadingMessages(false);
        return;
      }
      const body = await res.json();
      setMensajes(body.mensajes ?? []);
      setLoadingMessages(false);
    };

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectConversacion = (c: ConversacionRow) => {
    setSelectedId(c.id);
    setReplyChannel(c.canal === "whatsapp" ? "whatsapp" : "correo");
  };

  const sendReply = async () => {
    const texto = replyText.trim();
    if (!texto || !selectedId || sending) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: MensajeRow = {
      id: tempId,
      canal: replyChannel,
      direccion: "saliente",
      remitente: currentUserCorreo,
      destinatarios: null,
      asunto: null,
      cuerpo: texto,
      created_at: new Date().toISOString(),
    };

    setMensajes((prev) => [...prev, optimistic]);
    setReplyText("");
    setSending(true);

    const res = await authedFetch("/api/messages-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversacion_id: selectedId,
        canal: replyChannel,
        cuerpo: texto,
      }),
    });

    setSending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMensajes((prev) => prev.filter((m) => m.id !== tempId));
      showToast(body.error ?? "No fue posible enviar el mensaje.");
      return;
    }

    const body = await res.json();
    setMensajes((prev) => prev.map((m) => (m.id === tempId ? body.mensaje : m)));
    setConversaciones((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, estado: "abierta", ultimo_mensaje: texto, ultimo_mensaje_fecha: body.mensaje.created_at }
          : c
      )
    );
    showToast("Mensaje enviado.");
  };

  const activa = conversaciones.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      {error ? (
        <div style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{error}</div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          background: "var(--color-panel)",
          border: "1px solid var(--color-border)",
          borderRadius: 2,
          height: "calc(100vh - 170px)",
          overflow: "hidden",
        }}
      >
        <div style={{ borderRight: "1px solid var(--color-border)", overflow: "auto" }}>
          {loadingList ? (
            <div style={{ padding: "20px 16px", fontSize: 13, color: "var(--color-muted)" }}>
              Cargando…
            </div>
          ) : conversaciones.length === 0 ? (
            <div style={{ padding: "20px 16px", fontSize: 13, color: "var(--color-muted)" }}>
              No hay conversaciones todavía.
            </div>
          ) : (
            conversaciones.map((c) => (
              <div
                key={c.id}
                onClick={() => selectConversacion(c)}
                style={{
                  padding: "13px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  background: c.id === selectedId ? "var(--color-panel-2)" : "transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.contacto_nombre}</div>
                  <div style={{ fontSize: 10.5, color: "var(--color-muted)" }}>
                    {CANAL_LABEL[c.canal ?? ""] ?? c.canal ?? "—"}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-muted)",
                    marginTop: 3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.ultimo_mensaje ?? "Sin mensajes"}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {!activa ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-muted)",
                fontSize: 13,
              }}
            >
              Seleccione una conversación.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--color-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{activa.contacto_nombre}</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                    {activa.servicio ?? "Sin servicio"} · Responsable:{" "}
                    {activa.responsable_nombre ?? "Sin asignar"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 10,
                    background: "var(--color-panel-2)",
                    color: "var(--color-blue)",
                  }}
                >
                  {activa.etapa ?? activa.lead_estado}
                </span>
              </div>

              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {loadingMessages ? (
                  <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Cargando mensajes…</div>
                ) : mensajes.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--color-muted)" }}>
                    Sin mensajes en esta conversación.
                  </div>
                ) : (
                  mensajes.map((m) => {
                    const saliente = m.direccion === "saliente";
                    return (
                      <div
                        key={m.id}
                        style={{
                          maxWidth: "70%",
                          alignSelf: saliente ? "flex-end" : "flex-start",
                          background: saliente ? "var(--color-blue)" : "var(--color-panel-2)",
                          color: saliente ? "#fff" : "var(--color-text)",
                          borderRadius: 6,
                          padding: "10px 14px",
                        }}
                      >
                        <div style={{ fontSize: 12.5 }}>{m.cuerpo}</div>
                        <div style={{ fontSize: 10, opacity: 0.75, marginTop: 5 }}>
                          {CANAL_LABEL[m.canal] ?? m.canal} · {formatIngreso(m.created_at)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div
                style={{
                  padding: "14px 20px",
                  borderTop: "1px solid var(--color-border)",
                  display: "flex",
                  gap: 10,
                }}
              >
                <select
                  value={replyChannel}
                  onChange={(e) => setReplyChannel(e.target.value as "correo" | "whatsapp")}
                  style={{
                    fontSize: 12,
                    padding: "0 8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: 2,
                    background: "var(--color-bg)",
                    color: "var(--color-text)",
                  }}
                >
                  <option value="correo">Correo</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  placeholder="Escriba una respuesta…"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    border: "1px solid var(--color-border)",
                    borderRadius: 2,
                    background: "var(--color-bg)",
                    color: "var(--color-text)",
                    fontSize: 13,
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  style={{
                    padding: "10px 18px",
                    border: "none",
                    borderRadius: 2,
                    background: "var(--color-red)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 13,
                    opacity: sending || !replyText.trim() ? 0.6 : 1,
                  }}
                >
                  Enviar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ToastHost message={toast} />
    </>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxView />
    </Suspense>
  );
}
