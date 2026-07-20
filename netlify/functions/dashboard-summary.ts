import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { nombreCompleto } from "./_shared/contacto";
import { textoAuditoriaLead } from "./_shared/auditoriaTexto";

// GET /api/dashboard-summary?scope=general|personal — Panel General.
// "general" is only honored for Administrador general; anyone else asking
// for it is silently downgraded to "personal" (their own numbers), same as
// the toggle should never even be shown to them in the UI, but enforced
// here regardless.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const esAdmin = auth.usuario.rol === "Administrador general";
  const requestedScope = event.queryStringParameters?.scope === "personal" ? "personal" : "general";
  const scope = requestedScope === "general" && !esAdmin ? "personal" : requestedScope;

  const admin = getSupabaseAdmin();

  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("nombre", "Pipeline general")
    .maybeSingle();

  if (!pipeline) {
    return jsonResponse(500, { error: "No se encontró el pipeline general." });
  }

  const { data: etapas } = await admin
    .from("etapas")
    .select("id, nombre")
    .eq("pipeline_id", pipeline.id);

  const etapaNombre = new Map<string, string>((etapas ?? []).map((e: any) => [e.id, e.nombre]));
  const ganadoEtapaId = (etapas ?? []).find((e: any) => e.nombre === "Ganado")?.id ?? null;

  let leadsQuery = admin
    .from("leads")
    .select("id, etapa_id, responsable_id, created_at")
    .eq("pipeline_id", pipeline.id);

  if (scope === "personal") {
    leadsQuery = leadsQuery.eq("responsable_id", auth.usuario.id);
  }

  const { data: leadsData, error: leadsError } = await leadsQuery;
  if (leadsError) {
    return jsonResponse(500, { error: "No fue posible cargar los leads." });
  }

  const leads = leadsData ?? [];
  const totalLeads = leads.length;
  const leadIds = leads.map((l) => l.id);

  // --- KPI 1: leads recibidos (mes actual) ---
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
  const leadsRecibidosMes = leads.filter((l) => new Date(l.created_at) >= inicioMes).length;

  // --- KPI 3: tasa de conversión (etapa 'Ganado' / total) ---
  const ganadoCount = ganadoEtapaId ? leads.filter((l) => l.etapa_id === ganadoEtapaId).length : 0;
  const tasaConversionPct = totalLeads > 0 ? Math.round((ganadoCount / totalLeads) * 100) : 0;

  // --- KPI 2: tiempo promedio hasta la primera respuesta saliente ---
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

      for (const m of mensajes ?? []) {
        const leadId = convToLead.get(m.conversacion_id);
        if (!leadId || primeraRespuestaPorLead.has(leadId)) continue;
        primeraRespuestaPorLead.set(leadId, m.created_at);
      }
    }
  }

  const diffsHoras: number[] = [];
  for (const l of leads) {
    const primera = primeraRespuestaPorLead.get(l.id);
    if (!primera) continue;
    const horas = (new Date(primera).getTime() - new Date(l.created_at).getTime()) / 3_600_000;
    if (horas >= 0) diffsHoras.push(horas);
  }
  const tiempoPromedioRespuestaHoras =
    diffsHoras.length > 0 ? diffsHoras.reduce((a, b) => a + b, 0) / diffsHoras.length : null;

  // --- KPI 4: leads sin seguimiento (sin actividad futura pendiente) ---
  let leadsConSeguimiento = new Set<string>();
  if (leadIds.length > 0) {
    const { data: pendientes } = await admin
      .from("actividades")
      .select("lead_id")
      .in("lead_id", leadIds)
      .eq("estado", "pendiente")
      .gt("fecha", now.toISOString());
    leadsConSeguimiento = new Set((pendientes ?? []).map((p: any) => p.lead_id));
  }
  const leadsSinSeguimiento = leads.filter((l) => !leadsConSeguimiento.has(l.id)).length;

  // --- Actividad reciente: últimas 5 entradas de auditoria sobre leads ---
  let auditoriaQuery = admin
    .from("auditoria")
    .select("usuario_id, accion, entidad_id, estado_anterior, estado_posterior, created_at")
    .eq("entidad", "leads")
    .order("created_at", { ascending: false })
    .limit(5);

  // Personal scope with zero leads means zero rows, full stop — skip the
  // query rather than relying on how the client library handles `.in()`
  // with an empty array.
  const { data: auditoriaRows } =
    scope === "personal" && leadIds.length === 0
      ? { data: [] }
      : await (scope === "personal" ? auditoriaQuery.in("entidad_id", leadIds) : auditoriaQuery);

  const auditoriaLeadIds = Array.from(
    new Set((auditoriaRows ?? []).map((a: any) => a.entidad_id).filter(Boolean))
  );
  const usuarioIdsAuditoria = Array.from(
    new Set((auditoriaRows ?? []).map((a: any) => a.usuario_id).filter(Boolean))
  );

  const [{ data: leadsParaAuditoria }, { data: usuariosParaAuditoria }] = await Promise.all([
    auditoriaLeadIds.length > 0
      ? admin
          .from("leads")
          .select("id, contacto:contacto_id ( nombre, primer_apellido, segundo_apellido )")
          .in("id", auditoriaLeadIds)
      : Promise.resolve({ data: [] }),
    usuarioIdsAuditoria.length > 0
      ? admin.from("usuarios").select("id, nombre_completo").in("id", usuarioIdsAuditoria)
      : Promise.resolve({ data: [] }),
  ]);

  const leadNombrePorId = new Map<string, string>(
    ((leadsParaAuditoria as any[]) ?? []).map((l) => [l.id, nombreCompleto(l.contacto ?? {})])
  );
  const usuarioNombrePorId = new Map<string, string>(
    ((usuariosParaAuditoria as any[]) ?? []).map((u) => [u.id, u.nombre_completo])
  );

  const actividadReciente = (auditoriaRows ?? []).map((a: any) => ({
    when: a.created_at,
    text: `${leadNombrePorId.get(a.entidad_id) ?? "Un lead"} — ${textoAuditoriaLead(
      a,
      usuarioNombrePorId,
      etapaNombre
    )}`,
  }));

  // --- Próximas actividades: no completadas, ordenadas por fecha ---
  let proximasQuery = admin
    .from("actividades")
    .select(
      `id, tipo, fecha,
       lead:lead_id ( contacto:contacto_id ( nombre, primer_apellido, segundo_apellido ) )`
    )
    .neq("estado", "completada")
    .order("fecha", { ascending: true })
    .limit(5);

  if (scope === "personal") {
    proximasQuery = proximasQuery.eq("responsable_id", auth.usuario.id);
  }

  const { data: proximasRows } = await proximasQuery;

  const proximasActividades = (proximasRows ?? []).map((a: any) => ({
    id: a.id,
    tipo: a.tipo,
    fecha: a.fecha,
    lead_nombre: a.lead?.contacto ? nombreCompleto(a.lead.contacto) : "Lead eliminado",
  }));

  return jsonResponse(200, {
    scope,
    kpis: {
      leadsRecibidosMes,
      tiempoPromedioRespuestaHoras,
      tasaConversionPct,
      leadsSinSeguimiento,
    },
    actividadReciente,
    proximasActividades,
  });
};
