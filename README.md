# Handoff: CRM Omnicanal — ERP Lawyers & Associates (backend real)

## Overview
CRM omnicanal para centralizar contactos, leads y comunicaciones (WordPress, correo, WhatsApp, formularios) de ERP Lawyers & Associates, con asignación automática de todo lead nuevo a Bayron Alpízar Araya, bandeja unificada, pipeline, actividades, auditoría y reportes.

## Estado de la implementación
**Ya construido** (Next.js real en `app/`, `components/`, `lib/`, `netlify/functions/` — no simulado):
- Autenticación completa con Supabase Auth: login (`app/login`), cambio de contraseña obligatorio en primer ingreso (`app/change-password`). La protección de rutas vive en `lib/authGuard.ts`, invocado desde cada layout de servidor (`app/(app)/layout.tsx`, `app/change-password/layout.tsx`, `app/login/layout.tsx`) — bloquea toda pantalla sin sesión válida o con `debe_cambiar_password = true`. No usa el middleware de Next.js (su Edge runtime falla con `EvalError: Code generation from strings disallowed` en algunas máquinas Windows con protecciones estrictas; el archivo original queda como referencia inerte en `middleware.ts.disabled`).
- Bandeja **"Nuevos leads por asignar"** (`app/(app)/leads`) con datos reales desde Supabase vía `netlify/functions/leads-inbox.ts`, y reasignación vía `netlify/functions/leads-assign.ts` (solo rol Administrador general, verificado en backend).
- Regla de asignación automática a Bayron implementada **a nivel de base de datos** (`migrations/003_lead_assignment_rule.sql`), no solo en la API — se cumple sin importar qué inserte el lead (webhook futuro, `leads-create.ts`, importación manual).
- **Bandeja omnicanal** (`app/(app)/inbox`): lista de conversaciones + hilo de mensajes + respuesta, con datos reales vía `netlify/functions/conversations-list.ts`, `messages-list.ts` y `messages-send.ts`. Visibilidad por rol aplicada en backend (Administrador general ve todas las conversaciones; Usuario estándar solo las de sus leads asignados). `messages-send.ts` **solo persiste el mensaje saliente en Supabase** — el envío real por OAuth de correo / WhatsApp Business Platform queda marcado con `TODO(real-send)` explícito, pendiente de las integraciones oficiales (ver sección "Correo" y "WhatsApp" más abajo).
- **Pipeline Kanban** (`app/(app)/pipeline`): 8 etapas (`Nuevo, Respuesta, Propuesta, Duplicado, En Espera, Descartado, Ganado, Perdido` — `migrations/007_pipeline_etapas_v2.sql`) con tarjetas arrastrables (drag & drop nativo HTML5, sin librería nueva), vía `netlify/functions/pipeline-list.ts` y `leads-move-stage.ts`. Actualización optimista con reversión automática si el backend rechaza el movimiento. Mover una tarjeta a "Perdido" exige un motivo fijo (catálogo `motivos_perdida`, modal de selección) — el backend rechaza el cambio con 400 si falta o es inválido, y lo limpia automáticamente si el lead sale de "Perdido" después.
- **Contactos y leads** (`app/(app)/contactos` — el sidebar y `AppShell.tsx` usan esta ruta en español, no `/contacts`; se construyó ahí para no dejar un enlace roto en la navegación): lista + ficha con tabs Información/Historial, vía `netlify/functions/contacts-list.ts`, `contact-detail.ts` y `contact-update.ts`. El historial se arma en tiempo real cruzando `auditoria` + `asignaciones_historial` + `mensajes` + `actividades` de ese lead, ordenado cronológicamente. Edición inline solo de los campos autorizados (nombre/apellidos, teléfono principal, notas, etiquetas, prioridad, valor potencial) — correo, servicio, canal, responsable y etapa se muestran de solo lectura porque cambian por otros flujos (asignación, pipeline, formularios).
- **Calendario y actividades** (`app/(app)/calendario`): lista fiel al bloque `isCalendar` del prototipo (fecha, título, lead · tipo, toggle Completar/Reabrir) vía `netlify/functions/activities-list.ts`, `activity-create.ts` y `activity-update.ts`, más un modal para crear actividades nuevas (reutiliza `contacts-list.ts` para el selector de lead). Visibilidad por rol sobre `actividades.responsable_id` ("mi calendario" para Usuario estándar); ownership en creación/edición verificado contra el lead o la propia actividad.
- **Constructor de formularios** (`app/(app)/formularios`): editor + vista previa en vivo fiel al bloque `isForms`, con formularios reales en `formularios`/`formulario_respuestas`. `netlify/functions/forms-list.ts`/`forms-get.ts` para leer, `forms-save.ts` (solo Administrador general o Supervisor) para crear/editar. `netlify/functions/forms-submit.ts` es el único endpoint **público sin autenticación** de todo el proyecto (pensado para que un sitio externo tipo WordPress lo llame directo desde el navegador del visitante — con CORS habilitado) — valida que el formulario esté activo y los campos requeridos, y crea el lead disparando la misma regla de asignación automática a Bayron. Tiene un `TODO(produccion)` explícito para agregar protección anti-spam antes de exponerlo en un sitio real.
- **Reportes** (`app/(app)/reportes`): leads por canal, embudo de conversión por las 8 etapas actuales y leads/tiempo de respuesta por usuario, todo desde un único `netlify/functions/reports-summary.ts`. Mismo filtro por rol que el resto (Usuario estándar ve solo sus propios números). La tarjeta "por usuario" muestra leads asignados + tiempo promedio hasta el primer mensaje saliente en `mensajes` — el prototipo mostraba ahí un % de "cumplimiento SLA" inventado con `Math.random()`; se reemplazó por la métrica real que sí se puede calcular con los datos existentes, sin un umbral de SLA definido para fabricar un porcentaje de cumplimiento.
- **Usuarios y roles** (`app/(app)/usuarios`), solo Administrador general (403 en backend + mensaje de acceso denegado en la UI para cualquier otro rol): tabla fiel al bloque `isUsers`, vía `netlify/functions/users-list.ts`, `user-create.ts` y `user-update.ts`. Crear usuario da de alta la cuenta real en Supabase Auth (contraseña temporal generada con `crypto.randomBytes`, `debe_cambiar_password=true`) y, si el segundo paso (asignar rol/equipo) falla, revierte borrando el usuario de Auth — `usuarios.auth_user_id` tiene `on delete cascade`, así que ese borrado también limpia la fila a medio crear sin necesidad de una transacción manual multi-tabla. Editar permite rol/equipo/activo/canales autorizados, con un guardrail para que un admin no pueda desactivar su propia cuenta; "Restablecer contraseña" es una acción aparte que genera y muestra una nueva temporal una sola vez.
- **Panel General / Dashboard** (`app/(app)/dashboard` — es la ruta que ya usaban el sidebar y `AppShell.tsx`; no se creó `app/(app)/page.tsx` porque colisionaría con el `app/page.tsx` que ya existe en la raíz para el redirect post-login, ambos resuelven a `/`): toggle Vista general/Mi actividad (el primero oculto para quien no sea Administrador general, y forzado a "personal" en el backend igual si alguien intenta pedirlo directo), 4 KPIs reales, actividad reciente (últimas entradas de `auditoria` sobre leads) y próximas actividades, todo desde `netlify/functions/dashboard-summary.ts`.

