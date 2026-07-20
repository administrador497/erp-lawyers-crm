-- CRM ERP Lawyers & Associates — semilla de servicios
-- migrations/001_init.sql crea la tabla `servicios` pero no la siembra.
-- netlify/functions/leads-create.ts busca el servicio por nombre exacto
-- (case-sensitive) al crear un lead; sin esta semilla esa búsqueda no
-- encuentra nada y el lead queda con servicio_id = null. Lista tomada del
-- prototipo CRM ERP Lawyers.dc.html (initLeads()).
insert into servicios (nombre) values
  ('Derecho Corporativo'),
  ('Derecho Laboral'),
  ('Derecho de Familia'),
  ('Migración'),
  ('Propiedad Intelectual'),
  ('Bienes Raíces'),
  ('Derecho Tributario'),
  ('Derecho Penal')
on conflict (nombre) do nothing;
