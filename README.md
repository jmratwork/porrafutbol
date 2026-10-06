# ⚽ Porra de fútbol

Aplicación Web para organizar una **porra** alrededor de un único partido de fútbol
(local vs visitante). Hasta **20 apostantes** pronostican el marcador exacto; el bote se
reparte entre quien acierta (o, si nadie acierta, entre los más cercanos).

Construida con **Next.js 15 (App Router) + TypeScript + Tailwind CSS** y persistencia con
**Prisma + PostgreSQL**. Lista para desplegar en **Vercel** sin pasos manuales de código.

<p align="center">
  <img src="demo.webp" width="440"
       alt="Demo: el organizador crea el partido, reparte invitaciones y cada persona apuesta con su enlace" />
</p>

---

## Funcionalidades

- Una porra activa a la vez con estados **ABIERTA → CERRADA → FINALIZADA**.
- Página pública `/`: cabecera tipo marcador, cuenta atrás, bote en vivo, formulario de
  apuesta, lista de apuestas y banner de ganadores.
- Panel `/admin` protegido con **doble factor** (PIN + código TOTP) y sesión por cookie:
  crear porra, generar invitaciones, cerrar apuestas (irreversible), introducir el resultado
  real y reiniciar.
- Límite estricto de 20 apuestas, garantizado con transacciones **serializables** (dos envíos
  simultáneos no pueden colarse en la última plaza).
- Cálculo de ganadores por acierto exacto o, en su defecto, por proximidad (distancia
  Manhattan), con reparto del bote a partes iguales en caso de empate.
- 100 % gratis: sólo dependencias open source y bases de datos con tier gratuito.

---

## Requisitos

- Node.js 18.18+ (recomendado 20+).
- Una base de datos **PostgreSQL** (Vercel Postgres, Neon, Supabase o local).

---

## Puesta en marcha (local)

### 1. Instalar dependencias

```bash
npm install
```

(El `postinstall` ejecuta `prisma generate` automáticamente.)

### 2. Configurar variables de entorno

Copia el ejemplo y rellena los valores:

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://usuario:password@host:5432/porra?sslmode=require"
ADMIN_PIN=""
SESSION_SECRET=""
TOTP_SECRET=""
APUESTA_SECRET=""
INVITE_SECRET=""
```

Los valores van **vacíos a propósito**: en producción el servidor **rechaza** cualquier
secreto que parezca un valor de ejemplo (`cambia-esto…`, `changeme`, `example`…), así que
copiar el fichero y olvidar una línea bloquea el arranque en vez de dejar una clave pública.

- **`DATABASE_URL`**: cadena de conexión a tu Postgres.
- **`ADMIN_PIN`**: **primer factor** del panel `/admin`. En producción debe tener
  **al menos 12 caracteres**; si es más corto, las acciones de admin se bloquean.
- **`SESSION_SECRET`**: firma la cookie de sesión del admin. **Obligatorio en producción**
  y con **al menos 32 caracteres** (una clave HMAC corta sería forzable offline).
- **`TOTP_SECRET`**: **segundo factor** (2FA) del admin, secreto TOTP en base32 de
  **128 bits como mínimo**. Genéralo con `npm run totp:setup`. **Obligatorio**, salvo que
  pidas los atajos de desarrollo (ver más abajo).
- **`APUESTA_SECRET`**: secreto para los códigos de cada apuesta. **Obligatorio en producción**
  y de **al menos 32 caracteres** (si falta, el servidor aborta en vez de usar un valor por
  defecto público).
- **`INVITE_SECRET`**: secreto para firmar las invitaciones (distinto de `APUESTA_SECRET`).
  **Obligatorio en producción**, mismo mínimo de 32 caracteres y mismo comportamiento de
  fallo si falta.

En producción, los tres secretos HMAC (`SESSION_SECRET`, `APUESTA_SECRET`, `INVITE_SECRET`)
se comprueban además por **variedad de caracteres** y han de ser **distintos entre sí**; si
alguno falla, el servidor aborta con un mensaje que dice cuál y por qué. La lógica está en
[`lib/secretos.ts`](lib/secretos.ts).

**Cómo generar los secretos.**

- **`ADMIN_PIN`**: lo eliges tú (lo tecleas al entrar en `/admin`). Una contraseña fuerte de
  **al menos 12 caracteres**; en producción, si es más corto, el admin queda bloqueado.
- **`SESSION_SECRET`, `APUESTA_SECRET` e `INVITE_SECRET`**: cadenas largas, aleatorias y
  **distintas entre sí**. Genera un valor nuevo para **cada una** con cualquiera de estos
  comandos (dan 64 caracteres hexadecimales, por encima del mínimo de 32):

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # con Node
  openssl rand -hex 32                                                       # o con OpenSSL
  ```

