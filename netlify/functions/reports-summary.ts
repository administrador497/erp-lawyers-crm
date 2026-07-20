import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

const CANAL_LABELS: Record<string, string> = {
  wordpress: "WordPress",
  crm_form: "Formulario CRM",
  correo: "Correo",
  whatsapp: "WhatsApp",
  manual: "Manual",
  importacion: "Importación",
};

// GET /api/reports-summary — Reportes: leads por canal, embudo por etapa
// (sobre las 8 etapas actuales de 'Pipeline general'), y por usuario los
// leads asignados + tiempo promedio hasta la primera respuesta saliente.
// Administrador general ve todo; Usuario estándar solo sus propios leads y
// su propia fila de tiempo de respuesta (no las de sus colegas).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();
  const esAdmin = auth.usuario.rol === "Administrador general";

  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("nombre", "Pipeline general")
    .maybeSingle();

  if (!pipeline) {
    return jsonResponse(500, { error: "No se encontró el pipeline general." });
  }

  const { data: etapas, error: etapasError } = await admin
    .from("etapas")
    .select("id, nombre, orden")
    .eq("pipeline_id", pipeline.id)
    .order("orden", { ascending: true });

  if (etapasError) {
    return jsonResponse(500, { error: "No fue posible cargar las etapas." });
  }

  let leadsQuery = admin
    .from("leads")
    .select("id, canal_origen, etapa_id, responsable_id, created_at")
    .eq("pipeline_id", pipeline.id);

  if (!esAdmin) {
    leadsQuery = leadsQuery.eq("responsable_id", auth.usuario.id);
  }

  const { data: leads, error: leadsError } = await leadsQuery;

  if (leadsError) {
    return jsonResponse(500, { error: "No fue posible cargar los leads." });
  }

  const leadsList = leads ?? [];
  const totalLeads = leadsList.length;

  // --- Leads por canal ---
  const channelCounts: Record<string, number> = {};
  for (const l of leadsList) {
    channelCounts[l.canal_origen] = (channelCounts[l.canal_origen] ?? 0) + 1;
  }
  const channelBars = Object.entries(channelCounts).map(([canal, value]) => ({
    canal_origen: canal,
    label: CANAL_LABELS[canal] ?? canal,
    value,
  }));

  // --- Embudo de conversión (proporción del total en cada etapa) ---
  const funnel = (etapas ?? []).map((etapa) => {
    const value = leadsList.filter((l) => l.etapa_id === etapa.id).length;
    return {
      label: etapa.nombre,
      value,
      pct: totalLeads > 0 ? Math.round((value / totalLeads) * 100) : 0,
    };
  });

  // --- Leads asignados + tiempo promedio de primera respuesta, por usuario ---
  let usuariosObjetivo: { id: string; nombre_completo: string }[];
  if (esAdmin) {
    const { data: todos } = await admin
      .from("usuarios")
      .select("id, nombre_completo")
      .eq("activo", true)
      .order("nombre_completo", { ascending: true });
    usuariosObjetivo = todos ?? [];
  } else {
    usuariosObjetivo = [{ id: auth.usuario.id, nombre_completo: auth.usuario.nombre_completo }];
  }

  const leadIds = leadsList.map((l) => l.id);
  const primeraRespuestaPorLead = new Map<string, string>();

  if (leadIds.length > 0) {
    const { data: conversaciones } = await admin
      .from("conversaciones")
      .select("id, lead_id")
      .in("lead_id", leadIds);

    const convToLead = new Map<string, string>();
    for (const c of conversaciones ?? []) {
      if (c.lead_id) convToLead.set(c.id, c.lead_id);
    }

    const convIds = Array.from(convToLead.keys());
    if (convIds.length > 0) {
      const { data: mensajes } = await admin
        .from("mensajes")
        .select("conversacion_id, created_at")
        .eq("direccion", "saliente")
        .in("conversacion_id", convIds)
        .order("created_at", { ascending: true });

      // Ordered ascending, so the first "saliente" message seen per lead is
      // its earliest — exactly the first-response timestamp we want.
      for (const m of mensajes ?? []) {
        const leadId = convToLead.get(m.conversacion_id);
        if (!leadId || primeraRespuestaPorLead.has(leadId)) continue;
        primeraRespuestaPorLead.set(leadId, m.created_at);
      }
    }
  }

  const slaByUser = usuariosObjetivo.map((u) => {
    const leadsDelUsuario = leadsList.filter((l) => l.responsable_id === u.id);
    const diffs: number[] = [];
    for (const l of leadsDelUsuario) {
      const primera = primeraRespuestaPorLead.get(l.id);
      if (!primera) continue;
      const horas = (new Date(primera).getTime() - new Date(l.created_at).getTime()) / 3_600_000;
      if (horas >= 0) diffs.push(horas);
    }
    const promedio = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;

    return {
      usuario_id: u.id,
      nombre: u.nombre_completo,
      leads_asignados: leadsDelUsuario.length,
      tiempo_promedio_horas: promedio,
    };
  });

  return jsonResponse(200, { channelBars, funnel, slaByUser, totalLeads });
};
