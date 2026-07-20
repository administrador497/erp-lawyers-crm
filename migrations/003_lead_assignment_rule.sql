-- CRM ERP Lawyers & Associates — regla de negocio central (no negociable)
-- "Todo lead nuevo, de cualquier canal, se crea con estado 'Nuevo', se asigna
--  automáticamente a Bayron Alpízar Araya, dispara notificación in-app + correo
--  a Bayron, y aparece en 'Nuevos leads por asignar'." (README, sección "Regla
--  de negocio central" / Blueprint sección 3).
--
-- Se implementa a nivel de base de datos (no solo en la API) para que se
-- cumpla sin importar el punto de entrada: webhook de WordPress, WhatsApp,
-- correo entrante, /api/leads-create o una importación manual futura.
-- Ejecutar DESPUÉS de 002_auth_link.sql (requiere que exista el usuario
-- bayron@erplawyers.com en la tabla usuarios).

-- ---------------------------------------------------------------------------
-- 1. BEFORE INSERT: fuerza responsable_id = Bayron y estado = 'Nuevo' en todo
--    lead nuevo, sin importar qué haya enviado el llamador.
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
      where pipeline_id = new.pipeline_id and nombre = 'Lead nuevo' limit 1;
    new.etapa_id := default_etapa_id;
  end if;

  return new;
end;
$$;

drop trigger if exists before_lead_insert_assign_bayron on leads;
create trigger before_lead_insert_assign_bayron
  before insert on leads
  for each row execute function public.assign_new_lead_to_bayron();

-- ---------------------------------------------------------------------------
-- 2. AFTER INSERT: registra la asignación automática en el historial, crea la
--    alerta in-app para Bayron y deja rastro en auditoría. El envío del
--    correo real (proveedor transaccional) lo dispara la función Netlify que
--    haya insertado el lead (webhook o /api/leads-create), usando el mismo
--    registro de alerta como fuente de verdad de "qué avisar".
-- ---------------------------------------------------------------------------
create or replace function public.log_new_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contacto_nombre text;
begin
  select trim(concat_ws(' ', nombre, primer_apellido, segundo_apellido))
    into contacto_nombre
    from contactos where id = new.contacto_id;

  insert into asignaciones_historial (
    lead_id, usuario_anterior_id, usuario_nuevo_id, asignado_por_id,
    motivo, estado_anterior, estado_posterior
  ) values (
    new.id, null, new.responsable_id, null,
    'Asignación automática de lead nuevo (regla de negocio no negociable)',
    null, new.estado
  );

  insert into alertas (lead_id, usuario_id, tipo, mensaje, leida)
  values (
    new.id, new.responsable_id, 'lead_nuevo',
    'Nuevo lead sin asignar: ' || coalesce(nullif(contacto_nombre, ''), 'contacto sin nombre')
      || ' · canal ' || new.canal_origen,
    false
  );

  insert into auditoria (usuario_id, accion, entidad, entidad_id, estado_anterior, estado_posterior)
  values (
    null, 'asignacion_automatica', 'leads', new.id, null,
    jsonb_build_object('responsable_id', new.responsable_id, 'estado', new.estado, 'canal_origen', new.canal_origen)
  );

  return new;
end;
$$;

drop trigger if exists after_lead_insert_log_assignment on leads;
create trigger after_lead_insert_log_assignment
  after insert on leads
  for each row execute function public.log_new_lead_assignment();