**Los 9 módulos del sidebar están completos.** Todo pasa por Netlify Functions con la service role key y permisos por rol verificados en el backend — el prototipo `.dc.html` queda solo como referencia visual histórica.

Ver `SETUP.md` sección 0 para correrlo localmente y sección 1 para el orden completo de migraciones (`001` a `009`).

## About the design files
Los archivos `.dc.html` incluidos (`CRM ERP Lawyers.dc.html`, `Blueprint CRM ERP Lawyers.dc.html`) son **referencias de diseño en HTML**: un prototipo de alta fidelidad con estado simulado en memoria (sin backend real, sin persistencia, sin auth real) y un documento de arquitectura/funcional. **No son código de producción para copiar tal cual.** La tarea es reconstruir esta UI y su lógica sobre un stack real (recomendado: React/Next.js o similar en el frontend, Netlify Functions + Supabase en el backend), reemplazando el estado simulado por llamadas reales a base de datos, autenticación e integraciones oficiales.

## Fidelity
**Alta fidelidad (hifi)** — colores, tipografía, layout, copy en español y microinteracciones (asignar lead, mover tarjeta en Kanban, responder mensaje, activar modo oscuro) están definidos en el prototipo y deben respetarse pixel a pixel. La lógica de negocio detrás de cada acción (persistencia, notificaciones reales, envío real de correo/WhatsApp) debe implementarse desde cero según este README y `Blueprint CRM ERP Lawyers.dc.html`.