- **`TOTP_SECRET`**: ejecuta `npm run totp:setup`. Genera el secreto (base32 de 160 bits),
  muestra un **QR** para escanearlo con tu app de autenticación (Google Authenticator, Authy,
  1Password…) y te da el valor a pegar en la variable.

  > **Si vienes de una versión anterior a `otplib` 13**, tu `TOTP_SECRET` puede ser de 80 bits
  > y ya **no es válido**: vuelve a ejecutar `npm run totp:setup` y escanea el QR nuevo. Si no
  > lo haces, el login responde pidiendo justamente eso.

Pega cada valor tanto en el `.env` local como en las variables de entorno de Vercel.

**Atajos de desarrollo (`ALLOW_INSECURE_DEV`).** Si quieres arrancar en local sin generar
los secretos, pon `ALLOW_INSECURE_DEV="1"`: el servidor usará valores de relleno **públicos**
y omitirá el 2FA. Sin esa variable, falta un secreto y el arranque falla, que es lo que debe
pasar. **Nunca la pongas en producción ni en staging**: con ella la cookie de administración
es falsificable por cualquiera. Antes este atajo se activaba solo con que `NODE_ENV` no fuera
`production`, de modo que un despliegue mal configurado quedaba abierto sin avisar.

**Rate-limiting (recomendado en producción).** El freno anti-fuerza-bruta funciona sin
configurar nada, con un contador **en memoria por instancia** (10 fallos cada 15 min). Para el
login y para los códigos de apuesta se cuenta **por IP** (agrupando IPv6 por su `/64`, para que
rotar de dirección dentro del mismo prefijo no abra una ventana nueva) y, en los códigos,
**también por apuesta**: los ids son públicos, así que sin ese segundo contador bastaría con ir
cambiando de víctima. El intento se **reserva antes de comparar** —si no, una ráfaga simultánea
pasaba entera— y se **devuelve si el código era correcto**, de modo que el uso legítimo no gasta
cuota pero cada fallo sigue costando.

Conecta un almacén KV en Vercel (*Storage* → Upstash Redis / Vercel KV) para que el límite —y el
anti-replay de los códigos TOTP— se compartan entre instancias serverless: las variables
`KV_REST_API_URL` / `KV_REST_API_TOKEN` (o sus equivalentes `UPSTASH_REDIS_REST_*`) se inyectan
solas y la aplicación las usa automáticamente.

> **Sin KV, en serverless el freno es por instancia**: cada arranque en frío reinicia el
> contador y las instancias no se coordinan, de modo que el tope efectivo es mayor que 10 y un
> código TOTP podría reutilizarse en otra instancia. Si la porra es pública, conecta el KV.

### Doble factor (2FA) del panel de administración

El acceso a `/admin` está protegido con **dos factores**:

1. **PIN** (`ADMIN_PIN`) — algo que sabes.
2. **Código TOTP** de tu app de autenticación (`TOTP_SECRET`) — algo que tienes.

