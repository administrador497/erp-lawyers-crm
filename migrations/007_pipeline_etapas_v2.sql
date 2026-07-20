-- CRM ERP Lawyers & Associates — catálogo de etapas v2 + motivos de pérdida
-- Ejecutar DESPUÉS de 001-006. Reemplaza las 16 etapas originales de
-- 'Pipeline general' por estas 8, en este orden:
--   Nuevo, Respuesta, Propuesta, Duplicado, En Espera, Descartado, Ganado, Perdido
--
-- Regla de reemplazo (no destructiva):
--  - Si ya existe una etapa con el nombre exacto de una de las 8 (en este
--    esquema, solo "Perdido" coincide con la etapa previa del mismo
--    nombre), se actualiza su `orden` in situ — conserva su id, así ningún
--    lead que ya esté ahí queda con una referencia rota.
--  - Las etapas antiguas que NO están en la lista de 8 (p. ej. "Lead
--    nuevo", "Pendiente de asignación", "Contratado", etc.) se consideran
--    eliminadas: todo lead que apunte a ellas se reasigna primero a la
--    nueva etapa "Nuevo", y luego se borra la fila de la etapa.

do $$
declare
  v_pipeline_id uuid;
  v_nuevo_id uuid;
  r record;
begin
  select id into v_pipeline_id from pipelines where nombre = 'Pipeline general' limit 1;
  if v_pipeline_id is null then
    raise exception 'No existe el pipeline "Pipeline general". Ejecute 001_init.sql primero.';
  end if;

  -- 1) Upsert de las 8 etapas nuevas, en el orden solicitado.
  for r in
    select * from (values
      ('Nuevo', 1), ('Respuesta', 2), ('Propuesta', 3), ('Duplicado', 4),
      ('En Espera', 5), ('Descartado', 6), ('Ganado', 7), ('Perdido', 8)
    ) as t(nombre, orden)
  loop
    if exists (select 1 from etapas where pipeline_id = v_pipeline_id and nombre = r.nombre) then
      update etapas set orden = r.orden where pipeline_id = v_pipeline_id and nombre = r.nombre;
    else
      insert into etapas (pipeline_id, nombre, orden) values (v_pipeline_id, r.nombre, r.orden);
    end if;
  end loop;

  select id into v_nuevo_id from etapas where pipeline_id = v_pipeline_id and nombre = 'Nuevo' limit 1;

  -- 2) Etapas antiguas que no están en la lista de 8: reasignar sus leads
  --    a "Nuevo" y luego borrarlas — nunca dejar leads.etapa_id huérfano.
  for r in
    select id, nombre from etapas
    where pipeline_id = v_pipeline_id
      and nombre not in
        ('Nuevo', 'Respuesta', 'Propuesta', 'Duplicado', 'En Espera', 'Descartado', 'Ganado', 'Perdido')
  loop
    update leads set etapa_id = v_nuevo_id, updated_at = now() where etapa_id = r.id;
    delete from etapas where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) migrations/003_lead_assignment_rule.sql defaultea leads nuevos a la
--    etapa 'Lead nuevo', que ya no existe. Se redefine la misma función
--    (mismo nombre — el trigger creado en 003 la sigue usando tal cual) para
--    que apunte a 'Nuevo'. El resto de la función queda idéntico.
-- ---------------------------------------------------------------------------
create or replace function public.assign_new_lead_to_bayron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bayron_id uuid;
  default_pipeline_id uuid;
  default_etapa_id uuid;
begin
  select id into bayron_id from usuarios where lower(correo) = 'bayron@erplawyers.com' limit 1;

  if bayron_id is null then
    raise exception 'No existe el usuario bayron@erplawyers.com en usuarios. Ejecute 002_auth_link.sql antes de crear leads.';
  end if;

  new.responsable_id := bayron_id;
  new.estado := 'Nuevo';

  if new.pipeline_id is null then
    select id into default_pipeline_id from pipelines where nombre = 'Pipeline general' limit 1;
    new.pipeline_id := default_pipeline_id;
  end if;

  if new.etapa_id is null then
    select id into default_etapa_id from etapas
      where pipeline_id = new.pipeline_id and nombre = 'Nuevo' limit 1;
    new.etapa_id := default_etapa_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Catálogo fijo de motivos de pérdida.
-- ---------------------------------------------------------------------------
create table if not exists motivos_perdida (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden int not null
);

insert into motivos_perdida (nombre, orden) values
  ('Sin Respuesta', 1),
  ('Competencia', 2),
  ('Precio', 3),
  ('Desiste del Servicio', 4),
  ('No cumple con requisitos', 5),
  ('Deseaba Servicio Gratuito', 6),
  ('No se brinda el Servicio', 7),
  ('Otro', 8)
on conflict (nombre) do nothing;

alter table motivos_perdida enable row level security;
-- Sin políticas para 'anon'/'authenticated': se lee exclusivamente vía
-- netlify/functions/pipeline-list.ts con la service role key, igual que
-- el resto de catálogos de negocio (servicios, etapas, roles aparte).

-- ---------------------------------------------------------------------------
-- 5) Referencia estructurada del motivo en leads. La columna `motivo_perdida`
--    (text, libre) que ya existía en 001_init.sql se conserva tal cual —
--    sirve como detalle/nota opcional (p. ej. al elegir "Otro"). El motivo
--    fijo/categórico que exige el tablero Kanban vive en esta columna nueva.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists motivo_perdida_id uuid references motivos_perdida(id);
create index if not exists idx_leads_motivo_perdida_id on leads(motivo_perdida_id);

comment on column leads.motivo_perdida is
  'Detalle libre opcional sobre la pérdida (p. ej. al elegir "Otro" en motivo_perdida_id). El motivo fijo lo exige la UI del pipeline vía motivo_perdida_id -> motivos_perdida.';
