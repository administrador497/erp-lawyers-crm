import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { nombreCompleto } from "./_shared/contacto";

// GET /api/pipeline-list — Kanban board data. Etapas are a shared catalog
// (always returned in full, same as every user sees the same column
// headers); leads are role-filtered: Administrador general sees every
// lead, a Usuario estándar only sees leads assigned to them — same rule as
// leads-inbox.ts / conversations-list.ts.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();

  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("nombre", "Pipeline general")
    .maybeSingle();

  if (!pipeline) {
    return jsonResponse(500, { error: "No se encontró el pipeline general. Revise migrations/001_init.sql." });
  }

  const { data: etapas, error: etapasError } = await admin
    .from("etapas")
    .select("id, nombre, orden")
    .eq("pipeline_id", pipeline.id)
    .order("orden", { ascending: true });

  if (etapasError) {
    return jsonResponse(500, { error: "No fue posible cargar las etapas del pipeline." });
  }

  let leadsQuery = admin
    .from("leads")
    .select(
      `id, prioridad, valor_potencial, etapa_id, responsable_id,
       contacto:contacto_id ( nombre, primer_apellido, segundo_apellido ),
       servicio:servicio_id ( nombre ),
       responsable:responsable_id ( nombre_completo )`
    )
    .eq("pipeline_id", pipeline.id);

  if (auth.usuario.rol !== "Administrador general") {
    leadsQuery = leadsQuery.eq("responsable_id", auth.usuario.id);
  }

  const { data: leads, error: leadsError } = await leadsQuery;

  if (leadsError) {
    return jsonResponse(500, { error: "No fue posible cargar los leads del pipeline." });
  }

  const { data: motivosPerdida, error: motivosError } = await admin
    .from("motivos_perdida")
    .select("id, nombre")
    .order("orden", { ascending: true });

  if (motivosError) {
    return jsonResponse(500, { error: "No fue posible cargar los motivos de pérdida." });
  }

  const result = (leads ?? []).map((l: any) => ({
    id: l.id,
    nombre_completo: nombreCompleto(l.contacto ?? {}),
    servicio: l.servicio?.nombre ?? null,
    valor_potencial: l.valor_potencial,
    prioridad: l.prioridad,
    etapa_id: l.etapa_id,
    responsable_id: l.responsable_id,
    responsable_nombre: l.responsable?.nombre_completo ?? null,
  }));

  return jsonResponse(200, {
    etapas: etapas ?? [],
    leads: result,
    motivosPerdida: motivosPerdida ?? [],
  });
};
