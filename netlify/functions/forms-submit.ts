import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { notifyBayronOfNewLead } from "./_shared/notifyBayron";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function response(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

// Well-known campo ids this endpoint maps onto contacto/lead columns — see
// migrations/009_formulario_seed.sql. Any other campo an admin adds via
// forms-save.ts still gets captured (raw) in formulario_respuestas.datos,
// it just won't populate a contacto/lead field on its own.
const CAMPO_NOMBRE = "nombre_completo";
const CAMPO_CORREO = "correo";
const CAMPO_TELEFONO = "telefono";
const CAMPO_SERVICIO = "servicio";
const CAMPO_DESCRIPCION = "descripcion";

type SubmitBody = {
  formulario_id?: string;
  datos?: Record<string, unknown>;
  url_origen?: string;
  utm?: Record<string, unknown>;
};

// POST /api/forms-submit — PUBLIC, no autenticación. Pensado para que un
// sitio externo (WordPress, una landing propia) lo llame directo desde el
// navegador del visitante — de ahí el manejo de CORS. Igual que
// leads-create.ts, nunca confía en que el llamador mande responsable_id ni
// estado: el trigger de migrations/003_lead_assignment_rule.sql es lo
// único que los asigna, sin importar este ni ningún otro punto de entrada.
//
// TODO(produccion): este endpoint no tiene protección anti-abuso todavía
// (rate limiting, honeypot o captcha) — agréguela antes de publicar el
// formulario_id real en un sitio público, o cualquiera podrá crear leads
// sin límite con solo conocer ese id.
export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Método no permitido." });
  }

  let body: SubmitBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Cuerpo de la solicitud inválido." });
  }

  const { formulario_id, datos, url_origen, utm } = body;

  if (!formulario_id || !datos || typeof datos !== "object" || Array.isArray(datos)) {
    return response(400, { error: "formulario_id y datos son obligatorios." });
  }

  const admin = getSupabaseAdmin();

  const { data: formulario, error: formularioError } = await admin
    .from("formularios")
    .select("id, nombre, activo, campos")
    .eq("id", formulario_id)
    .maybeSingle();

  if (formularioError || !formulario) {
    return response(404, { error: "Formulario no encontrado." });
  }
  if (!formulario.activo) {
    return response(400, { error: "Este formulario no está activo." });
  }

  const campos: any[] = Array.isArray(formulario.campos) ? formulario.campos : [];
  const faltantes = campos.filter((c) => c.required && !String(datos[c.id] ?? "").trim());
  if (faltantes.length > 0) {
    return response(400, {
      error: `Faltan campos requeridos: ${faltantes.map((c) => c.label).join(", ")}.`,
    });
  }

  const nombreCompleto = String(datos[CAMPO_NOMBRE] ?? "").trim();
  const correo = String(datos[CAMPO_CORREO] ?? "").trim().toLowerCase() || null;
  const telefono = String(datos[CAMPO_TELEFONO] ?? "").trim() || null;
  const servicioNombre = String(datos[CAMPO_SERVICIO] ?? "").trim() || null;
  const descripcion = String(datos[CAMPO_DESCRIPCION] ?? "").trim() || null;

  let contactoId: string | null = null;

  if (correo) {
    const { data: existente } = await admin
      .from("contacto_correos")
      .select("contacto_id")
      .eq("correo", correo)
      .maybeSingle();
    contactoId = existente?.contacto_id ?? null;
  }
  if (!contactoId && telefono) {
    const { data: existente } = await admin
      .from("contacto_telefonos")
      .select("contacto_id")
      .eq("numero_e164", telefono)
      .maybeSingle();
    contactoId = existente?.contacto_id ?? null;
  }

  if (!contactoId) {
    const { data: nuevoContacto, error: contactoError } = await admin
      .from("contactos")
      .insert({ nombre: nombreCompleto || "Contacto sin nombre" })
      .select("id")
      .single();

    if (contactoError || !nuevoContacto) {
      return response(500, { error: "No fue posible crear el contacto." });
    }
    contactoId = nuevoContacto.id;

    if (correo) {
      await admin
        .from("contacto_correos")
        .insert({ contacto_id: contactoId, correo, es_principal: true });
    }
    if (telefono) {
      await admin.from("contacto_telefonos").insert({
        contacto_id: contactoId,
        numero_e164: telefono,
        tipo: "telefono",
        es_principal: true,
      });
    }
  }

  let servicioId: string | null = null;
  if (servicioNombre) {
    const { data: servicio } = await admin
      .from("servicios")
      .select("id")
      .ilike("nombre", servicioNombre)
      .maybeSingle();
    servicioId = servicio?.id ?? null;
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      contacto_id: contactoId,
      servicio_id: servicioId,
      canal_origen: "crm_form",
      fuente: formulario.nombre,
      mensaje_recibido: descripcion,
      formulario_id: formulario.id,
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    return response(500, { error: "No fue posible crear el lead." });
  }

  await admin.from("formulario_respuestas").insert({
    formulario_id: formulario.id,
    lead_id: lead.id,
    datos,
    url_origen: url_origen ?? null,
    parametros_utm: utm ?? null,
  });

  await notifyBayronOfNewLead({
    leadId: lead.id,
    contactoNombre: nombreCompleto || "Contacto sin nombre",
    canalOrigen: "crm_form",
  });

  return response(201, { ok: true, lead_id: lead.id });
};