Los dos se piden **en la misma pantalla** y se envían juntos; al teclear el sexto dígito del
código se envía **solo**, sin pulsar nada (el botón sigue ahí como respaldo). Si algo falla,
la respuesta es un único *Credenciales incorrectas*: no se distingue qué factor ha fallado.
Antes el login iba en dos pasos y confirmaba el PIN antes de pedir el código, lo que permitía
atacar los factores por separado.

Superados ambos, el servidor emite una **cookie de sesión firmada** (`httpOnly`, `Secure`,
`SameSite=Strict`, **60 min**). A partir de ahí, las acciones del panel se autorizan con esa
cookie: el PIN ya **no** viaja en cada petición. Puedes cerrar sesión desde el propio panel.

Detalles del endurecimiento: cada intento de login **consume** su cuota de forma atómica
(una ráfaga concurrente no puede saltarse el tope), un código TOTP **no se puede reutilizar**
dentro de su ventana de validez y, ante un error de configuración del servidor, la respuesta
al cliente sin autenticar es **genérica** (el detalle sólo se registra en el log).

### 3. Crear las tablas (migraciones de Prisma)

```bash
npx prisma generate       # genera el cliente (también lo hace el build)
npx prisma migrate deploy # aplica las migraciones incluidas a la base de datos
```

> Alternativa rápida sin historial de migraciones, **sólo en desarrollo**:
> `npm run db:push`. El script se niega a ejecutarse si detecta `VERCEL` o
> `NODE_ENV=production`, porque `prisma db push` se salta el historial de
> migraciones y puede destruir datos. Para producción, `npm run db:migrate`.

### 4. Arrancar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Ve a `/admin` e inicia sesión con el PIN y
el código de tu app de autenticación; después crea la porra. Si has puesto
`ALLOW_INSECURE_DEV="1"` y no tienes `TOTP_SECRET`, basta con el PIN.

---

## Crear una base de datos PostgreSQL gratis

Cualquiera de estas opciones funciona; copia su cadena de conexión en `DATABASE_URL`.

- **Vercel Postgres**: en el dashboard de tu proyecto → *Storage* → *Create Database* →
  *Postgres*. Vercel inyecta `DATABASE_URL` (y `POSTGRES_*`) automáticamente como variable
  de entorno del proyecto.
