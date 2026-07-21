import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { nombreCompleto } from "./_shared/contacto";

// GET /api/activities-list — Calendario y actividades. Role rule matches
// the rest of the app, applied on the activity's own responsable_id (i.e.
// "my calendar" for a Usuario estándar); Administrador general sees every
// activity.
//
// GET /api/activities-list?lead_id=<uuid> — modo "actividades de un lead
// específico", usado por /contactos, /pipeline y /inbox para mostrar el
// historial de actividades de ESE lead sin importar a quién esté asignada
// cada una individualmente (a diferencia del modo normal, que filtra por
// responsable_id de la actividad). El acceso igual se verifica contra el
// lead: Administrador general, o el propio responsable del lead — mismo
// criterio que activity-create.ts/leads-move-stage.ts.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();
  const leadIdFilter = event.queryStringParameters?.lead_id;

  if (leadIdFilter) {
    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select("id, responsable_id")
      .eq("id", leadIdFilter)
      .is("deleted_at", null)
      .maybeSingle();

    if (leadError || !lead) {
      return jsonResponse(404, { error: "Lead no encontrado." });
    }
    if (auth.usuario.rol !== "Administrador general" && lead.responsable_id !== auth.usuario.id) {
      return jsonResponse(403, { error: "No tiene acceso a las actividades de este lead." });
    }
  }

  let query = admin
    .from("actividades")
    .select(
      `id, tipo, fecha, estado, descripcion, resultado, proxima_accion, lead_id, responsable_id,
       lead:lead_id!inner ( id,
         contacto:contacto_id ( nombre, primer_apellido, segundo_apellido ),
         servicio:servicio_id ( nombre ) ),
       responsable:responsable_id ( nombre_completo )`
    )
    .is("lead.deleted_at", null)
    .order("fecha", { ascending: true });

  if (leadIdFilter) {
    query = query.eq("lead_id", leadIdFilter);
  } else if (auth.usuario.rol !== "Administrador general") {
    query = query.eq("responsable_id", auth.usuario.id);
  }

  const { data, error } = await query;

  if (error) {
    return jsonResponse(500, { error: "No fue posible cargar las actividades." });
  }

  const actividades = (data ?? []).map((a: any) => ({
    id: a.id,
    tipo: a.tipo,
    fecha: a.fecha,
    estado: a.estado,
    descripcion: a.descripcion,
    resultado: a.resultado,
    proxima_accion: a.proxima_accion,
    lead_id: a.lead_id,
    lead_nombre: a.lead?.contacto ? nombreCompleto(a.lead.contacto) : "Lead eliminado",
    servicio: a.lead?.servicio?.nombre ?? null,
    responsable_nombre: a.responsable?.nombre_completo ?? null,
  }));

  return jsonResponse(200, { actividades });
};
