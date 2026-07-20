import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { notifyBayronOfNewLead } from "./_shared/notifyBayron";

const CANALES_VALIDOS = ["wordpress", "crm_form", "correo", "whatsapp", "manual", "importacion"];

type CreateLeadBody = {
  contacto: {
    nombre: string;
    primer_apellido?: string;
    segundo_apellido?: string;
    correo?: string;
    telefono_e164?: string;
    pais?: string;
  };
  canal_origen: string;
  fuente?: string;
  servicio_nombre?: string;
  mensaje_recibido?: string;
  prioridad?: string;
  valor_potencial?: number;
};

// POST /api/leads-create — manual/API lead creation from inside the CRM.
// responsable_id / estado / etapa_id are intentionally never sent: the
// database trigger in migrations/003_lead_assignment_rule.sql is the only
// thing allowed to set them, so the "always assign to Bayron" rule holds no
// matter what a caller tries to pass.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  let body: CreateLeadBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  if (!body.contacto?.nombre?.trim()) {
    return jsonResponse(400, { error: "El nombre del contacto es obligatorio." });
  }
  if (!body.canal_origen || !CANALES_VALIDOS.includes(body.canal_origen)) {
    return jsonResponse(400, {
      error: `canal_origen inválido. Use uno de: ${CANALES_VALIDOS.join(", ")}.`,
    });
  }

  const admin = getSupabaseAdmin();

  let contactoId: string | null = null;

  if (body.contacto.correo) {
    const { data: existing } = await admin
      .from("contacto_correos")
      .select("contacto_id")
      .eq("correo", body.contacto.correo.trim().toLowerCase())
      .maybeSingle();
    contactoId = existing?.contacto_id ?? null;
  }

  if (!contactoId && body.contacto.telefono_e164) {
    const { data: existing } = await admin
      .from("contacto_telefonos")
      .select("contacto_id")
      .eq("numero_e164", body.contacto.telefono_e164.trim())
      .maybeSingle();
    contactoId = existing?.contacto_id ?? null;
  }

  if (!contactoId) {
    const { data: nuevoContacto, error: contactoError } = await admin
      .from("contactos")
      .insert({
        nombre: body.contacto.nombre.trim(),
        primer_apellido: body.contacto.primer_apellido?.trim() ?? null,
        segundo_apellido: body.contacto.segundo_apellido?.trim() ?? null,
        pais: body.contacto.pais ?? null,
      })
      .select("id")
      .single();

    if (contactoError || !nuevoContacto) {
      return jsonResponse(500, { error: "No fue posible crear el contacto." });
    }
    contactoId = nuevoContacto.id;

    if (body.contacto.correo) {
      await admin.from("contacto_correos").insert({
        contacto_id: contactoId,
        correo: body.contacto.correo.trim().toLowerCase(),
        es_principal: true,
      });
    }
    if (body.contacto.telefono_e164) {
      await admin.from("contacto_telefonos").insert({
        contacto_id: contactoId,
        numero_e164: body.contacto.telefono_e164.trim(),
        tipo: body.canal_origen === "whatsapp" ? "whatsapp" : "telefono",
        es_principal: true,
      });
    }
  }

  let servicioId: string | null = null;
  if (body.servicio_nombre) {
    const { data: servicio } = await admin
      .from("servicios")
      .select("id")
      .eq("nombre", body.servicio_nombre)
      .maybeSingle();
    servicioId = servicio?.id ?? null;
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      contacto_id: contactoId,
      servicio_id: servicioId,
      canal_origen: body.canal_origen,
      fuente: body.fuente ?? null,
      mensaje_recibido: body.mensaje_recibido ?? null,
      prioridad: body.prioridad ?? "Media",
      valor_potencial: body.valor_potencial ?? null,
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    return jsonResponse(500, { error: "No fue posible crear el lead." });
  }

  await notifyBayronOfNewLead({
    leadId: lead.id,
    contactoNombre: body.contacto.nombre.trim(),
    canalOrigen: body.canal_origen,
  });

  return jsonResponse(201, { ok: true, lead_id: lead.id });
};
