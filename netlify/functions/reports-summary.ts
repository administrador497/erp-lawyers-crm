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

const DIAS_LEADS_RECIENTES = 30;

// GET /api/reports-summary — Reportes: 6 KPIs reales de negocio (revisión
// completa reemplazando las 3 tarjetas anteriores, que no medían lo que
// decían medir — ver README para el detalle de qué se descartó y por qué):
//
// 1. leadsPorCanal: leads recibidos en los últimos 30 días por canal
//    (antes: acumulado histórico total, sin filtrar deleted_at).
// 2. tasaConversion: % de leads que llegan a "Ganado" sobre el total,
//    excluyendo Duplicado/Descartado del denominador — esos son salidas,
//    no pasos de un embudo real (antes: solo una foto de la distribución
//    por etapa, llamada "embudo" sin calcular ninguna tasa).
// 3. motivosPerdida: desglose de los leads en "Perdido" por motivo_perdida
//    — nunca se mostraba en ningún reporte pese a capturarse desde
//    migrations/007_pipeline_etapas_v2.sql.
// 4. leadsPorServicio: qué práctica legal genera más leads — tampoco se
//    mostraba antes.
// 5-6. desempenoPorUsuario: tiempo promedio de primera respuesta (se
//    mantiene el cálculo que ya existía, solo se le quita la palabra "SLA"
//    porque no hay ningún umbral definido contra el cual medir
//    "cumplimiento") + actividades atrasadas por responsable (nunca se
//    mostraba en Reportes pese a que /calendario ya agrupa por esto).
//
// Administrador general ve todo; Usuario estándar solo sus propios leads/
// actividades y su propia fila en desempenoPorUsuario — mismo criterio de
// siempre.
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
    .select("id, nombre")
    .eq("pipeline_id", pipeline.id);

  if (etapasError) {
    return jsonResponse(500, { error: "No fue posible cargar las etapas." });
  }

  const etapaIdPorNombre = new Map((etapas ?? []).map((e) => [e.nombre, e.id]));
  const idGanado = etapaIdPorNombre.get("Ganado");
  const idDuplicado = etapaIdPorNombre.get("Duplicado");
  const idDescartado = etapaIdPorNombre.get("Descartado");
  const idPerdido = etapaIdPorNombre.get("Perdido");

  // Base: todos los leads activos (no eliminados) que puede ver este rol —
  // se reutiliza para tasa de conversión, motivos de pérdida, leads por
  // servicio y el cálculo de tiempo de respuesta.
  let leadsQuery = admin
    .from("leads")
    .select("id, canal_origen, etapa_id, servicio_id, responsable_id, motivo_perdida_id, created_at")
    .eq("pipeline_id", pipeline.id)
    .is("deleted_at", null);

  if (!esAdmin) {
    leadsQuery = leadsQuery.eq("responsable_id", auth.usuario.id);
  }

  const { data: leads, error: leadsError } = await leadsQuery;

  if (leadsError) {
    return jsonResponse(500, { error: "No fue posible cargar los leads." });
  }

  const leadsList = leads ?? [];

  // --- 1. Leads recibidos por canal, últimos 30 días ---
  const desdeIso = new Date(Date.now() - DIAS_LEADS_RECIENTES * 24 * 60 * 60 * 1000).toISOString();
  const leadsRecientes = leadsList.filter((l) => l.created_at >= desdeIso);
  const channelCounts: Record<string, number> = {};
  for (const l of leadsRecientes) {
    channelCounts[l.canal_origen] = (channelCounts[l.canal_origen] ?? 0) + 1;
  }
  const leadsPorCanal = Object.entries(channelCounts).map(([canal, count]) => ({
    canal_origen: canal,
    label: CANAL_LABELS[canal] ?? canal,
    count,
  }));

  // --- 2. Tasa de conversión real (Ganado / total, sin Duplicado/Descartado) ---
  const leadsConsiderados = leadsList.filter(
    (l) => l.etapa_id !== idDuplicado && l.etapa_id !== idDescartado
  );
  const ganados = idGanado ? leadsConsiderados.filter((l) => l.etapa_id === idGanado).length : 0;
  const tasaConversion = {
    ganados,
    totalConsiderado: leadsConsiderados.length,
    pct: leadsConsiderados.length > 0 ? Math.round((ganados / leadsConsiderados.length) * 100) : 0,
  };

  // --- 3. Motivos de pérdida (leads actualmente en "Perdido") ---
  const { data: motivosCatalogo } = await admin.from("motivos_perdida").select("id, nombre");
  const nombreMotivoPorId = new Map((motivosCatalogo ?? []).map((m) => [m.id, m.nombre]));
  const perdidos = idPerdido ? leadsList.filter((l) => l.etapa_id === idPerdido) : [];
  const motivoCounts: Record<string, number> = {};
  for (const l of perdidos) {
    const nombreMotivo = l.motivo_perdida_id ? nombreMotivoPorId.get(l.motivo_perdida_id) ?? "Otro" : "Sin motivo registrado";
    motivoCounts[nombreMotivo] = (motivoCounts[nombreMotivo] ?? 0) + 1;
  }
  const motivosPerdida = Object.entries(motivoCounts)
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count);

  // --- 4. Leads por servicio (práctica legal) ---
  const { data: serviciosCatalogo } = await admin.from("servicios").select("id, nombre");
  const nombreServicioPorId = new Map((serviciosCatalogo ?? []).map((s) => [s.id, s.nombre]));
  const servicioCounts: Record<string, number> = {};
  for (const l of leadsList) {
    const nombreServicio = l.servicio_id ? nombreServicioPorId.get(l.servicio_id) ?? "Otro" : "Sin servicio";
    servicioCounts[nombreServicio] = (servicioCounts[nombreServicio] ?? 0) + 1;
  }
  const leadsPorServicio = Object.entries(servicioCounts)
    .map(([servicio, count]) => ({ servicio, count }))
    .sort((a, b) => b.count - a.count);

  // --- 5 y 6. Desempeño por responsable: tiempo de primera respuesta + actividades atrasadas ---
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

  // Actividades atrasadas: pendientes con fecha anterior a hoy, del lead no
  // eliminado — mismo criterio "Atrasadas" que ya usa /calendario.
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);

  let atrasadasQuery = admin
    .from("actividades")
    .select("responsable_id, lead:lead_id!inner ( id )")
    .neq("estado", "completada")
    .lt("fecha", inicioHoy.toISOString())
    .is("lead.deleted_at", null);

  if (!esAdmin) {
    atrasadasQuery = atrasadasQuery.eq("responsable_id", auth.usuario.id);
  }

  const { data: atrasadas } = await atrasadasQuery;
  const atrasadasPorUsuario: Record<string, number> = {};
  for (const a of atrasadas ?? []) {
    if (!a.responsable_id) continue;
    atrasadasPorUsuario[a.responsable_id] = (atrasadasPorUsuario[a.responsable_id] ?? 0) + 1;
  }

  const desempenoPorUsuario = usuariosObjetivo.map((u) => {
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
      tiempo_respuesta_promedio_horas: promedio,
      actividades_atrasadas: atrasadasPorUsuario[u.id] ?? 0,
    };
  });

  return jsonResponse(200, {
    leadsPorCanal,
    tasaConversion,
    motivosPerdida,
    leadsPorServicio,
    desempenoPorUsuario,
  });
};
