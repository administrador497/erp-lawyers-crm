import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

const PRIORIDADES_VALIDAS = ["Alta", "Media", "Baja"];

type UpdateBody = {
  lead_id?: string;
  nombre?: string;
  primer_apellido?: string;
  segundo_apellido?: string;
  telefono_principal?: string;
  notas?: string;
  etiquetas?: string[];
  prioridad?: string;
  valor_potencial?: number | null;
};

// POST /api/contact-update — only the fields the business rules allow a
// user to edit from the ficha: nombre/apellidos, teléfono principal,
// notas, etiquetas (contactos) and prioridad/valor_potencial (leads).
// Correo, servicio, canal_origen, responsable y etapa NO se editan aquí —
// esos cambian por otros flujos (asignación, pipeline, formularios).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  let body: UpdateBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  if (!body.lead_id) {
    return jsonResponse(400, { error: "lead_id es obligatorio." });
  }

  if (body.prioridad !== undefined && !PRIORIDADES_VALIDAS.includes(body.prioridad)) {
    return jsonResponse(400, {
      error: `prioridad inválida. Use una de: ${PRIORIDADES_VALIDAS.join(", ")}.`,
    });
  }

  if (
    body.valor_potencial !== undefined &&
    body.valor_potencial !== null &&
    (typeof body.valor_potencial !== "number" ||
      !Number.isFinite(body.valor_potencial) ||
      body.valor_potencial < 0)
  ) {
    return jsonResponse(400, { error: "valor_potencial debe ser un número mayor o igual a 0." });
  }

  const admin = getSupabaseAdmin();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select(
      `id, contacto_id, responsable_id, prioridad, valor_potencial,
       contacto:contacto_id ( nombre, primer_apellido, segundo_apellido, notas, etiquetas,
         contacto_telefonos ( id, numero_e164, es_principal ) )`
    )
    .eq("id", body.lead_id)
    .maybeSingle();

  if (leadError || !lead) {
    return jsonResponse(404, { error: "Lead no encontrado." });
  }

  if (auth.usuario.rol !== "Administrador general" && lead.responsable_id !== auth.usuario.id) {
    return jsonResponse(403, { error: "No tiene permiso sobre este contacto." });
  }

  const contactoAnterior = (lead as any).contacto ?? {};
  const estadoAnterior: Record<string, unknown> = {};
  const estadoPosterior: Record<string, unknown> = {};

  const contactoUpdates: Record<string, unknown> = {};
  (["nombre", "primer_apellido", "segundo_apellido", "notas"] as const).forEach((campo) => {
    if (body[campo] !== undefined && body[campo] !== contactoAnterior[campo]) {
      contactoUpdates[campo] = body[campo];
      estadoAnterior[campo] = contactoAnterior[campo] ?? null;
      estadoPosterior[campo] = body[campo];
    }
  });
  if (body.etiquetas !== undefined) {
    contactoUpdates.etiquetas = body.etiquetas;
    estadoAnterior.etiquetas = contactoAnterior.etiquetas ?? [];
    estadoPosterior.etiquetas = body.etiquetas;
  }

  if (Object.keys(contactoUpdates).length > 0) {
    contactoUpdates.updated_at = new Date().toISOString();
    const { error } = await admin.from("contactos").update(contactoUpdates).eq("id", lead.contacto_id);
    if (error) {
      return jsonResponse(500, { error: "No fue posible actualizar el contacto." });
    }
  }

  if (body.telefono_principal !== undefined) {
    const telefonos: any[] = contactoAnterior.contacto_telefonos ?? [];
    const principal = telefonos.find((t) => t.es_principal);
    estadoAnterior.telefono_principal = principal?.numero_e164 ?? null;
    estadoPosterior.telefono_principal = body.telefono_principal;

    if (principal) {
      const { error } = await admin
        .from("contacto_telefonos")
        .update({ numero_e164: body.telefono_principal })
        .eq("id", principal.id);
      if (error) {
        return jsonResponse(500, { error: "No fue posible actualizar el teléfono." });
      }
    } else {
      const { error } = await admin.from("contacto_telefonos").insert({
        contacto_id: lead.contacto_id,
        numero_e164: body.telefono_principal,
        tipo: "telefono",
        es_principal: true,
      });
      if (error) {
        return jsonResponse(500, { error: "No fue posible guardar el teléfono." });
      }
    }
  }

  const leadUpdates: Record<string, unknown> = {};
  if (body.prioridad !== undefined && body.prioridad !== lead.prioridad) {
    leadUpdates.prioridad = body.prioridad;
    estadoAnterior.prioridad = lead.prioridad;
    estadoPosterior.prioridad = body.prioridad;
  }
  if (body.valor_potencial !== undefined && body.valor_potencial !== lead.valor_potencial) {
    leadUpdates.valor_potencial = body.valor_potencial;
    estadoAnterior.valor_potencial = lead.valor_potencial;
    estadoPosterior.valor_potencial = body.valor_potencial;
  }

  if (Object.keys(leadUpdates).length > 0) {
    leadUpdates.updated_at = new Date().toISOString();
    const { error } = await admin.from("leads").update(leadUpdates).eq("id", body.lead_id);
    if (error) {
      return jsonResponse(500, { error: "No fue posible actualizar el lead." });
    }
  }

  if (Object.keys(estadoPosterior).length > 0) {
    await admin.from("auditoria").insert({
      usuario_id: auth.usuario.id,
      accion: "edicion_contacto_lead",
      entidad: "leads",
      entidad_id: body.lead_id,
      estado_anterior: estadoAnterior,
      estado_posterior: estadoPosterior,
    });
  }

  return jsonResponse(200, { ok: true });
};
