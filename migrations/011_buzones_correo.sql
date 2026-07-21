-- CRM ERP Lawyers & Associates — buzones de correo por usuario (OAuth)
-- Ejecutar DESPUÉS de 001-010. Cada usuario puede conectar su propio buzón
-- de Google Workspace (y, a futuro, Microsoft 365) para enviar/recibir
-- correo desde su propia cuenta en vez de una casilla genérica. Esta
-- migración solo crea el almacenamiento — el intercambio OAuth vive en
-- netlify/functions/oauth-google-start.ts y oauth-google-callback.ts.

create table buzones_correo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  proveedor text not null check (proveedor in ('google', 'microsoft')),
  correo text not null,
  access_token_cifrado text not null,   -- AES-256-GCM, ver _shared/tokenCrypto.ts. Nunca texto plano.
  refresh_token_cifrado text not null,  -- idem.
  expires_at timestamptz not null,      -- vencimiento del access_token (el refresh_token no vence salvo revocación)
  conectado_en timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id, proveedor)
);

alter table buzones_correo enable row level security;

-- ---------------------------------------------------------------------------
-- Columnas: los tokens NUNCA se leen a través de la anon/authenticated key,
-- ni siquiera por su propio dueño — no hay ningún flujo de frontend
-- legítimo que los necesite (solo netlify/functions/*, vía service_role,
-- que ignora RLS y privilegios de columna por completo). Este revoke aplica
-- de forma pareja a CUALQUIER usuario autenticado, dueño o admin, porque en
-- el modelo de Supabase todos comparten el mismo rol de Postgres
-- 'authenticated' — solo auth.uid() los distingue a nivel de fila, nunca a
-- nivel de columna. Es la única forma correcta de garantizar "admin ve
-- cuáles existen, pero no los tokens en sí": una política RLS filtra FILAS,
-- nunca columnas.
-- ---------------------------------------------------------------------------
revoke select (access_token_cifrado, refresh_token_cifrado) on buzones_correo from authenticated;

-- ---------------------------------------------------------------------------
-- SELECT — cada usuario ve su propio buzón (columnas de token ya vedadas
-- arriba); Administrador general ve que existen, de quién, y cuándo se
-- conectaron, para todos (igual, sin tokens).
-- ---------------------------------------------------------------------------
drop policy if exists buzones_correo_select_propio on buzones_correo;
create policy buzones_correo_select_propio on buzones_correo
  for select
  to authenticated
  using (usuario_id = usuario_actual_id());

drop policy if exists buzones_correo_select_admin on buzones_correo;
create policy buzones_correo_select_admin on buzones_correo
  for select
  to authenticated
  using (usuario_actual_es_admin());

-- ---------------------------------------------------------------------------
-- DELETE — "desconectar" es la única edición directa que tiene sentido para
-- el dueño: los tokens los escribe exclusivamente oauth-google-callback.ts
-- (requiere el intercambio con Google + la clave de cifrado, ninguno de los
-- dos disponible del lado del cliente), así que no hay política de INSERT
-- ni de UPDATE aquí a propósito — un INSERT/UPDATE directo por el cliente
-- solo podría crear filas con tokens inválidos o corrompidos.
-- ---------------------------------------------------------------------------
drop policy if exists buzones_correo_delete_propio on buzones_correo;
create policy buzones_correo_delete_propio on buzones_correo
  for delete
  to authenticated
  using (usuario_id = usuario_actual_id());
