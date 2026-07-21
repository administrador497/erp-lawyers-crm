import { getSupabaseAdmin } from "./supabaseAdmin";
import type { AuthedUsuario } from "./auth";

export type ConversacionAccess = {
  id: string;
  leadId: string | null;
  contactoId: string | null;
  responsableId: string | null;
  hiloExternoId: string | null;
};

// Shared by messages-list.ts and messages-send.ts: resolves who owns the
// lead behind a conversación so both endpoints apply the exact same rule —
// Administrador general sees/acts on everything, a Usuario estándar only on
// conversaciones tied to leads assigned to them.
export async function loadConversacionForAccessCheck(
  conversacionId: string
): Promise<ConversacionAccess | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("conversaciones")
    .select("id, lead_id, contacto_id, hilo_externo_id, deleted_at, leads(responsable_id, deleted_at)")
    .eq("id", conversacionId)
    .maybeSingle();

  if (error || !data) return null;

  // conversations-list.ts ya filtra por deleted_at (el suyo propio y el de
  // su lead) vía join, pero eso no protege un acceso directo por
  // conversacion_id (messages-list.ts, messages-send.ts) — sin esto, una
  // conversación o un lead eliminados seguían siendo alcanzables (y
  // respondibles) por quien ya tuviera el id.
  if (data.deleted_at) return null;

  const lead = Array.isArray(data.leads) ? data.leads[0] : data.leads;
  const leadInfo = lead as { responsable_id: string | null; deleted_at: string | null } | null;

  if (leadInfo?.deleted_at) return null;

  return {
    id: data.id,
    leadId: data.lead_id,
    contactoId: data.contacto_id,
    responsableId: leadInfo?.responsable_id ?? null,
    hiloExternoId: data.hilo_externo_id,
  };
}

export function usuarioPuedeVerConversacion(
  usuario: AuthedUsuario,
  responsableId: string | null
): boolean {
  return usuario.rol === "Administrador general" || usuario.id === responsableId;
}
