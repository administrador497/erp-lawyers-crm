import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { nombreCompleto } from "./_shared/contacto";

// GET /api/activities-list — Calendario y actividades. Role rule matches
// the rest of the app, applied on the activity's own responsable_id (i.e.
// "my calendar" for a Usuario estándar); Administrador general sees every
// activity.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();

  let query = admin
    .from("actividades")
    .select(
      `id, tipo, fecha, estado, descripcion, resultado, proxima_accion, lead_id, responsable_id,
       lead:lead_id ( id,
         contacto:contacto_id ( nombre, primer_apellido, segundo_apellido ),
         servicio:servicio_id ( nombre ) ),
       responsable:responsable_id ( nombre_completo )`
    )
    .order("fecha", { ascending: true });

  if (auth.usuario.rol !== "Administrador general") {
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
