-- CRM ERP Lawyers & Associates — datos de ejemplo para la Bandeja omnicanal
-- Ejecutar DESPUÉS de 001-004. Crea 2 canales (correo/whatsapp), 2 leads de
-- muestra nuevos, y reutiliza (o recrea si ya no existe) el lead de prueba
-- "Prueba Rodríguez Solano" creado manualmente desde /leads durante la
-- verificación de la regla de asignación automática — para tener 3
-- conversaciones con mensajes reales al probar /inbox de inmediato.
-- Idempotente: se puede correr más de una vez sin duplicar canales ni
-- crear conversaciones repetidas para el mismo lead.

do $$
begin
  if not exists (select 1 from servicios where nombre = 'Derecho Laboral')
     or not exists (select 1 from servicios where nombre = 'Migración')
     or not exists (select 1 from servicios where nombre = 'Derecho Corporativo') then
    raise exception 'Faltan servicios base. Ejecute migrations/004_servicios_seed.sql antes de esta migración.';
  end if;
end $$;

-- Canales (sin constraint único en el esquema — se evita duplicar a mano).
insert into canales (tipo, identificador, activo)
select 'correo', 'contacto@erplawyers.com', true
where not exists (
  select 1 from canales where tipo = 'correo' and identificador = 'contacto@erplawyers.com'
);

insert into canales (tipo, identificador, activo)
select 'whatsapp', '+50622334455', true
where not exists (
  select 1 from canales where tipo = 'whatsapp' and identificador = '+50622334455'
);

do $$
declare
  v_correo_canal_id uuid;
  v_whatsapp_canal_id uuid;
  v_contacto_id uuid;
  v_lead_id uuid;
  v_conv_id uuid;
