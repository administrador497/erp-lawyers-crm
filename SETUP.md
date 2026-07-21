# Guía de conexión — paso a paso

Sigue este orden: 0) código ya implementado → 1) base de datos/auth → 2) Netlify → 3) almacenamiento → 4) correo → 5) WhatsApp → 6) WordPress. Cada paso indica dónde hacer clic y qué variable de `.env.example` completar.

## 0. Código ya implementado en este repositorio
Los 9 módulos del sidebar más **Mi perfil** ya están construidos sobre una app Next.js real (App Router) + funciones Netlify, reemplazando por completo el estado simulado del prototipo `.dc.html`: **autenticación** (login + cambio de contraseña obligatorio), **Nuevos leads por asignar** (con la regla de asignación automática a Bayron), **Bandeja omnicanal** (el envío real por correo ya está conectado vía Gmail cuando el remitente tiene un buzón conectado — el de WhatsApp todavía no; `messages-send.ts` conserva el `TODO(real-send-whatsapp)` solo para ese canal; incluye adjuntos reales tanto al enviar como al recibir, subidos a almacenamiento S3-compatible — ver paso 3; incluye indicador de no leídos, cambio de etapa del pipeline y creación de actividades directo desde el hilo — ver README), **Pipeline Kanban**, **Contactos y leads**, **Calendario y actividades**, **Constructor de formularios** (incluye `forms-submit.ts`, único endpoint público sin autenticación, para envíos externos tipo WordPress), **Reportes**, **Usuarios y roles** y **Mi perfil** (cambio de contraseña voluntario + conectar/desconectar el buzón de Gmail propio vía OAuth — ver paso 4 más abajo). El correo por Gmail ya envía y recibe de verdad: envío real en `messages-send.ts`, recepción por polling en `netlify/functions/gmail-poll.ts` (necesita conectarse a un cron externo — ver paso 4).

