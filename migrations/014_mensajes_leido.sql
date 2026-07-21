-- CRM ERP Lawyers & Associates — indicador de mensajes no leídos
-- Ejecutar DESPUÉS de 001-013. Solo tiene sentido para mensajes entrantes
-- (direccion = 'entrante') — los salientes no se marcan, no hay "leer" un
-- mensaje que uno mismo escribió.

alter table mensajes add column if not exists leido_en timestamptz;

comment on column mensajes.leido_en is
  'Null = no leído. conversations-list.ts cuenta los no leídos para el badge de /inbox; messages-list.ts los marca leídos al abrir la conversación. Solo aplica a direccion=entrante.';

-- Acelera la cuenta de no leídos por conversación (conversations-list.ts) —
-- es una consulta que corre en cada carga de /inbox.
create index if not exists idx_mensajes_no_leidos
  on mensajes(conversacion_id)
  where leido_en is null and direccion = 'entrante';