begin
  select id into v_correo_canal_id from canales
    where tipo = 'correo' and identificador = 'contacto@erplawyers.com' limit 1;
  select id into v_whatsapp_canal_id from canales
    where tipo = 'whatsapp' and identificador = '+50622334455' limit 1;

  -------------------------------------------------------------------------
  -- Conversación 1 — María José Cordero Bolaños, Derecho Laboral, WhatsApp
  -------------------------------------------------------------------------
  if not exists (
    select 1 from contactos where nombre = 'María José' and primer_apellido = 'Cordero'
      and segundo_apellido = 'Bolaños'
  ) then
    insert into contactos (nombre, primer_apellido, segundo_apellido, pais)
      values ('María José', 'Cordero', 'Bolaños', 'Costa Rica')
      returning id into v_contacto_id;

    insert into contacto_telefonos (contacto_id, numero_e164, tipo, es_principal)
      values (v_contacto_id, '+50688451122', 'whatsapp', true);

    insert into leads (contacto_id, servicio_id, canal_origen, fuente, mensaje_recibido, prioridad)
      select v_contacto_id, s.id, 'whatsapp', 'seed',
        'Hola, quisiera información sobre un despido injustificado.', 'Alta'
      from servicios s where s.nombre = 'Derecho Laboral'
      returning id into v_lead_id;

    insert into conversaciones (lead_id, contacto_id, canal_id, estado)
      values (v_lead_id, v_contacto_id, v_whatsapp_canal_id, 'abierta')
      returning id into v_conv_id;

    insert into mensajes (conversacion_id, canal, direccion, remitente, cuerpo, created_at) values
      (v_conv_id, 'whatsapp', 'entrante', '+50688451122',
        'Hola, quisiera información sobre un despido injustificado.', now() - interval '2 hours'),
      (v_conv_id, 'whatsapp', 'saliente', 'bayron@erplawyers.com',
        'Buenas tardes María José, con gusto la ayudamos. ¿Podría contarnos brevemente qué ocurrió?',
        now() - interval '1 hour 40 minutes');
  end if;

  -------------------------------------------------------------------------
  -- Conversación 2 — Andrés Solís Vindas, Migración, Correo
  -------------------------------------------------------------------------
  if not exists (
    select 1 from contactos where nombre = 'Andrés' and primer_apellido = 'Solís'
      and segundo_apellido = 'Vindas'
  ) then
    insert into contactos (nombre, primer_apellido, segundo_apellido, pais)
      values ('Andrés', 'Solís', 'Vindas', 'Costa Rica')
      returning id into v_contacto_id;

    insert into contacto_correos (contacto_id, correo, es_principal)
      values (v_contacto_id, 'andres.solis@example.com', true);

    insert into leads (contacto_id, servicio_id, canal_origen, fuente, mensaje_recibido, prioridad)
      select v_contacto_id, s.id, 'correo', 'seed',
        'Necesito ayuda con un trámite de residencia.', 'Media'
      from servicios s where s.nombre = 'Migración'
      returning id into v_lead_id;

    insert into conversaciones (lead_id, contacto_id, canal_id, estado)
      values (v_lead_id, v_contacto_id, v_correo_canal_id, 'pendiente')
      returning id into v_conv_id;

    insert into mensajes (conversacion_id, canal, direccion, remitente, asunto, cuerpo, created_at) values
      (v_conv_id, 'correo', 'entrante', 'andres.solis@example.com', 'Consulta sobre residencia',
        'Buenos días, necesito ayuda con un trámite de residencia permanente. ¿Podrían orientarme?',
        now() - interval '1 day');
  end if;

  -------------------------------------------------------------------------
  -- Conversación 3 — reutiliza el lead de prueba "Prueba Rodríguez Solano"
  -- (creado manualmente desde /leads) si todavía existe; si no, lo recrea.
  -------------------------------------------------------------------------
  select l.id, l.contacto_id into v_lead_id, v_contacto_id
    from leads l
    join contactos c on c.id = l.contacto_id
    where c.nombre = 'Prueba' and c.primer_apellido = 'Rodríguez' and c.segundo_apellido = 'Solano'
    order by l.created_at desc
    limit 1;

  if v_lead_id is null then
    insert into contactos (nombre, primer_apellido, segundo_apellido, pais)
      values ('Prueba', 'Rodríguez', 'Solano', 'Costa Rica')
      returning id into v_contacto_id;

    insert into contacto_correos (contacto_id, correo, es_principal)
      values (v_contacto_id, 'prueba.lead.seed@example.com', true);

    insert into leads (contacto_id, servicio_id, canal_origen, fuente, mensaje_recibido, prioridad)
      select v_contacto_id, s.id, 'wordpress', 'seed',
        'Lead de prueba (semilla) para la bandeja omnicanal.', 'Media'
      from servicios s where s.nombre = 'Derecho Corporativo'
      returning id into v_lead_id;
  end if;

  if not exists (select 1 from conversaciones where lead_id = v_lead_id) then
    insert into conversaciones (lead_id, contacto_id, canal_id, estado)
      values (v_lead_id, v_contacto_id, v_correo_canal_id, 'abierta')
      returning id into v_conv_id;

    insert into mensajes (conversacion_id, canal, direccion, remitente, asunto, cuerpo, created_at) values
      (v_conv_id, 'correo', 'entrante', coalesce(
          (select correo from contacto_correos where contacto_id = v_contacto_id and es_principal limit 1),
          'prueba.lead.seed@example.com'
        ), 'Constitución de sociedad',
        'Buenos días, necesito asesoría para constituir una sociedad anónima.',
        now() - interval '3 hours'),
      (v_conv_id, 'correo', 'saliente', 'bayron@erplawyers.com', 'Constitución de sociedad',
        'Con gusto le ayudamos. ¿Ya tiene el nombre de la sociedad definido?',
        now() - interval '2 hours 30 minutes'),
      (v_conv_id, 'correo', 'entrante', coalesce(
          (select correo from contacto_correos where contacto_id = v_contacto_id and es_principal limit 1),
          'prueba.lead.seed@example.com'
        ), 'Constitución de sociedad',
        'Sí, sería "Soluciones Verdes CR S.A."',
        now() - interval '2 hours');
  end if;
end $$;
