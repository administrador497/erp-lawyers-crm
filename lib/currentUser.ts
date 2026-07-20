import { createClient } from "./supabase/server";
import type { CurrentUsuario } from "./types";

export async function getCurrentUsuario(): Promise<CurrentUsuario | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("id, nombre_completo, correo, debe_cambiar_password, correo_verificado, activo, roles(nombre)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data) return null;

  const rol = Array.isArray(data.roles) ? data.roles[0] : data.roles;

  return {
    id: data.id,
    nombre_completo: data.nombre_completo,
    correo: data.correo,
    rol: (rol as { nombre: string } | null)?.nombre ?? null,
    debe_cambiar_password: data.debe_cambiar_password,
    correo_verificado: data.correo_verificado,
    activo: data.activo,
  };
}

export function initialsFromName(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
