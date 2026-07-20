-- CRM ERP Lawyers & Associates — actividades de ejemplo para /calendario
-- Ejecutar DESPUÉS de 001-007 (usa los leads sembrados en 005 y el lead de
-- prueba de /leads). Idempotente: cada actividad se busca por su
-- descripción exacta + lead_id antes de insertar, así correr esta
-- migración dos veces no duplica nada.
--
-- El responsable de cada actividad se toma del responsable_id ACTUAL del
-- lead (no se hardcodea a Bayron), para que la actividad aparezca en el
-- calendario de quien de verdad tiene el lead asignado en este momento —
-- incluso si ya lo reasignaste probando /leads o /pipeline.

do $$
declare
  v_lead_id uuid;
  v_responsable_id uuid;
begin
  -------------------------------------------------------------------------
  -- María José Cordero Bolaños (Derecho Laboral, WhatsApp) — pendiente
  -------------------------------------------------------------------------
  select l.id, l.responsable_id into v_lead_id, v_responsable_id
    from leads l join contactos c on c.id = l.contacto_id
    where c.nombre = 'María José' and c.primer_apellido = 'Cordero' and c.segundo_apellido = 'Bolaños'
    order by l.created_at desc limit 1;

  if v_lead_id is not null and not exists (
    select 1 from actividades where lead_id = v_lead_id and descripcion = 'Confirmar detalles del despido para armar el caso.'
  ) then
    insert into actividades (lead_id, responsable_id, tipo, fecha, estado, descripcion)
    values (v_lead_id, v_responsable_id, 'llamada', now() + interval '1 day', 'pendiente',
      'Confirmar detalles del despido para armar el caso.');
  end if;

  -------------------------------------------------------------------------
  -- Andrés Solís Vindas (Migración, Correo) — pendiente, próximas horas
  -------------------------------------------------------------------------
  select l.id, l.responsable_id into v_lead_id, v_responsable_id
    from leads l join contactos c on c.id = l.contacto_id
    where c.nombre = 'Andrés' and c.primer_apellido = 'Solís' and c.segundo_apellido = 'Vindas'
    order by l.created_at desc limit 1;

  if v_lead_id is not null and not exists (
    select 1 from actividades where lead_id = v_lead_id and descripcion = 'Enviar la lista de documentos requeridos para residencia.'
  ) then
    insert into actividades (lead_id, responsable_id, tipo, fecha, estado, descripcion)
    values (v_lead_id, v_responsable_id, 'correo', now() + interval '2 hours', 'pendiente',
      'Enviar la lista de documentos requeridos para residencia.');
  end if;

  if v_lead_id is not null and not exists (
    select 1 from actividades where lead_id = v_lead_id and descripcion = 'Revisar la consulta inicial recibida.'
  ) then
    insert into actividades (lead_id, responsable_id, tipo, fecha, estado, descripcion, resultado)
    values (v_lead_id, v_responsable_id, 'tarea', now() - interval '1 day', 'completada',
      'Revisar la consulta inicial recibida.', 'Caso viable, se agenda llamada de seguimiento.');
  end if;

  -------------------------------------------------------------------------
  -- Prueba Rodríguez Solano (lead de prueba de /leads) — pendiente, reunión
  -------------------------------------------------------------------------
  select l.id, l.responsable_id into v_lead_id, v_responsable_id
    from leads l join contactos c on c.id = l.contacto_id
    where c.nombre = 'Prueba' and c.primer_apellido = 'Rodríguez' and c.segundo_apellido = 'Solano'
    order by l.created_at desc limit 1;

  if v_lead_id is not null and not exists (
    select 1 from actividades where lead_id = v_lead_id and descripcion = 'Revisar estatutos y nombre de la sociedad.'
  ) then
    insert into actividades (lead_id, responsable_id, tipo, fecha, estado, descripcion)
    values (v_lead_id, v_responsable_id, 'reunion', now() + interval '3 days', 'pendiente',
      'Revisar estatutos y nombre de la sociedad.');
  end if;
end $$;
