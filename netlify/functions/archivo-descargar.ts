import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";
import { getSupabaseAdmin } from "./_shared/supabaseAdmin";
import { getSignedDownloadUrl } from "./_shared/s3Client";

// GET /api/archivo-descargar?archivo_id=<uuid> — genera una URL de descarga
// firmada y temporal para un adjunto, tras verificar que quien la pide
// tiene acceso al lead dueño del archivo (mismo criterio que el resto de
// la app: Administrador general, o el responsable de ese lead). La URL
// nunca se guarda — se genera de cero en cada llamada, así que vence a los
// S3_SIGNED_URL_EXPIRY_SECONDS segundos desde AHORA, no desde cuando se
// subió el archivo.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  const archivoId = event.queryStringParameters?.archivo_id;
  if (!archivoId) {
    return jsonResponse(400, { error: "archivo_id es obligatorio." });
  }

  const admin = getSupabaseAdmin();

  const { data: archivo, error: archivoError } = await admin
    .from("archivos")
    .select("id, nombre_original, ruta_almacenamiento, leads(responsable_id)")
    .eq("id", archivoId)
    .maybeSingle();

  if (archivoError || !archivo) {
    return jsonResponse(404, { error: "Archivo no encontrado." });
  }

  const lead = Array.isArray(archivo.leads) ? archivo.leads[0] : archivo.leads;
  const responsableId = (lead as { responsable_id: string | null } | null)?.responsable_id ?? null;

  if (auth.usuario.rol !== "Administrador general" && auth.usuario.id !== responsableId) {
    return jsonResponse(403, { error: "No tiene acceso a este archivo." });
  }

  try {
    const url = await getSignedDownloadUrl(archivo.ruta_almacenamiento);
    return jsonResponse(200, { url, nombre: archivo.nombre_original });
  } catch (err) {
    console.error("[archivo-descargar] No fue posible generar la URL firmada:", err);
    return jsonResponse(500, { error: "No fue posible generar el enlace de descarga." });
  }
};
