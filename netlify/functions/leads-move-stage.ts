import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

const ETAPA_PERDIDO = "Perdido";

type MoveBody = {
  lead_id?: string;
  etapa_id?: string;
  motivo_perdida_id?: string;
};

// POST /api/leads-move-stage  { lead_id, etapa_id, motivo_perdida_id? }
// Moves a card between Kanban columns. Ownership check mirrors
// messages-send.ts: Administrador general can move any lead, a Usuario
// estándar only leads assigned to them — checked here server-side, not
// just by what the board happens to render for them.
//
// Moving into the 'Perdido' column requires motivo_perdida_id (one of the
// fixed rows in `motivos_perdida`, see migrations/007). Moving a lead OUT
// of 'Perdido' clears it, since a stale loss reason shouldn't linger once
// the lead is active again.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  let body: MoveBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  const { lead_id, etapa_id, motivo_perdida_id } = body;
  if (!lead_id || !etapa_id) {
    return jsonResponse(400, { error: "lead_id y etapa_id son obligatorios." });
  }

  const admin = getSupabaseAdmin();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, etapa_id, pipeline_id, responsable_id")
    .eq("id", lead_id)
    .maybeSingle();

  if (leadError || !lead) {
    return jsonResponse(404, { error: "Lead no encontrado." });
  }

  if (auth.usuario.rol !== "Administrador general" && lead.responsable_id !== auth.usuario.id) {
    return jsonResponse(403, { error: "No tiene permiso sobre este lead." });
  }

  const { data: etapa, error: etapaError } = await admin
    .from("etapas")
    .select("id, nombre, pipeline_id")
    .eq("id", etapa_id)
    .maybeSingle();

  if (etapaError || !etapa) {
    return jsonResponse(400, { error: "Etapa no encontrada." });
  }
  if (etapa.pipeline_id !== lead.pipeline_id) {
    return jsonResponse(400, { error: "Esa etapa no pertenece al pipeline de este lead." });
  }

  const moviendoAPerdido = etapa.nombre === ETAPA_PERDIDO;
  let motivoValidado: string | null = null;

  if (moviendoAPerdido) {
    if (!motivo_perdida_id) {
      return jsonResponse(400, {
        error: "motivo_perdida_id es obligatorio al mover un lead a la etapa Perdido.",
      });
    }

    const { data: motivo, error: motivoError } = await admin
      .from("motivos_perdida")
      .select("id")
      .eq("id", motivo_perdida_id)
      .maybeSingle();

    if (motivoError || !motivo) {
      return jsonResponse(400, { error: "motivo_perdida_id inválido." });
    }

    motivoValidado = motivo.id;
  }

  if (etapa.id === lead.etapa_id && !moviendoAPerdido) {
    return jsonResponse(200, { ok: true, etapa_nombre: etapa.nombre });
  }

  const { error: updateError } = await admin
    .from("leads")
    .update({
      etapa_id,
      motivo_perdida_id: moviendoAPerdido ? motivoValidado : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead_id);

  if (updateError) {
    return jsonResponse(500, { error: "No fue posible mover el lead de etapa." });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "movimiento_pipeline",
    entidad: "leads",
    entidad_id: lead_id,
    estado_anterior: { etapa_id: lead.etapa_id },
    estado_posterior: {
      etapa_id,
      ...(moviendoAPerdido ? { motivo_perdida_id: motivoValidado } : {}),
    },
  });

  return jsonResponse(200, { ok: true, etapa_nombre: etapa.nombre });
};
