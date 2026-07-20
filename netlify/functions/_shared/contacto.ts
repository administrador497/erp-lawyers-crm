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