## Regla de negocio central (no negociable)
Todo lead nuevo, de cualquier canal, se crea con estado "Nuevo", se asigna automáticamente a **Bayron Alpízar Araya** (`bayron@erplawyers.com`), dispara notificación in-app + correo a Bayron, y aparece en "Nuevos leads por asignar". Ver sección 3 y 8 del blueprint para el detalle completo y los criterios de aceptación (sección 10).

## Usuarios iniciales
| Nombre | Correo | Rol | Contraseña temporal |
|---|---|---|---|
| Bayron Alpízar Araya | bayron@erplawyers.com | Administrador general | ERPLaw.1122 |
| Juan Carlos Rojas Piedra | juancarlos@erplawyers.com | Usuario estándar | ERPLaw.1122 |
| José Martín Azofeifa Rodríguez | jose@erplawyers.com | Usuario estándar | ERPLaw.1122 |
| Maisha Mattis Byfield | maisha@erplawyers.com | Usuario estándar | ERPLaw.1122 |

La contraseña temporal debe forzar cambio + verificación de correo en el primer ingreso y nunca reutilizarse después. Nunca almacenar en texto plano — usar el hashing del proveedor de auth (Supabase Auth / Clerk).

## Arquitectura recomendada
- **Frontend:** Netlify (estático + funciones), recrear las pantallas del prototipo con el framework elegido por el equipo.
- **Backend/lógica:** Netlify Functions solo para webhooks ligeros y firmados (WordPress, WhatsApp, correo entrante). Nada de procesos permanentes ni colas dentro de Netlify Functions.
- **Base de datos:** Supabase (Postgres administrado) — ver `migrations/001_init.sql` para el esquema inicial y datos semilla del pipeline.
- **Autenticación:** Supabase Auth o Clerk — MFA, hashing, revocación de sesiones, bloqueo por intentos.
- **Archivos:** S3 o compatible, URLs firmadas temporales, nunca almacenamiento efímero de funciones.
- **Correo:** OAuth (Google Workspace / Microsoft 365) por buzón de usuario + proveedor transaccional para envíos del sistema.
- **WhatsApp:** WhatsApp Business Platform oficial (Meta) o BSP autorizado — nunca automatización no oficial.
- **Colas/reintentos:** servicio administrado (Upstash/SQS) para idempotencia de webhooks.

Detalle completo, comparación de alternativas y justificación en `Blueprint CRM ERP Lawyers.dc.html`, sección 7.

## Endpoints / Webhooks a implementar (Netlify Functions)
- `POST /api/webhooks/wordpress` — recibe formularios, verifica firma HMAC (`WORDPRESS_WEBHOOK_SHARED_SECRET`), crea/actualiza contacto + lead, asigna a Bayron.
- `POST /api/webhooks/whatsapp` — verificación (`GET` con `hub.challenge`) + recepción de mensajes/adjuntos, verifica `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`.
- `POST /api/webhooks/email-inbound` — parseo de correos entrantes (vía proveedor OAuth o servicio de recepción), asocia por hilo/referencias.
- `POST /api/leads` — creación manual/API de leads, mismas reglas de asignación y deduplicación.
- `POST /api/leads/:id/assign` — reasignación, registra en `asignaciones_historial`.
- `GET /api/leads/inbox` — bandeja de nuevos leads por asignar.
- `POST /api/messages/send` — envío saliente (correo/WhatsApp) desde la bandeja omnicanal.
- Todas las rutas deben aplicar permisos por rol en backend (no solo ocultar en UI) y devolver 401/403 explícitos.

## Estado y transiciones (frontend)
Ver el prototipo (`CRM ERP Lawyers.dc.html`) para el árbol de estado exacto a reproducir: `screen` (login/forceChange/app), `activeView`, `darkMode`, listas de `leads`/`activities`/`formFields` y sus mutaciones (`assignLead`, `moveCard` vía drag&drop, `sendReply`, `toggleActivity`). Reemplazar cada mutación de estado local por una llamada a los endpoints anteriores + refetch/optimistic update.

