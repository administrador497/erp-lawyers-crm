-- CRM ERP Lawyers & Associates — vínculo con Supabase Auth, semilla de usuarios/roles y RLS base
-- Ejecutar DESPUÉS de 001_init.sql y ANTES de invitar a los usuarios desde Authentication > Users.
-- Convención de seguridad: toda escritura de negocio pasa por Netlify Functions con
-- SUPABASE_SERVICE_ROLE_KEY (que ignora RLS). El cliente del navegador solo usa la anon key
-- y por eso las tablas de negocio no tienen políticas para 'authenticated' salvo lo indicado.

-- ---------------------------------------------------------------------------
-- 1. Vínculo usuarios <-> auth.users
-- ---------------------------------------------------------------------------
alter table usuarios add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;
create index if not exists idx_usuarios_auth_user_id on usuarios(auth_user_id);
create index if not exists idx_usuarios_correo on usuarios(lower(correo));

-- ---------------------------------------------------------------------------
-- 2. Semilla de roles
-- ---------------------------------------------------------------------------
insert into roles (nombre, permisos)
values
  ('Administrador general', '{"todo": true}'::jsonb),
  ('Supervisor', '{}'::jsonb),
  ('Abogado', '{}'::jsonb),
  ('Asistente legal', '{}'::jsonb),
  ('Recepción', '{}'::jsonb),
  ('Comercial', '{}'::jsonb),
  ('Marketing', '{}'::jsonb),
  ('Auditor', '{}'::jsonb),
  ('Usuario estándar', '{}'::jsonb)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Semilla de los 4 usuarios iniciales (sin auth_user_id todavía — se vincula
--    automáticamente por correo cuando se invite a cada uno desde Supabase Auth).
--    password_hash queda con un marcador: el hash real y la verificación de
--    credenciales las gestiona Supabase Auth (auth.users), no esta tabla.
-- ---------------------------------------------------------------------------
insert into usuarios (nombre_completo, correo, rol_id, debe_cambiar_password, password_hash, correo_verificado, activo)
select v.nombre_completo, v.correo, r.id, true, 'managed_by_supabase_auth', false, true
from (values
  ('Bayron Alpízar Araya', 'bayron@erplawyers.com', 'Administrador general'),
  ('Juan Carlos Rojas Piedra', 'juancarlos@erplawyers.com', 'Usuario estándar'),
  ('José Martín Azofeifa Rodríguez', 'jose@erplawyers.com', 'Usuario estándar'),
  ('Maisha Mattis Byfield', 'maisha@erplawyers.com', 'Usuario estándar')
) as v(nombre_completo, correo, rol_nombre)
join roles r on r.nombre = v.rol_nombre
on conflict (correo) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Trigger: al crear (invitar) un usuario en Supabase Auth, vincular con la
--    fila pre-sembrada en usuarios por correo, o crear una fila nueva si no
--    existía (alta futura de colaboradores directamente desde Auth).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update usuarios
    set auth_user_id = new.id,
        correo_verificado = (new.email_confirmed_at is not null),
        updated_at = now()
    where lower(correo) = lower(new.email) and auth_user_id is null;

  if not found then
    insert into usuarios (nombre_completo, correo, auth_user_id, password_hash, debe_cambiar_password, correo_verificado)
    values (
      coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
      new.email,
      new.id,
      'managed_by_supabase_auth',
      true,
      (new.email_confirmed_at is not null)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 5. Trigger: mantener correo_verificado sincronizado cuando el usuario
--    confirma su correo desde el enlace de Supabase Auth.
-- ---------------------------------------------------------------------------
create or replace function public.handle_auth_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update usuarios
      set correo_verificado = (new.email_confirmed_at is not null),
          updated_at = now()
      where auth_user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update on auth.users
  for each row execute function public.handle_auth_user_email_confirmed();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
--    Regla general: todas las tablas de negocio quedan cerradas para los
--    roles 'anon' y 'authenticated' (ninguna política = acceso denegado).
--    Toda lectura/escritura real pasa por Netlify Functions con la
--    service_role key, que ignora RLS. Única excepción: cada usuario puede
--    leer su propia fila en 'usuarios' (para el guard de cambio de
--    contraseña obligatorio y el saludo en la interfaz).
-- ---------------------------------------------------------------------------
alter table equipos enable row level security;
alter table roles enable row level security;
alter table usuarios enable row level security;
alter table sesiones enable row level security;
alter table empresas enable row level security;
alter table contactos enable row level security;
alter table contacto_correos enable row level security;
alter table contacto_telefonos enable row level security;
alter table servicios enable row level security;
alter table pipelines enable row level security;
alter table etapas enable row level security;
alter table leads enable row level security;
alter table asignaciones_historial enable row level security;
alter table canales enable row level security;
alter table conversaciones enable row level security;
alter table mensajes enable row level security;
alter table archivos enable row level security;
alter table actividades enable row level security;
alter table formularios enable row level security;
alter table formulario_respuestas enable row level security;
alter table automatizaciones enable row level security;
alter table alertas enable row level security;
alter table consentimientos enable row level security;
alter table auditoria enable row level security;
alter table errores_integracion enable row level security;

drop policy if exists usuarios_select_self on usuarios;
create policy usuarios_select_self on usuarios
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- Catálogo de roles: no es información sensible (solo nombres de rol) y se
-- necesita para mostrar el rol del usuario autenticado en la interfaz.
drop policy if exists roles_select_authenticated on roles;
create policy roles_select_authenticated on roles
  for select
  to authenticated
  using (true);

-- No se agregan políticas de insert/update/delete para 'authenticated': esos
-- cambios (debe_cambiar_password, etc.) los realiza exclusivamente la
-- función Netlify correspondiente con la service_role key.
