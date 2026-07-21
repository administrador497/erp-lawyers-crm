-- CRM ERP Lawyers & Associates — soft-delete de contactos
-- Ejecutar DESPUÉS de 001-012. Implementa la convención "soft-delete vía
-- deleted_at donde aplica" que 001_init.sql ya declaraba desde el
-- principio (línea 2) pero que ninguna tabla usaba todavía.
--
-- Por qué soft-delete y no borrado real: leads.contacto_id,
-- conversaciones.contacto_id y archivos.lead_id/mensaje_id se declararon
-- SIN "on delete cascade" — un DELETE real sobre contactos fallaría en
-- cuanto existiera un lead asociado (siempre existe: todo contacto se crea
-- junto con un lead). Forzar ese cascade requeriría reescribir varias
-- foreign keys, y de todas formas destruiría correspondencia real con
-- clientes (mensajes), registros de consentimiento (consentimientos) y
-- dejaría huérfanas las referencias de auditoria — inaceptable para un CRM
-- de un despacho legal, donde esos registros son precisamente la
-- trazabilidad que hay que conservar. netlify/functions/contact-delete.ts
-- solo marca deleted_at; nada se borra de verdad.
--
-- Alcance: contactos.deleted_at, y se propaga a leads.deleted_at (todos los
-- leads de ese contacto) para que desaparezca de pipeline/inbox/bandeja/
-- calendario, que filtran por leads.deleted_at, no por contactos.deleted_at
-- directamente. conversaciones/mensajes/actividades/auditoria/
-- consentimientos no llevan su propia columna — quedan intactos en la base
-- de datos, simplemente inalcanzables desde la UI una vez que su lead padre
-- queda fuera de los listados.

alter table contactos add column if not exists deleted_at timestamptz;
alter table leads add column if not exists deleted_at timestamptz;

comment on column contactos.deleted_at is
  'Soft-delete. Null = activo. Puesto por contact-delete.ts (solo Administrador general). No se borra la fila ni nada relacionado.';
comment on column leads.deleted_at is
  'Soft-delete, se propaga automáticamente cuando se elimina el contacto dueño (ver contact-delete.ts). Null = activo.';