## Design tokens
- Rojo primario: `#CE192B` — acciones, prioridad alta, nav activo.
- Azul de acento: `#3349AA` — enlaces, datos, estados informativos (extensión de marca, ver blueprint sección 4).
- Tan / crema: `#B8AA91` / `#DBD3C8` — superficies neutras, modo claro y oscuro.
- Tipografía: `Source Serif 4` (encabezados), `Public Sans` (interfaz).
- Radio de borde: 2px en toda la interfaz (look editorial/legal, no redondeado).
- Modo oscuro: fondo `#141311`, panel `#1D1B18`, texto `#F2EEE6`.

## Assets
- `assets/logo-erp.png` — logotipo oficial, tomado de `uploads/logo ERP.png` del proyecto de diseño.
- Manual de marca fuente: `uploads/MANUAL DE MARCA.pdf` (mayormente gráfico; solo 4 códigos de color se extrajeron como texto — confirmar tipografías oficiales si el manual las define).

## Seguridad — no negociable
Cifrado en tránsito/reposo, MFA, hashing seguro, permisos aplicados en backend, escaneo de adjuntos, URLs firmadas temporales, webhooks verificados por firma con reintentos idempotentes, auditoría inmutable de cada acción. Ver blueprint sección 9.

## Files in this bundle
- `README.md` — este documento.
- `SETUP.md` — guía paso a paso para conectar Supabase, Netlify, S3, correo (OAuth), WhatsApp Business y WordPress, con checklist final.
- `netlify.toml` — build de Next.js vía `@netlify/plugin-nextjs`, funciones, redirects y headers de seguridad.
- `.env.example` — todas las variables de entorno necesarias (con marcadores donde falten credenciales reales).
- `migrations/001_init.sql` — esquema completo de base de datos + semilla de pipeline/etapas.
- `migrations/002_auth_link.sql` — vínculo `usuarios` ↔ Supabase Auth, semilla de roles/4 usuarios, RLS base.
- `migrations/003_lead_assignment_rule.sql` — regla no negociable de asignación automática a Bayron (trigger de base de datos).
- `migrations/004_servicios_seed.sql` — catálogo de servicios (Derecho Corporativo, Laboral, Familia, etc.).
- `migrations/005_conversaciones_seed.sql` — canales de ejemplo (correo/whatsapp) + 2-3 conversaciones con mensajes, para probar `/inbox` de inmediato.
- `migrations/007_pipeline_etapas_v2.sql` — catálogo de 8 etapas del pipeline actual + catálogo `motivos_perdida`.
- `migrations/008_actividades_seed.sql` — 3-4 actividades de ejemplo sobre los leads ya sembrados, para probar `/calendario` de inmediato.
- `migrations/009_formulario_seed.sql` — formulario "Consulta general" con los 5 campos del prototipo, usando los `id` fijos que `forms-submit.ts` mapea a columnas reales.
- `app/`, `components/`, `lib/` — frontend Next.js (App Router) real, sin estado simulado. `lib/authGuard.ts` centraliza la protección de rutas (se invoca desde los layouts de servidor, no desde middleware).
- `netlify/functions/` — funciones serverless (auth, bandeja de leads, asignación, creación, bandeja omnicanal, pipeline, contactos, actividades, formularios, reportes, usuarios, dashboard) que hablan con Supabase usando la service role key. `forms-submit.ts` es la única sin autenticación (endpoint público para envíos externos).
- `CRM ERP Lawyers.dc.html` — prototipo interactivo de referencia visual/funcional; los 9 módulos ya están reconstruidos sobre datos reales.
- `Blueprint CRM ERP Lawyers.dc.html` — documento completo de arquitectura, modelo de datos, fases, MVP y criterios de aceptación.
- `assets/logo-erp.png` — logotipo oficial (también copiado a `public/logo-erp.png` para Next.js).

## Antes de producción
Sustituir todas las credenciales de `.env.example` por valores reales, verificar los 4 correos de usuario, conectar cuentas OAuth de correo, aprobar el número de WhatsApp Business y las plantillas de mensaje ante Meta, y ejecutar el checklist de seguridad y lanzamiento del blueprint (sección 9-10) antes de ir a producción.
