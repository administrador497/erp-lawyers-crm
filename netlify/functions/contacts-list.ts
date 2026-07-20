import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { nombreCompleto } from "./_shared/contacto";

// GET /api/contacts-list — left-hand column of Contactos/Leads. Same role
// rule as the rest of the app: Administrador general sees every lead, a
// Usuario estándar only the ones assigned to them.
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
    .from("leads")
    .select(
      `id, prioridad,
       contacto:contacto_id ( nombre, primer_apellido, segundo_apellido ),
       servicio:servicio_id ( nombre )`
    )
    .order("created_at", { ascending: false });

  if (auth.usuario.rol !== "Administrador general") {
    query = query.eq("responsable_id", auth.usuario.id);
  }

  const { data, error } = await query;

  if (error) {
    return jsonResponse(500, { error: "No fue posible cargar los contactos." });
  }

  const contactos = (data ?? []).map((l: any) => ({
    id: l.id,
    nombre_completo: nombreCompleto(l.contacto ?? {}),
    servicio: l.servicio?.nombre ?? null,
    prioridad: l.prioridad,
  }));

  return jsonResponse(200, { contactos });
};
