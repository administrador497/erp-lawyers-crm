-- CRM ERP Lawyers & Associates — formulario de ejemplo para /formularios
-- Mismos 5 campos que CRM ERP Lawyers.dc.html (initFormFields()). Los `id`
-- de cada campo son deliberadamente estos nombres fijos — no cosméticos:
-- netlify/functions/forms-submit.ts los usa para mapear las respuestas de
-- un envío externo (p. ej. WordPress) a columnas reales de `contactos` y
-- `leads` (nombre, correo, teléfono, servicio, mensaje_recibido). Si edita
-- este formulario desde /formularios y renombra el `label` de un campo, no
-- pasa nada — pero si le cambia el `id`, un formulario externo ya
-- integrado que envíe datos con la clave vieja dejaría de mapear ese campo.

insert into formularios (nombre, activo, campos)
select
  'Consulta general',
  true,
  '[
    {"id": "nombre_completo", "label": "Nombre completo", "type": "texto", "required": true, "placeholder": "Nombre y apellidos"},
    {"id": "correo", "label": "Correo electrónico", "type": "correo", "required": true, "placeholder": "nombre@correo.com"},
    {"id": "telefono", "label": "Teléfono / WhatsApp", "type": "teléfono", "required": true, "placeholder": "+506 8000 0000"},
    {"id": "servicio", "label": "Servicio de interés", "type": "selección", "required": true, "placeholder": "Seleccione un servicio"},
    {"id": "descripcion", "label": "Descripción de la consulta", "type": "texto largo", "required": false, "placeholder": "Cuéntenos brevemente su caso"}
  ]'::jsonb
where not exists (select 1 from formularios where nombre = 'Consulta general');
