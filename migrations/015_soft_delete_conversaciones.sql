-- CRM ERP Lawyers & Associates — soft-delete de conversaciones
-- Ejecutar DESPUÉS de 001-014. Mismo patrón que
-- migrations/013_soft_delete_contactos.sql, pero a nivel de una sola
-- conversación en vez de un contacto entero: permite ocultar una
-- conversación puntual de la Bandeja omnicanal (p. ej. un hilo duplicado o
-- creado por error) sin tocar el lead ni el contacto asociado, que siguen
-- viéndose normalmente en Pipeline/Contactos/Calendario.
--
-- Por qué soft-delete y no borrado real: mensajes.conversacion_id sí tiene
-- "on delete cascade" (001_init.sql), así que un DELETE real funcionaría a
-- nivel de base de datos, pero destruiría correspondencia real con el
-- cliente — inaceptable por la misma razón que ya se documentó en
-- 013_soft_delete_contactos.sql para contactos. netlify/functions/
-- conversation-delete.ts solo marca deleted_at; nada se borra de verdad.
--
-- Alcance: conversaciones.deleted_at únicamente. No se propaga a
-- leads/contactos (al revés de 013, que sí propaga contacto -> sus leads):
-- acá es la conversación la que se elimina, no el lead detrás, así que el
-- lead debe seguir intacto y visible en el resto del CRM.

alter table conversaciones add column if not exists deleted_at timestamptz;

comment on column conversaciones.deleted_at is
  'Soft-delete de una conversación puntual (no de su lead/contacto). Null = activa. Puesto por conversation-delete.ts (solo Administrador general).';
