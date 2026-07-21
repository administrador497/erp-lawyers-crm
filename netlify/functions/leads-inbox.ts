import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

// GET /api/leads-inbox — "Nuevos leads por asignar": every lead still in
// estado='Nuevo' (i.e. still sitting with Bayron, the mandatory default
// responsable — see migrations/003_lead_assignment_rule.sql). Any active
// colaborador can view the queue; only an Administrador general can act on
// it (enforced in leads-assign.ts).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const admin = getSupabaseAdmin();

  const { data: leadsData, error: leadsError } = await admin
    .from("leads")
    .select(
      `id, canal_origen, fuente, prioridad, created_at,
       contacto:contacto_id ( id, nombre, primer_apellido, segundo_apellido,
         contacto_correos ( correo, es_principal ),
         contacto_telefonos ( numero_e164, es_principal ) ),
       servicio:servicio_id ( nombre ),
       responsable:responsable_id ( id, nombre_completo )`
    )
    .eq("estado", "Nuevo")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (leadsError) {
    return jsonResponse(500, { error: "No fue posible cargar los leads nuevos." });
  }

  const { data: assignableUsers, error: usersError } = await admin
    .from("usuarios")
    .select("id, nombre_completo")
    .eq("activo", true)
    .order("nombre_completo", { ascending: true });

  if (usersError) {
    return jsonResponse(500, { error: "No fue posible cargar la lista de usuarios." });
  }

  const leads = (leadsData ?? []).map((row: any) => {
    const contacto = row.contacto ?? {};
    const correos: any[] = contacto.contacto_correos ?? [];
    const telefonos: any[] = contacto.contacto_telefonos ?? [];
    const correoPrincipal =
      correos.find((c) => c.es_principal)?.correo ?? correos[0]?.correo ?? null;
    const telefonoPrincipal =
      telefonos.find((t) => t.es_principal)?.numero_e164 ?? telefonos[0]?.numero_e164 ?? null;

    return {
      id: row.id,
      nombre_completo: [contacto.nombre, contacto.primer_apellido, contacto.segundo_apellido]
        .filter(Boolean)
        .join(" "),
      correo: correoPrincipal,
      telefono: telefonoPrincipal,
      canal_origen: row.canal_origen,
      fuente: row.fuente,
      servicio: row.servicio?.nombre ?? null,
      prioridad: row.prioridad,
      ingreso: row.created_at,
      responsable_id: row.responsable?.id,
      responsable_nombre: row.responsable?.nombre_completo,
    };
  });

  return jsonResponse(200, { leads, assignableUsers: assignableUsers ?? [] });
};
