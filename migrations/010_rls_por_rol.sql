-- CRM ERP Lawyers & Associates — segunda capa de defensa: RLS por rol
-- Ejecutar DESPUÉS de 001-009. Estas políticas son ADICIONALES a las de
-- 002_auth_link.sql — no se quita ni se reemplaza nada. Hoy todas las
-- tablas de negocio están en "denegado por defecto" para 'anon'/
-- 'authenticated' (RLS activo, cero políticas), y la única vía real de
-- lectura/escritura es netlify/functions/* con la service_role key, que
-- ignora RLS por completo. Esta migración agrega políticas de SELECT para
-- que, si algún día una consulta usa la anon key con la sesión de un
-- usuario en vez de pasar por una función, la base de datos igual aplique
-- los mismos límites por rol que ya aplica el backend — no reemplaza esa
-- capa, la respalda.
--
-- Alcance deliberado: solo SELECT. Ninguna tabla de negocio recibe
-- políticas de INSERT/UPDATE/DELETE aquí — todas las escrituras siguen
-- exclusivamente por las funciones (que ya validan permisos, registran
-- auditoría y a veces hacen pasos adicionales como el trigger de
-- asignación automática). Abrir escritura directa por RLS no se pidió y
-- se dejaría sin esa lógica de negocio.

-- ---------------------------------------------------------------------------
-- 1) Funciones auxiliares SECURITY DEFINER.
--
--    Por qué SECURITY DEFINER y no SECURITY INVOKER: la política nueva de
--    'usuarios' (usuarios_select_admin, más abajo) necesita saber si el
--    usuario actual es admin, lo cual implica volver a consultar
--    'usuarios' (con join a 'roles'). Si esa consulta interna corriera con
--    los permisos del llamador (INVOKER), Postgres tendría que
--    reevaluar las políticas de 'usuarios' —incluida esta misma— para
--    resolverla, lo cual es exactamente el patrón que causa "infinite
--    recursion detected in policy for relation usuarios". SECURITY
--    DEFINER hace que esta función corra con los privilegios de quien la
--    creó (postgres, vía SQL Editor), que tiene BYPASSRLS — la consulta
--    interna nunca pasa por RLS, así que nunca hay recursión.
--
--    STABLE (no VOLATILE): permite que el planificador evalúe estas
--    funciones una sola vez por consulta en vez de una vez por fila,
--    ya que no reciben argumentos que varíen por fila.
-- ---------------------------------------------------------------------------
create or replace function public.usuario_actual_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from usuarios where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.usuario_actual_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from usuarios u
    join roles r on r.id = u.rol_id
    where u.auth_user_id = auth.uid()
      and r.nombre = 'Administrador general'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2) usuarios — ya existe usuarios_select_self (cada quien su propia fila,
--    002_auth_link.sql). Se agrega que Administrador general vea todas.
-- ---------------------------------------------------------------------------
drop policy if exists usuarios_select_admin on usuarios;
create policy usuarios_select_admin on usuarios
  for select
  to authenticated
  using (usuario_actual_es_admin());

-- ---------------------------------------------------------------------------
-- 3) leads — base de todas las políticas de abajo. Sin dependencia hacia
--    ninguna otra tabla de esta migración (solo usuarios/roles vía las
--    funciones), así que nada de lo que depende de leads puede formar un
--    ciclo con leads.
-- ---------------------------------------------------------------------------
drop policy if exists leads_select_por_rol on leads;
create policy leads_select_por_rol on leads
  for select
  to authenticated
  using (
    usuario_actual_es_admin()
    or responsable_id = usuario_actual_id()
  );

-- ---------------------------------------------------------------------------
-- 4) contactos — visible si el usuario puede ver al menos un lead de ese
--    contacto. Depende de leads; leads no depende de contactos -> sin ciclo.
-- ---------------------------------------------------------------------------
drop policy if exists contactos_select_por_rol on contactos;
create policy contactos_select_por_rol on contactos
  for select
  to authenticated
  using (
    usuario_actual_es_admin()
    or exists (
      select 1 from leads l
      where l.contacto_id = contactos.id
        and l.responsable_id = usuario_actual_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 5) conversaciones — visible si el usuario puede ver el lead asociado.
--    Depende de leads; leads no depende de conversaciones -> sin ciclo.
-- ---------------------------------------------------------------------------
drop policy if exists conversaciones_select_por_rol on conversaciones;
create policy conversaciones_select_por_rol on conversaciones
  for select
  to authenticated
  using (
    usuario_actual_es_admin()
    or exists (
      select 1 from leads l
      where l.id = conversaciones.lead_id
        and l.responsable_id = usuario_actual_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 6) mensajes — visible si el usuario puede ver la conversación (y por lo
--    tanto el lead) a la que pertenece el mensaje. Cadena mensajes ->
--    conversaciones -> leads, siempre hacia el mismo lado -> sin ciclo.
-- ---------------------------------------------------------------------------
drop policy if exists mensajes_select_por_rol on mensajes;
create policy mensajes_select_por_rol on mensajes
  for select
  to authenticated
  using (
    usuario_actual_es_admin()
    or exists (
      select 1
      from conversaciones c
      join leads l on l.id = c.lead_id
      where c.id = mensajes.conversacion_id
        and l.responsable_id = usuario_actual_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 7) archivos — mencionada junto con el resto de tablas sensibles; sigue
--    el mismo criterio que su mensaje/lead asociado (archivos.lead_id y
--    archivos.mensaje_id son ambos nullable en 001_init.sql, se cubren
--    los dos caminos).
-- ---------------------------------------------------------------------------
drop policy if exists archivos_select_por_rol on archivos;
create policy archivos_select_por_rol on archivos
  for select
  to authenticated
  using (
    usuario_actual_es_admin()
    or exists (
      select 1 from leads l
      where l.id = archivos.lead_id
        and l.responsable_id = usuario_actual_id()
    )
    or exists (
      select 1
      from mensajes m
      join conversaciones c on c.id = m.conversacion_id
      join leads l on l.id = c.lead_id
      where m.id = archivos.mensaje_id
        and l.responsable_id = usuario_actual_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 8) actividades — visible si el usuario es el responsable de la
--    actividad, el responsable del lead asociado, o admin.
-- ---------------------------------------------------------------------------
drop policy if exists actividades_select_por_rol on actividades;
create policy actividades_select_por_rol on actividades
  for select
  to authenticated
  using (
    usuario_actual_es_admin()
    or responsable_id = usuario_actual_id()
    or exists (
      select 1 from leads l
      where l.id = actividades.lead_id
        and l.responsable_id = usuario_actual_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 9) auditoria — información sensible de todo el sistema: solo admin lee.
--    Sin dependencia hacia ninguna otra tabla.
-- ---------------------------------------------------------------------------
drop policy if exists auditoria_select_admin on auditoria;
create policy auditoria_select_admin on auditoria
  for select
  to authenticated
  using (usuario_actual_es_admin());