- **Neon** ([neon.tech](https://neon.tech)): crea un proyecto y copia la *Connection string*
  (incluye `?sslmode=require`).
- **Supabase** ([supabase.com](https://supabase.com)): *Project Settings* → *Database* →
  *Connection string* (modo *URI*). Usa el puerto de *connection pooling* (6543) para
  entornos serverless si lo necesitas.

---

## Despliegue en Vercel

1. Sube el repositorio a GitHub/GitLab e impórtalo en [vercel.com](https://vercel.com).
2. En **Settings → Environment Variables** añade:
   - `DATABASE_URL` (si usas Vercel Postgres se añade sola al crear la base de datos).
   - `ADMIN_PIN` (mínimo 12 caracteres), `SESSION_SECRET`, `APUESTA_SECRET` e `INVITE_SECRET`
     (mínimo **32 caracteres** cada uno) y `TOTP_SECRET` (genéralo con `npm run totp:setup`)
     — **obligatorios en producción**, aleatorios y distintos entre sí. Los valores de ejemplo
     se rechazan: si dejas un `cambia-esto…`, el servidor aborta.
3. *(Recomendado)* En **Storage** conecta un **Upstash Redis / Vercel KV**: sin él, el
   rate-limiting y el anti-replay del TOTP son por instancia (ver *Rate-limiting* arriba).
4. **Deploy.** No hace falta configurar nada más: Vercel detecta el script
   `vercel-build` del `package.json`, que ejecuta automáticamente
   `prisma generate && prisma migrate deploy && next build`. Es decir, **las tablas se
   crean (y migran) solas** en producción en cada despliegue.
5. Abre tu dominio de Vercel, entra en `/admin`, **inicia sesión (PIN + código de tu app de
   autenticación)** y crea la porra.

> **Seguridad de las migraciones.** `prisma migrate deploy` sólo aplica migraciones ya
> commiteadas en `prisma/migrations/` (nunca genera cambios por su cuenta). Para que ese
> automatismo sea seguro: **revisa el SQL de cada migración en el PR antes de mergear**
> (especialmente operaciones destructivas como `DROP`/`TRUNCATE`) y mantén **PITR/copias**
> activadas en tu proveedor (Neon/Supabase/Vercel Postgres) por si hay que revertir.

> Si prefieres aplicar las migraciones manualmente, usa la `DATABASE_URL` de producción y
> ejecuta `npm run db:migrate` (= `prisma migrate deploy`) desde tu máquina.

---

## API

| Método | Ruta            | Descripción                                            | Auth |
| ------ | --------------- | ------------------------------------------------------ | ---- |
| POST   | `/api/admin/login`   | Login del admin: `{ pin, code }` en una sola petición → cookie de sesión. **401** genérico si falla cualquiera de los dos. | —    |
| POST   | `/api/admin/logout`  | Cierra la sesión (borra la cookie).                | Sesión |
| GET    | `/api/admin/session` | Estado de la sesión para la pantalla de login.     | —    |
| GET    | `/api/porra`    | Estado actual: porra + apuestas + bote + ganadores.    | No   |
| POST   | `/api/porra`    | Crear la porra (equipos, fecha/hora, precio); **409** si ya existe una (también si dos peticiones intentan crearla a la vez). | Sesión |
| PATCH  | `/api/porra`    | `accion`: `CERRAR` \| `FINALIZAR` (`ABRIR` ya no reabre; **409**). | Sesión |
| DELETE | `/api/porra`    | Reiniciar (borra porra y apuestas). Si el cuerpo trae la porra siguiente, se **valida antes** de borrar nada y ambas operaciones van en una transacción. | Sesión |
| POST   | `/api/invitaciones` | Generar enlaces de invitación (`{ nombres: string[] }`); **409** si la porra está cerrada, empezada o llena. | Sesión |
| POST   | `/api/apuestas` | Crear una apuesta (requiere **invitación** + marcador). Devuelve un código secreto; **409** si está completa, cerrada, el nombre ya existe o dos envíos chocaron. | Invitación |
| PATCH  | `/api/apuestas/:id` | Editar el marcador de una apuesta (requiere su código); **429** al agotar los intentos y **409** si la porra deja de admitir cambios. | Código |
| DELETE | `/api/apuestas/:id` | Borrar una apuesta (código de su dueño **o** sesión de admin); **409** si la porra ya no admite cambios —el admin sí puede con ella cerrada, nunca finalizada—. | Código/Sesión |

Las rutas marcadas **Sesión** exigen la cookie de administración emitida por `/api/admin/login`
tras el doble factor; sin ella responden **401**. Si la porra está completa o cerrada al apostar,
responde **409**.

**Valores aceptados** (todo lo que quede fuera responde **400**):

| Campo | Límite |
| --- | --- |
| `golesLocal`, `golesVisitante`, `resultadoLocal`, `resultadoVisitante` | entero de **0 a 20**. Como cadena, sólo dígitos: `""`, `" 5 "`, `"0x10"` y `"1e1"` se rechazan |
| `precio` | de **0,01 €** a **10 000 €**, dos decimales como máximo (se admite la coma: `"0,50"`) |
| `nombre`, `equipoLocal`, `equipoVisitante` | 1 a **40** caracteres (se recorta el espacio sobrante) |
| `fechaPartido` | `YYYY-MM-DDTHH:mm` interpretado como **hora de Barcelona**, o una cadena ISO con zona |
| `nombres` (invitaciones) | hasta **100** por petición, deduplicados |
| apuestas por porra | **20** como máximo |

**Cierre automático**: las apuestas se cierran solas al llegar la **hora de inicio del
partido**, aunque el organizador no la cierre a mano. A partir de ese momento la API
rechaza nuevas apuestas y ediciones (**409**) y la interfaz lo refleja al instante.

### Identidad de las apuestas: invitaciones firmadas

Apostar **no** es abierto: hace falta una **invitación** que el organizador reparte.

- **El admin genera un enlace por persona** (sección *Invitaciones* de `/admin`): un nombre
  por línea. Cada enlace (`/?nombre=…&inv=…`) autoriza a apostar **exactamente con ese
  nombre** en la porra activa. La firma (HMAC-SHA256) se calcula **siempre en el servidor**
  con `INVITE_SECRET`; el cliente nunca ve el secreto.
- **Solo con ese enlace se puede apostar** bajo ese nombre. Sin `inv` válido, el formulario
  no deja crear la apuesta y la API responde **403**. El nombre viene precargado y de solo
  lectura, así que nadie puede suplantar ni "okupar" el nombre de otra persona.
- **La invitación caduca sola**: su validez es exactamente la ventana en que la porra admite
  apuestas. Deja de valer **al empezar el partido** o **al cerrar la porra** el admin. Cerrar
  es **irreversible** (una porra cerrada no se reabre) e invalida todas las invitaciones.
- **Para empezar de nuevo** se **reinicia** la porra: nace con otro `id`, lo que por sí solo
  invalida las invitaciones anteriores, y se generan invitaciones nuevas.
- **Nombre único por porra**: además, no se admiten dos apuestas con el mismo nombre. Esto
  hace que cada invitación sirva **una sola vez** (no hace falta marcar "usada").
- **Código por apuesta**: al apostar, el servidor genera un código (p. ej. `K7M2QP`) que se
  muestra una sola vez y se guarda en el navegador. Permite **editar o borrar** esa apuesta
  mientras la porra siga abierta. En la base de datos sólo se almacena su hash.
- **Rescate del administrador**: desde `/admin` se puede borrar cualquier apuesta (útil si
  alguien pierde su código), salvo una vez finalizada la porra.

---

## Cálculo del ganador (con ejemplos)

Sea el **resultado real** `LR - VR` y cada apuesta `LA - VA`.

1. **Acierto exacto**: ganan quienes cumplen `LA == LR` **y** `VA == VR`. El bote se reparte a
   partes iguales entre ellos.
2. **Si nadie acierta**: gana quien minimiza la distancia
   `d = |LR - LA| + |VR - VA|`. Si varios empatan en la distancia mínima, se reparte el bote
   entre todos ellos.
3. El premio de cada ganador es `bote / nº de ganadores`, redondeado a 2 decimales.
   El bote es `nº de apuestas × precio`.

### Ejemplo 1 — acierto exacto

- Precio: 5 €. Apuestas (4): Ana `2-1`, Luis `1-1`, Eva `2-1`, Sara `0-0`.
- Bote = 4 × 5 = **20 €**. Resultado real: **2-1**.
- Aciertan Ana y Eva → premio = 20 / 2 = **10,00 € cada una**.

### Ejemplo 2 — nadie acierta, gana el más cercano

- Precio: 3 €. Apuestas (5): Ana `1-0` (d=2), Luis `3-2` (d=2), Eva `0-0` (d=3),
  Sara `2-0` (d=1), Nuria `0-3` (d=4). Resultado real: **2-1**.
- Bote = 5 × 3 = **15 €**. Distancia mínima = 1 (Sara) → Sara gana **15,00 €**.
- Si Sara hubiera apostado `3-0` (d=2), empatarían Ana, Luis y Sara → 15 / 3 =
  **5,00 € cada uno**.

La lógica está en [`lib/porra.ts`](lib/porra.ts).

---

## Estructura

```
app/
  api/
    porra/route.ts          # GET/POST/PATCH/DELETE de la porra
    apuestas/route.ts       # POST de apuestas (requiere invitación)
    apuestas/[id]/route.ts  # PATCH/DELETE de una apuesta (código o sesión)
    invitaciones/route.ts   # POST: genera enlaces de invitación (admin)
    admin/login/route.ts    # Login 2FA (PIN + TOTP) → cookie de sesión
    admin/logout/route.ts   # Cierre de sesión
    admin/session/route.ts  # Estado de la sesión (para la pantalla de login)
  page.tsx                  # Home pública
  admin/page.tsx            # Panel de administración
  layout.tsx, globals.css
middleware.ts               # CSP basada en nonce por petición
next.config.mjs             # Cabeceras estáticas (HSTS, COOP/CORP, no-store en /admin y /api…)
eslint.config.mjs           # ESLint 9 (flat) con las reglas de Next
components/                 # Marcador, Escudo, CuentaAtras, Toast
lib/
  prisma.ts                 # Cliente Prisma
  porra.ts                  # Cálculo de bote y ganadores
  estado.ts                 # Construcción del estado actual (DTO)
  validation.ts             # Validaciones de entrada
  auth.ts                   # Comprobación del PIN y de la sesión de admin
  session.ts                # Cookie de sesión firmada (HMAC, 60 min)
  totp.ts                   # Segundo factor: verificación del código TOTP
  secretos.ts               # Calidad de los secretos y atajos de desarrollo
  invitacion.ts             # Firma/verificación de invitaciones (HMAC)
  codigo.ts                 # Código secreto por apuesta (HMAC)
  rateLimit.ts              # Freno anti-fuerza-bruta (por IP y por apuesta) y anti-replay TOTP
  fecha.ts                  # Interpretación de la hora en Barcelona
  format.ts, types.ts
scripts/
  totp-setup.mjs            # Enrolamiento del 2FA (`npm run totp:setup`)
prisma/
  schema.prisma
  migrations/               # Migraciones listas para `migrate deploy`
.github/workflows/ci.yml    # Verificación automática en cada push y PR
```

---

## Verificar

```bash
npm run build          # cliente de Prisma + aplicación Next.js, con los tipos
npx tsc --noEmit       # sólo los tipos, más rápido
npm run lint           # ESLint con las reglas de Next
npm audit --omit=dev   # vulnerabilidades en las dependencias de producción
```

**En cada `push` y cada pull request** se ejecuta todo eso automáticamente
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): `npm ci` —que además
falla si el lockfile se desincroniza del `package.json`—, los tipos, el lint, el
build y `npm audit --omit=dev --audit-level=high`. Ninguno de los pasos necesita
base de datos: todas las rutas son dinámicas.

> El script `lint` invoca **`eslint` directamente**, no `next lint`: este último
> está deprecado y desaparece en Next 16. La configuración está en
> [`eslint.config.mjs`](eslint.config.mjs), en formato *flat* (el de ESLint 9),
> y adapta `eslint-config-next` con `FlatCompat` porque ese paquete todavía se
> publica en el formato antiguo.

> **Aviso sobre `npm audit`.** El árbol de **producción** está limpio; el de
> desarrollo arrastra un aviso HIGH de `braces` que **no tiene parche upstream**
> (3.0.3 es la última publicada). Llega por dos caminos —`tailwindcss` y
> `eslint-config-next`, ambos vía `micromatch`/`chokidar`—, así que **no se
> arregla cambiando una sola dependencia**. La exposición es mínima: las únicas
> entradas son tu propio `tailwind.config.ts` y los ficheros del repositorio, no
> datos de usuario. Se acepta de forma consciente, y por eso el CI comprueba
> `npm audit --omit=dev`, que sí debe estar en cero.

## Nota

Este README está escrito en español debido a los potenciales usuarios que tienen la aplicación.