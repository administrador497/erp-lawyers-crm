import { randomUUID } from "crypto";
import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";

const ROLES_EDITORES = ["Administrador general", "Supervisor"];

type CampoInput = {
  id?: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
};

type SaveBody = {
  id?: string;
  nombre?: string;
  activo?: boolean;
  campos?: CampoInput[];
};

// POST /api/forms-save  { id?, nombre, activo, campos[] }
// Creates a new formulario when `id` is omitted, updates it otherwise.
// Restricted to Administrador general / Supervisor — enforced here, not
// just hidden in the UI.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  if (!auth.usuario.rol || !ROLES_EDITORES.includes(auth.usuario.rol)) {
    return jsonResponse(403, {
      error: "Solo Administrador general o Supervisor pueden editar formularios.",
    });
  }

  let body: SaveBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Cuerpo de la solicitud inválido." });
  }

  if (!body.nombre?.trim()) {
    return jsonResponse(400, { error: "nombre es obligatorio." });
  }
  if (!Array.isArray(body.campos)) {
    return jsonResponse(400, { error: "campos debe ser un arreglo." });
  }
  for (const c of body.campos) {
    if (!c.label?.trim() || !c.type?.trim()) {
      return jsonResponse(400, { error: "Cada campo necesita label y type." });
    }
  }

  const campos = body.campos.map((c) => ({
    id: c.id?.trim() || randomUUID(),
    label: c.label!.trim(),
    type: c.type!.trim(),
    required: !!c.required,
    placeholder: c.placeholder ?? "",
  }));

  const admin = getSupabaseAdmin();
  const nombre = body.nombre.trim();
  const activo = body.activo ?? true;

  if (body.id) {
    const { error } = await admin
      .from("formularios")
      .update({ nombre, activo, campos })
      .eq("id", body.id);

    if (error) {
      return jsonResponse(500, { error: "No fue posible actualizar el formulario." });
    }

    await admin.from("auditoria").insert({
      usuario_id: auth.usuario.id,
      accion: "formulario_actualizado",
      entidad: "formularios",
      entidad_id: body.id,
      estado_posterior: { nombre, activo, campos_count: campos.length },
    });

    return jsonResponse(200, { ok: true, id: body.id });
  }

  const { data, error } = await admin
    .from("formularios")
    .insert({ nombre, activo, campos })
    .select("id")
    .single();

  if (error || !data) {
    return jsonResponse(500, { error: "No fue posible crear el formulario." });
  }

  await admin.from("auditoria").insert({
    usuario_id: auth.usuario.id,
    accion: "formulario_creado",
    entidad: "formularios",
    entidad_id: data.id,
    estado_posterior: { nombre, activo, campos_count: campos.length },
  });

  return jsonResponse(201, { ok: true, id: data.id });
};
