import type { getSupabaseAdmin } from "./supabaseAdmin";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type ContactoNombre = {
  nombre: string;
  primer_apellido?: string | null;
  segundo_apellido?: string | null;
};

export function nombreCompleto(contacto: ContactoNombre): string {
  return [contacto.nombre, contacto.primer_apellido, contacto.segundo_apellido]
    .filter(Boolean)
    .join(" ");
}

export function correoPrincipal(
  correos: { correo: string; es_principal?: boolean | null }[] = []
): string | null {
  return correos.find((c) => c.es_principal)?.correo ?? correos[0]?.correo ?? null;
}

export function telefonoPrincipal(
  telefonos: { numero_e164: string; es_principal?: boolean | null }[] = []
): string | null {
  return telefonos.find((t) => t.es_principal)?.numero_e164 ?? telefonos[0]?.numero_e164 ?? null;
}

export type NuevoContactoParams = {
  nombre: string;
  primer_apellido?: string | null;
  segundo_apellido?: string | null;
  correo?: string | null;
  telefono_e164?: string | null;
  tipo_telefono?: string; // 'telefono' | 'whatsapp' — default 'telefono'
  pais?: string | null;
  empresa_id?: string | null;
};

// Busca un contacto existente por correo (primero) o teléfono (después) —
// mismo orden y mismas dos tablas que ya usaban, cada uno por su cuenta,
// leads-create.ts y forms-submit.ts. Si no existe, lo crea junto con su(s)
// contacto_correos/contacto_telefonos. Punto único para esa lógica en vez
// de triplicarla — contact-create.ts es quien la usa por ahora;
// leads-create.ts/forms-submit.ts quedan con su copia inline tal cual,
// sin tocar código que ya está en producción.
export async function buscarOCrearContacto(
  admin: SupabaseAdmin,
  params: NuevoContactoParams
): Promise<{ contactoId: string; esNuevo: boolean } | { error: string }> {
  const correo = params.correo?.trim().toLowerCase() || null;
  const telefono = params.telefono_e164?.trim() || null;

  let contactoId: string | null = null;

  if (correo) {
    const { data } = await admin.from("contacto_correos").select("contacto_id").eq("correo", correo).maybeSingle();
    contactoId = data?.contacto_id ?? null;
  }
  if (!contactoId && telefono) {
    const { data } = await admin
      .from("contacto_telefonos")
      .select("contacto_id")
      .eq("numero_e164", telefono)
      .maybeSingle();
    contactoId = data?.contacto_id ?? null;
  }

  if (contactoId) {
    return { contactoId, esNuevo: false };
  }

  const { data: nuevo, error } = await admin
    .from("contactos")
    .insert({
      nombre: params.nombre.trim(),
      primer_apellido: params.primer_apellido?.trim() || null,
      segundo_apellido: params.segundo_apellido?.trim() || null,
      pais: params.pais?.trim() || null,
      empresa_id: params.empresa_id || null,
    })
    .select("id")
    .single();

  if (error || !nuevo) {
    return { error: error?.message ?? "No fue posible crear el contacto." };
  }

  if (correo) {
    await admin.from("contacto_correos").insert({ contacto_id: nuevo.id, correo, es_principal: true });
  }
  if (telefono) {
    await admin.from("contacto_telefonos").insert({
      contacto_id: nuevo.id,
      numero_e164: telefono,
      tipo: params.tipo_telefono === "whatsapp" ? "whatsapp" : "telefono",
      es_principal: true,
    });
  }

  return { contactoId: nuevo.id, esNuevo: true };
}

// Empresa por nombre (razon_social), sin distinguir mayúsculas/minúsculas —
// mismo criterio permisivo que forms-submit.ts usa para servicios, apropiado
// porque es texto escrito a mano por una persona, no un valor de catálogo
// que un formulario ya validó contra una lista fija.
export async function buscarOCrearEmpresa(admin: SupabaseAdmin, razonSocial: string): Promise<string | null> {
  const nombre = razonSocial.trim();
  if (!nombre) return null;

  const { data: existente } = await admin
    .from("empresas")
    .select("id")
    .ilike("razon_social", nombre)
    .maybeSingle();
  if (existente) return existente.id;

  const { data: nueva, error } = await admin
    .from("empresas")
    .insert({ razon_social: nombre })
    .select("id")
    .single();

  return error || !nueva ? null : nueva.id;
}
