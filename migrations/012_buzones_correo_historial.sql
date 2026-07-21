-- CRM ERP Lawyers & Associates — tracking de historial de Gmail por buzón
-- Ejecutar DESPUÉS de 001-011. Necesario para netlify/functions/gmail-poll.ts:
-- Gmail no permite "listame lo nuevo" sin un punto de partida — su API de
-- historial (users.history.list) requiere un `historyId` desde el cual
-- avanzar. Se guarda por buzón, no por conversación, porque es un cursor
-- del lado de Gmail (todo el buzón), no algo por hilo.

alter table buzones_correo
  add column if not exists gmail_history_id text,
  add column if not exists ultimo_poll_en timestamptz;

comment on column buzones_correo.gmail_history_id is
  'Cursor de users.history.list de Gmail — todo lo nuevo se lista desde aquí. Null hasta el primer poll exitoso (oauth-google-callback.ts intenta establecerlo al conectar; si falla, gmail-poll.ts lo establece en su primera corrida sin procesar nada, para no importar el historial completo del buzón como leads).';
comment on column buzones_correo.ultimo_poll_en is
  'Última vez que gmail-poll.ts consultó este buzón exitosamente, para diagnóstico (ver hace cuánto no se revisa).';
