-- CRM ERP Lawyers & Associates — esquema inicial (PostgreSQL / Supabase)
-- Convención: uuid pk, created_at/updated_at en todas las tablas, soft-delete vía deleted_at donde aplica.

create extension if not exists "pgcrypto";

create table equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,        -- Administrador general, Supervisor, Abogado, Asistente legal, Recepción, Comercial, Marketing, Auditor, Usuario estándar, personalizado
  permisos jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  correo text not null unique,
  telefono text,
  puesto text,
  departamento text,
  equipo_id uuid references equipos(id),
  rol_id uuid references roles(id),
  idioma text default 'es',
  zona_horaria text default 'America/Costa_Rica',
  activo boolean not null default true,
  password_hash text not null,
  debe_cambiar_password boolean not null default true,
  mfa_activo boolean not null default false,
  canales_autorizados text[] default '{}',   -- {correo, whatsapp}
  firma_correo text,
  horario_atencion jsonb,
  correo_verificado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sesiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id) on delete cascade,
  token_hash text not null,
  ip text,
  user_agent text,
  creada_en timestamptz not null default now(),
  expira_en timestamptz not null,
  revocada boolean not null default false
);

create table empresas (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null,
  sector text,
  created_at timestamptz not null default now()
);

create table contactos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  primer_apellido text,
  segundo_apellido text,
  empresa_id uuid references empresas(id),
  pais text,
  provincia text,
  ciudad text,
  direccion text,
  nacionalidad text,
  idioma_preferido text default 'es',
  zona_horaria text,
  canal_preferido text,
  mejor_horario_contacto text,
  etiquetas text[] default '{}',
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacto_correos (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references contactos(id) on delete cascade,
  correo text not null,
  es_principal boolean default false,
  verificado boolean default false
);

create table contacto_telefonos (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references contactos(id) on delete cascade,
  numero_e164 text not null,          -- formato E.164 obligatorio
  codigo_pais text,
  tipo text not null default 'telefono', -- telefono | whatsapp
  es_principal boolean default false,
  verificado boolean default false
);

create table servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique          -- Derecho Corporativo, Laboral, Familia, Migración, etc.
);

create table pipelines (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Pipeline general'
);

create table etapas (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references pipelines(id),
  nombre text not null,
  orden int not null,
  tiempo_maximo_horas int,
  probabilidad_conversion numeric
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references contactos(id),
  servicio_id uuid references servicios(id),
  pipeline_id uuid references pipelines(id),
  etapa_id uuid references etapas(id),
  responsable_id uuid references usuarios(id),  -- por regla de negocio: Bayron al crear
  canal_origen text not null,                    -- wordpress | crm_form | correo | whatsapp | manual | importacion
  fuente text,
  campana text,
  parametros_utm jsonb,
  pagina_origen text,
  formulario_id uuid,
  mensaje_recibido text,
  prioridad text default 'Media',
  valor_potencial numeric,
  probabilidad_conversion numeric,
  estado text not null default 'Nuevo',          -- Nuevo, Pendiente de asignación, Perdido, etc.
  motivo_perdida text,
  posible_duplicado_de uuid references leads(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table asignaciones_historial (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  usuario_anterior_id uuid references usuarios(id),
  usuario_nuevo_id uuid references usuarios(id),
  asignado_por_id uuid references usuarios(id),
  motivo text,
  estado_anterior text,
  estado_posterior text,
  created_at timestamptz not null default now()
);

create table canales (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                 -- correo | whatsapp
  identificador text not null,        -- buzón o número
  activo boolean default true
);

create table conversaciones (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  contacto_id uuid references contactos(id),
  canal_id uuid references canales(id),
  hilo_externo_id text,
  estado text default 'abierta',      -- abierta | pendiente | cerrada
  created_at timestamptz not null default now()
);

create table mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid references conversaciones(id) on delete cascade,
  canal text not null,                -- correo | whatsapp
  direccion text not null,            -- entrante | saliente
  remitente text,
  destinatarios text[],
  asunto text,
  cuerpo text,
  identificador_externo text,
  referencias_hilo text,
  created_at timestamptz not null default now()
);

create table archivos (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid references mensajes(id),
  lead_id uuid references leads(id),
  nombre_original text,
  tipo_mime text,
  tamano_bytes bigint,
  ruta_almacenamiento text not null,  -- clave en S3
  url_firmada_expira_en timestamptz,
  resultado_escaneo text default 'pendiente', -- pendiente | limpio | malicioso
  created_at timestamptz not null default now()
);

create table actividades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  responsable_id uuid references usuarios(id),
  tipo text not null,                 -- llamada, correo, whatsapp, reunion, tarea, recordatorio
  fecha timestamptz not null,
  estado text default 'pendiente',    -- pendiente | completada | vencida
  descripcion text,
  resultado text,
  proxima_accion text,
  created_at timestamptz not null default now()
);

create table formularios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean default true,
  campos jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table formulario_respuestas (
  id uuid primary key default gen_random_uuid(),
  formulario_id uuid references formularios(id),
  lead_id uuid references leads(id),
  datos jsonb not null,
  url_origen text,
  parametros_utm jsonb,
  created_at timestamptz not null default now()
);

create table automatizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  disparador text not null,
  condicion jsonb,
  accion jsonb not null,
  activo boolean default true
);

create table alertas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  usuario_id uuid references usuarios(id),
  tipo text not null,
  mensaje text,
  leida boolean default false,
  created_at timestamptz not null default now()
);

create table consentimientos (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references contactos(id),
  tipo text not null,                 -- tratamiento_datos | comunicaciones
  otorgado boolean not null,
  fecha timestamptz not null default now(),
  revocado_en timestamptz
);

create table auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id),
  accion text not null,
  entidad text not null,
  entidad_id uuid,
  estado_anterior jsonb,
  estado_posterior jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create table errores_integracion (
  id uuid primary key default gen_random_uuid(),
  origen text not null,               -- wordpress | correo | whatsapp
  payload jsonb,
  error_detalle text,
  reintentos int default 0,
  resuelto boolean default false,
  created_at timestamptz not null default now()
);

create index idx_leads_responsable on leads(responsable_id);
create index idx_leads_estado on leads(estado);
create index idx_contacto_telefonos_e164 on contacto_telefonos(numero_e164);
create index idx_mensajes_conversacion on mensajes(conversacion_id);

-- Semilla: pipeline y etapas por defecto
insert into pipelines (nombre) values ('Pipeline general');
insert into etapas (pipeline_id, nombre, orden)
select id, etapa, orden from pipelines,
  (values
    ('Lead nuevo',1),('Pendiente de revisión',2),('Pendiente de asignación',3),
    ('Primer contacto realizado',4),('Pendiente de respuesta',5),('Información incompleta',6),
    ('Lead calificado',7),('Consulta agendada',8),('Consulta realizada',9),
    ('Propuesta enviada',10),('En negociación',11),('Pendiente de contratación',12),
    ('Contratado',13),('Seguimiento futuro',14),('No califica',15),('Perdido',16)
  ) as e(etapa, orden)
where pipelines.nombre = 'Pipeline general';
