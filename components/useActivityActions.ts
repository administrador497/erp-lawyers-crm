"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase/client";
import type { ActividadRow } from "../lib/types";
import { toDatetimeLocalValue } from "./activityShared";

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

// Completar/Reabrir/Editar de una actividad — misma lógica que usaba
// /calendario en exclusiva, ahora compartida para que también funcione desde
// LeadActivitiesList (contactos, pipeline, inbox) sin duplicar el fetch ni
// los modales. El consumidor monta <ActivityActionModals actions={...} />
// una vez y decide él mismo cómo mostrar el toast y actualizar su lista.
export function useActivityActions(params: {
  showToast: (msg: string) => void;
  onUpdated: (id: string, patch: Partial<ActividadRow>) => void;
}) {
  const { showToast, onUpdated } = params;

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [completingActivity, setCompletingActivity] = useState<ActividadRow | null>(null);
  const [completeResultado, setCompleteResultado] = useState("");
  const [completeProximaAccion, setCompleteProximaAccion] = useState("");
  const [completingSubmitting, setCompletingSubmitting] = useState(false);

  const [editingActivity, setEditingActivity] = useState<ActividadRow | null>(null);
  const [editTipo, setEditTipo] = useState("llamada");
  const [editFecha, setEditFecha] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const reabrirActividad = async (actividad: ActividadRow) => {
    setTogglingId(actividad.id);
    const res = await authedFetch("/api/activity-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activity_id: actividad.id, estado: "pendiente" }),
    });
    setTogglingId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible actualizar la actividad.");
      return;
    }

    onUpdated(actividad.id, { estado: "pendiente" });
    showToast("Actividad reabierta.");
  };

  const abrirCompletarActividad = (actividad: ActividadRow) => {
    setCompletingActivity(actividad);
    setCompleteResultado(actividad.resultado ?? "");
    setCompleteProximaAccion(actividad.proxima_accion ?? "");
  };

  const confirmarCompletarActividad = async () => {
    if (!completingActivity) return;
    setCompletingSubmitting(true);

    const res = await authedFetch("/api/activity-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity_id: completingActivity.id,
        estado: "completada",
        resultado: completeResultado.trim() || null,
        proxima_accion: completeProximaAccion.trim() || null,
      }),
    });

    setCompletingSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible completar la actividad.");
      return;
    }

    onUpdated(completingActivity.id, {
      estado: "completada",
      resultado: completeResultado.trim() || null,
      proxima_accion: completeProximaAccion.trim() || null,
    });
    setCompletingActivity(null);
    showToast("Actividad completada.");
  };

  const abrirEditarActividad = (actividad: ActividadRow) => {
    setEditingActivity(actividad);
    setEditTipo(actividad.tipo);
    setEditFecha(toDatetimeLocalValue(new Date(actividad.fecha)));
    setEditDescripcion(actividad.descripcion ?? "");
  };

  const confirmarEditarActividad = async () => {
    if (!editingActivity || !editFecha) return;
    setEditSubmitting(true);

    const fechaIso = new Date(editFecha).toISOString();
    const res = await authedFetch("/api/activity-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity_id: editingActivity.id,
        tipo: editTipo,
        fecha: fechaIso,
        descripcion: editDescripcion.trim() || null,
      }),
    });

    setEditSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "No fue posible editar la actividad.");
      return;
    }

    onUpdated(editingActivity.id, {
      tipo: editTipo,
      fecha: fechaIso,
      descripcion: editDescripcion.trim() || null,
    });
    setEditingActivity(null);
    showToast("Actividad actualizada.");
  };

  return {
    togglingId,
    reabrirActividad,
    completingActivity,
    completeResultado,
    setCompleteResultado,
    completeProximaAccion,
    setCompleteProximaAccion,
    completingSubmitting,
    abrirCompletarActividad,
    confirmarCompletarActividad,
    cerrarCompletar: () => setCompletingActivity(null),
    editingActivity,
    editTipo,
    setEditTipo,
    editFecha,
    setEditFecha,
    editDescripcion,
    setEditDescripcion,
    editSubmitting,
    abrirEditarActividad,
    confirmarEditarActividad,
    cerrarEditar: () => setEditingActivity(null),
  };
}

export type ActivityActions = ReturnType<typeof useActivityActions>;
