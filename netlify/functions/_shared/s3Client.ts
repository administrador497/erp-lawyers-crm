import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// Almacenamiento de adjuntos vía Supabase Storage en modo compatible S3
// (endpoint propio, no el de AWS — de ahí S3_ENDPOINT y forcePathStyle).
// Sigue siendo el protocolo S3 real (@aws-sdk/client-s3), no el cliente
// propio de Supabase, a propósito: si el día de mañana se migra a otro
// proveedor S3-compatible (R2, AWS real), este archivo no cambia, solo las
// variables de entorno.

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Faltan S3_ENDPOINT/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY en las variables de entorno de la función."
    );
  }

  cachedClient = new S3Client({
    endpoint,
    region,
    // Requerido para endpoints S3-compatibles que no son AWS (Supabase
    // Storage, Cloudflare R2, etc.) — sin esto el SDK arma URLs con el
    // bucket como subdominio (bucket.endpoint/...), que estos proveedores
    // no soportan; con path-style queda bucket dentro de la ruta
    // (endpoint/bucket/...), que sí.
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  return cachedClient;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("Falta S3_BUCKET en las variables de entorno de la función.");
  }
  return bucket;
}

// Convención de ruta: <scope>/<uuid>-<nombre-saneado>. scope es
// lead_id o conversacion_id — agrupa los adjuntos de un mismo caso/hilo sin
// que dependa de ningún índice adicional; el uuid evita colisiones si dos
// personas suben un archivo con el mismo nombre.
export function buildStorageKey(scope: string, filename: string): string {
  const safeFilename = filename.replace(/[^\w.\-]+/g, "_").slice(-150) || "archivo";
  return `${scope}/${randomUUID()}-${safeFilename}`;
}

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    })
  );
}

// URL de descarga firmada y temporal — nunca se guarda, se genera cada vez
// que alguien pide descargar un adjunto (ver archivo-descargar.ts), después
// de verificar que tiene acceso al lead/conversación dueño del archivo.
export async function getSignedDownloadUrl(key: string): Promise<string> {
  const expiresIn = Number(process.env.S3_SIGNED_URL_EXPIRY_SECONDS ?? 900);
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), { expiresIn });
}