Para correrlo localmente:
1. `npm install` (requiere Node.js 18+; no se pudo ejecutar en este entorno de generación de código — instálalo tú antes de continuar).
2. Copia `.env.example` a `.env` y completa como mínimo `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (= mismo valor que `SUPABASE_URL`), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (= mismo valor que `SUPABASE_ANON_KEY`).
3. Instala la CLI de Netlify (`npm install -g netlify-cli`) y corre `netlify dev` (no `next dev` a secas) — así el frontend Next.js y las funciones en `netlify/functions/` corren juntos en `localhost:8888` con el mismo enrutado `/api/*` que en producción.
4. Ejecuta **todas** las migraciones en Supabase, en orden (`001` a `014` — ver paso 1.3 más abajo), antes de usar la app: varios módulos dependen de que las anteriores ya hayan corrido (usuarios/roles, la regla de asignación automática, servicios, etapas del pipeline actual, catálogo de motivos de pérdida, formulario de ejemplo, políticas RLS por rol, tabla de buzones de correo, columnas de tracking de Gmail, soft-delete de contactos, mensajes no leídos).

## 1. Supabase (base de datos + autenticación)
1. Crear cuenta/proyecto en supabase.com → New Project (región más cercana a Costa Rica: `us-east-1`).
2. Project Settings → API: copiar `Project URL`, `anon public key`, `service_role key` → `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (y las versiones `NEXT_PUBLIC_*` — ver paso 0).
3. SQL Editor → ejecutar **en este orden exacto**: `migrations/001_init.sql` → `002_auth_link.sql` (siembra los 4 usuarios/roles y vincula `usuarios` con `auth.users`) → `003_lead_assignment_rule.sql` (activa la regla no negociable de asignación automática a Bayron vía trigger) → `004_servicios_seed.sql` (catálogo de servicios) → `005_conversaciones_seed.sql` (2-3 conversaciones y mensajes de ejemplo para probar `/inbox`; reutiliza el lead de prueba "Prueba Rodríguez Solano" si ya lo creaste desde `/leads`, o lo recrea) → `007_pipeline_etapas_v2.sql` (reemplaza las 16 etapas originales por las 8 del pipeline actual y agrega el catálogo `motivos_perdida`; reasigna a "Nuevo" cualquier lead que quedara en una etapa eliminada, sin dejar huérfanos, y actualiza el trigger de `003` para que los leads nuevos por defecto caigan en "Nuevo" en vez de la vieja "Lead nuevo") → `008_actividades_seed.sql` (3-4 actividades de ejemplo sobre los leads ya sembrados, para probar `/calendario`) → `009_formulario_seed.sql` (formulario "Consulta general" con los 5 campos del prototipo, para probar `/formularios` y el endpoint público `forms-submit.ts`) → `010_rls_por_rol.sql` (segunda capa de defensa: políticas RLS de `SELECT` por rol sobre `leads`/`contactos`/`conversaciones`/`mensajes`/`archivos`/`actividades`/`auditoria`/`usuarios`, adicionales al patrón service-role-only) → `011_buzones_correo.sql` (tabla `buzones_correo` para la conexión OAuth de correo por usuario, ver paso 4 más abajo) → `012_buzones_correo_historial.sql` (agrega `gmail_history_id`/`ultimo_poll_en` a `buzones_correo`, el cursor que usa `gmail-poll.ts` para saber qué correo entrante ya procesó) → `013_soft_delete_contactos.sql` (agrega `deleted_at` a `contactos`/`leads` para el botón "Eliminar contacto" de `/contactos` — soft-delete, no borra filas) → `014_mensajes_leido.sql` (agrega `leido_en` a `mensajes` para el indicador de no leídos de `/inbox`).
4. Authentication → Providers: activar Email; Authentication → Settings: forzar verificación de correo, habilitar MFA (TOTP).
5. Crear los 4 usuarios iniciales desde Authentication → Users → Invite user, con los correos de la tabla del README y contraseña temporal `ERPLaw.1122`. **No hace falta marcar `debe_cambiar_password` manualmente** — la fila ya existe en `usuarios` desde `002_auth_link.sql` con ese campo en `true`, y el trigger `on_auth_user_created` la vincula automáticamente por correo al invitar. El primer login siempre exige cambio de contraseña (lo aplican los guards de `lib/authGuard.ts` en los layouts de servidor y la función `auth-complete-password-change`).
6. RLS viene activado en todas las tablas desde `002_auth_link.sql`, y `010_rls_por_rol.sql` agrega políticas de `SELECT` por rol sobre las tablas sensibles (más detalle en el README). Sigue siendo una segunda capa: todo lo que la app usa día a día — leer/asignar leads, etc. — pasa exclusivamente por `netlify/functions/*` con la `service_role key`, que aplica los permisos por rol en el backend. Revisa las políticas antes de producción si agregas más lectura directa desde el navegador.

## 2. GitHub + Netlify (frontend + funciones)

### 2.1 Subir el código a GitHub
Esta carpeta todavía no es un repositorio git. Desde una terminal, parada en esta carpeta:
1. `git init`
2. `git add .`
3. `git commit -m "CRM Omnicanal ERP Lawyers — versión inicial"`
4. `git branch -M main`
5. En github.com → **New repository** (botón "+" arriba a la derecha) → nombre (p. ej. `crm-erp-lawyers`) → **NO** marques "Add a README", "Add .gitignore" ni licencia (ya existen aquí y chocarían) → Create repository.
6. GitHub te muestra la URL del repo vacío. Cópiala y corre:
   `git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git`
7. `git push -u origin main`

Verifica en la web de GitHub que **no** aparezcan `.env`, `.next/` ni `node_modules/` en el repo — si alguno aparece, `.gitignore` no se aplicó correctamente (revísalo antes de seguir, y si `.env` ya se subió, rota esas credenciales en Supabase de inmediato porque quedaron públicas en el historial).

### 2.2 Conectar Netlify al repositorio
1. app.netlify.com → **Add new site** → **Import an existing project** → **Deploy with GitHub** → autoriza el acceso si es la primera vez → selecciona el repositorio que acabas de crear.
2. Netlify va a leer `netlify.toml` automáticamente y proponer:
   - Build command: `npm run build`
   - Publish directory: **déjalo vacío/por defecto** — no escribas `dist` ni ninguna carpeta a mano. El plugin `@netlify/plugin-nextjs` (ya declarado en `netlify.toml`) gestiona esto solo; si fuerzas un valor aquí, puedes romper el build.
3. **Antes de hacer clic en "Deploy site"**, busca la sección "Add environment variables" en esa misma pantalla (o hazlo después en Site settings → Environment variables → Add a variable) y carga las variables — ver la lista exacta en la sección 2.3 más abajo.
4. Deploy site. Sigue el log del build; si falla por una variable faltante, agrégala y volvé a hacer "Trigger deploy" (no hace falta repetir el import).
5. Domain settings → agrega el dominio propio (p. ej. `crm.erplawyers.com`) si ya lo tienes, y activa el HTTPS automático (Netlify lo hace solo vía Let's Encrypt).
6. Ya desplegado, confirma dos cosas desde la terminal:
   - `curl -I https://<tu-dominio>` → deben aparecer los headers `X-Frame-Options`, `Content-Security-Policy`, etc. de `netlify.toml`/`next.config.mjs`.
   - Abre `https://<tu-dominio>/login` en el navegador → debe cargar el formulario de login real (no un error 404 ni la pantalla por defecto de Netlify).

### 2.3 Variables de entorno a cargar en Netlify (Site settings → Environment variables)
Usa `.env.example` como referencia de nombres, pero **solo estas ya son necesarias** para lo que está construido — el resto de `.env.example` es para integraciones futuras que el código actual todavía no usa (ver nota abajo).

**Imprescindibles ahora** (sin esto el sitio no funciona):
| Variable | Valor |
|---|---|
| `SUPABASE_URL` | Project URL de tu proyecto Supabase |
| `SUPABASE_ANON_KEY` | anon public key de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key de Supabase — **secreta**, nunca la pegues en ningún otro lugar |
| `NEXT_PUBLIC_SUPABASE_URL` | el mismo valor exacto que `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | el mismo valor exacto que `SUPABASE_ANON_KEY` |
| `APP_BASE_URL` | `https://<tu-dominio>` (la URL final de Netlify o tu dominio propio) |

Sí, `SUPABASE_URL`/`SUPABASE_ANON_KEY` y sus versiones `NEXT_PUBLIC_*` llevan el mismo valor duplicado bajo dos nombres distintos — es intencional: las versiones sin prefijo las leen las funciones en `netlify/functions/*` (nunca llegan al navegador), las `NEXT_PUBLIC_*` las compila Next.js dentro del bundle que sí ve el navegador.

**Opcionales ahora** (el sitio funciona sin ellas; solo se apaga la función puntual que dependía de cada una):
- `TRANSACTIONAL_EMAIL_PROVIDER` (`postmark` o `sendgrid`), `TRANSACTIONAL_EMAIL_API_KEY`, `TRANSACTIONAL_EMAIL_FROM` — sin esto, `notifyBayron.ts` simplemente no envía el correo de aviso a Bayron y sigue funcionando (el aviso real ya queda en el CRM vía `alertas`).
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` — sin esto, "Mi perfil → Gestión de correo → Conectar Gmail" responde 500 en vez de abrir la pantalla de consentimiento de Google; el resto de la app funciona igual. Sí son necesarias para que esa sección — y el envío/recepción real de correo que depende de ella (`messages-send.ts`, `gmail-poll.ts`) — sirvan de algo. Ver paso 4 más abajo para configurarlas. **Genera `TOKEN_ENCRYPTION_KEY` antes de que cualquier usuario conecte su primer buzón** (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) y no la rotes después sin avisar: rotarla vuelve indescifrables los tokens ya guardados y cada usuario conectado tendría que reconectar su cuenta.
- `CRON_POLL_SECRET` — sin esto, `gmail-poll.ts` responde 401 a cualquier llamada (incluso con el resto de las variables de Google configuradas) y el correo entrante nunca se procesa; el envío (`messages-send.ts`) y el resto de la app no lo necesitan. Genera uno con `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` y ver paso 4 para cómo invocar la función con él.
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_SIGNED_URL_EXPIRY_SECONDS` — sin esto, adjuntar un archivo al responder desde `/inbox` falla con un error 500/502 (el mensaje de texto se envía igual, sin el adjunto), y el correo entrante con adjuntos los pierde silenciosamente (queda registrado en `errores_integracion`, pero el archivo no se guarda). Ver paso 3 para obtenerlas de Supabase Storage.

**No las cargues todavía** — nada del código construido las lee: `MS365_OAUTH_*`, `WHATSAPP_*`, `WORDPRESS_WEBHOOK_SHARED_SECRET`, `QUEUE_*`. Corresponden a los pasos 4 (solo la parte de Microsoft 365), 5 y 6 de esta guía (Microsoft 365, WhatsApp, WordPress), que son integraciones **todavía sin construir** — las URLs de webhook que mencionan esos pasos (`webhooks-whatsapp`, `webhooks-wordpress`, `oauth-ms365-callback`) no tienen función correspondiente en `netlify/functions/` todavía, así que configurarlas ahora solo daría 404. `BAYRON_EMAIL`/`JUAN_CARLOS_EMAIL`/`JOSE_MARTIN_EMAIL`/`MAISHA_EMAIL`/`INITIAL_TEMP_PASSWORD` en `.env.example` son solo referencia documental de la tabla de usuarios iniciales — ningún código los lee vía `process.env`, así que no hace falta cargarlos en Netlify en absoluto.

Carga estas variables **para los tres contextos** (Production, Deploy previews, Branch deploys) con el mismo valor, a menos que tengas proyectos Supabase separados para staging/producción.

## 3. Almacenamiento de adjuntos (S3 o compatible)
El código (`netlify/functions/_shared/s3Client.ts`, vía `@aws-sdk/client-s3`) habla el protocolo S3 real — funciona con cualquier proveedor compatible, no solo AWS. Esta guía usa **Supabase Storage en modo S3-compatible**, porque ya tienes el proyecto de Supabase de los pasos anteriores y no requiere una cuenta nueva; si preferís AWS S3 real o Cloudflare R2, el código no cambia, solo estos valores.

1. Supabase Dashboard → tu proyecto → **Project Settings → Storage** → sección **"S3 Connection"**. Copia el **Endpoint URL** y la **Region** que aparecen ahí (no los escribas de memoria — dependen de tu proyecto).
2. En esa misma sección, **"New access key"** → genera un par Access Key ID + Secret Access Key. Cópialos de inmediato, Supabase solo muestra el secreto una vez.
3. **Storage → New bucket** → nómbralo (p. ej. `adjuntos`) → **déjalo privado** (no marques "Public bucket") — son adjuntos de correspondencia real con clientes, nunca deben quedar accesibles sin una URL firmada.
4. Carga en Netlify (paso 2.3): `S3_BUCKET` (el nombre del bucket), `S3_REGION` y `S3_ENDPOINT` (los del paso 1), `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (los del paso 2), `S3_SIGNED_URL_EXPIRY_SECONDS` (900 está bien).
5. **Pendiente, no implementado todavía**: escaneo antivirus antes de servir un adjunto — hoy `archivos.resultado_escaneo` se guarda siempre como `pendiente` (su valor por defecto) y nunca se marca `limpio`/`malicioso`. Antes de manejar adjuntos reales de desconocidos en producción, integra un escaneo (ej. ClamAV en una función aparte, o un servicio de terceros) que corra antes de generar la URL de descarga en `archivo-descargar.ts`.

## 4. Correo (OAuth por usuario + envío transaccional)
**OAuth Google Workspace** — el código ya está construido (`oauth-google-start.ts`, `oauth-google-callback.ts`, tabla `buzones_correo`, botón "Conectar Gmail" en Mi perfil); esto es solo la configuración del lado de Google (Bayron, Juan Carlos, José Martín, Maisha si usan Gmail/Workspace, cada quien conecta la suya):
1. console.cloud.google.com → crear proyecto → habilitar Gmail API.
2. OAuth consent screen → tipo interno (si el workspace lo permite) → agregar los 4 correos como usuarios de prueba mientras no esté verificado. Scopes a declarar: `gmail.send`, `gmail.readonly`, `openid`, `email` (son los mismos que pide `oauth-google-start.ts`).
3. Credentials → Create OAuth client ID (Web application) → Authorized redirect URI: `https://<tu-dominio>/.netlify/functions/oauth-google-callback` → copiar Client ID/Secret a `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`, y la misma redirect URI a `GOOGLE_OAUTH_REDIRECT_URI` (las tres son necesarias — ver la tabla de variables del paso 2.3).
4. Genera y carga `TOKEN_ENCRYPTION_KEY` (paso 2.3) antes de que nadie use el botón "Conectar Gmail" — es la clave con la que se cifran los tokens antes de guardarlos.

**Recepción de correo — conectar `gmail-poll.ts` a un cron** (el envío no necesita este paso, solo la recepción):
1. Genera y carga `CRON_POLL_SECRET` (paso 2.3).
2. Elige un programador externo que pueda hacer un `POST` periódico con un header — por ejemplo cron-job.org (gratuito), un GitHub Actions con `schedule:` en el repo, o un [Netlify Scheduled Function](https://docs.netlify.com/functions/scheduled-functions/) nuevo y separado que a su vez llame a esta URL. Cada 5-10 minutos es razonable para un CRM (no hace falta casi-tiempo-real todavía — ver el TODO de Pub/Sub en el propio `gmail-poll.ts` si más adelante sí hace falta).
3. Configura la llamada: `POST https://<tu-dominio>/.netlify/functions/gmail-poll` con el header `X-Cron-Secret: <el mismo valor de CRON_POLL_SECRET>`.
4. Para probarlo a mano mientras tanto: `curl -X POST https://<tu-dominio>/.netlify/functions/gmail-poll -H "X-Cron-Secret: <valor>"` — responde un JSON con un resultado por buzón conectado (`mensajes_nuevos`, o el motivo si algo falló).

**OAuth Microsoft 365** (si aplica):
1. portal.azure.com → App registrations → New registration.
2. Redirect URI (Web): `https://<tu-dominio>/.netlify/functions/oauth-ms365-callback`.
3. API permissions → Microsoft Graph → `Mail.Read`, `Mail.Send`, `offline_access` → Grant admin consent.
4. Certificates & secrets → nuevo client secret → `MS365_OAUTH_CLIENT_ID`/`SECRET`.

**Envío transaccional** (confirmaciones automáticas, notificaciones del sistema):
1. Crear cuenta en Postmark/SendGrid/SES.
2. Verificar el dominio `erplawyers.com` (registros SPF/DKIM/DMARC en el DNS).
3. Copiar API key → `TRANSACTIONAL_EMAIL_API_KEY`; definir remitente verificado → `TRANSACTIONAL_EMAIL_FROM`.

Cada usuario conecta su propio buzón desde "Mi perfil → Gestión de correo" una vez el OAuth esté configurado — no se comparten credenciales entre usuarios.

## 5. WhatsApp Business Platform (oficial)
1. business.facebook.com → Meta Business Suite → crear/usar el Business Manager de ERP Lawyers.
2. developers.facebook.com → crear una app tipo "Business" → agregar el producto WhatsApp.
3. WhatsApp → API Setup: registrar el número de teléfono oficial de la firma → copiar `Phone number ID` y `WhatsApp Business Account ID` → `.env`.
4. Generar un token de acceso permanente (System User con rol de administrador, no el token temporal de prueba) → `WHATSAPP_ACCESS_TOKEN`.
5. Configuration → Webhooks: URL `https://<tu-dominio>/.netlify/functions/webhooks-whatsapp`, Verify token = valor que definas en `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; suscribirse a `messages`.
6. App Settings → Basic: copiar `App Secret` → `WHATSAPP_APP_SECRET` (se usa para verificar la firma `X-Hub-Signature-256` de cada webhook).
7. Enviar las plantillas de mensaje (saludo inicial, confirmación de recepción) a revisión de Meta — solo plantillas aprobadas pueden iniciar conversación fuera de la ventana de 24h.

## 6. WordPress
1. En el sitio de WordPress, crear un formulario (Contact Form 7, WPForms o el que use el sitio) con los mismos campos del CRM.
2. Agregar un webhook/acción tras el envío que haga `POST` a `https://<tu-dominio>/.netlify/functions/webhooks-wordpress`, firmando el payload con HMAC-SHA256 usando `WORDPRESS_WEBHOOK_SHARED_SECRET` en un header `X-Signature`.
3. Verifica en el CRM (bandeja "Nuevos leads por asignar") que un envío de prueba llega, se asigna a Bayron y genera la notificación.
4. Repetir para cada sitio/formulario adicional que deba integrarse.

## Checklist final antes de producción
- [ ] Los 4 usuarios accedieron con su correo real y cambiaron la contraseña temporal.
- [ ] RLS activo y probado en Supabase para los 4 roles.
- [ ] Variables de entorno reales cargadas en Netlify (ninguna en el repo).
- [ ] Webhook de WordPress probado con un envío real.
- [ ] Webhook de WhatsApp verificado y plantillas aprobadas por Meta.
- [ ] Al menos un buzón de correo conectado por OAuth y probado (enviar/recibir, incluyendo un adjunto en cada dirección).
- [ ] Escaneo antivirus de adjuntos implementado (ver paso 3, punto 5) antes de recibir adjuntos de remitentes desconocidos en producción.
- [ ] Backups automáticos de Supabase activados y restauración probada una vez.
- [ ] Dominio propio con HTTPS activo en Netlify.
