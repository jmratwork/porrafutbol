# ⚽ Porra de fútbol

Aplicación web para organizar una **porra** alrededor de un único partido de fútbol
(local vs visitante). Hasta **20 apostantes** pronostican el marcador exacto; el bote se
reparte entre quien acierta (o, si nadie acierta, entre los más cercanos).

Construida con **Next.js 14 (App Router) + TypeScript + Tailwind CSS** y persistencia con
**Prisma + PostgreSQL**. Lista para desplegar en **Vercel** sin pasos manuales de código.

---

## ✨ Funcionalidades

- Una porra activa a la vez con estados **ABIERTA → CERRADA → FINALIZADA**.
- Página pública `/`: cabecera tipo marcador, cuenta atrás, bote en vivo, formulario de
  apuesta, lista de apuestas y banner de ganadores.
- Panel `/admin` protegido por PIN: crear porra, abrir/cerrar apuestas, introducir el
  resultado real y reiniciar.
- Límite estricto de 20 apuestas (con control de concurrencia en base de datos).
- Cálculo de ganadores por acierto exacto o, en su defecto, por proximidad (distancia
  Manhattan), con reparto del bote a partes iguales en caso de empate.
- 100 % gratis: sólo dependencias open source y bases de datos con tier gratuito.

---

## 🧱 Requisitos

- Node.js 18.18+ (recomendado 20+).
- Una base de datos **PostgreSQL** (Vercel Postgres, Neon, Supabase o local).

---

## 🚀 Puesta en marcha (local)

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
ADMIN_PIN="1234"
```

- **`DATABASE_URL`**: cadena de conexión a tu Postgres.
- **`ADMIN_PIN`**: PIN secreto para el panel `/admin` y las mutaciones de la API.

### 3. Crear las tablas (migraciones de Prisma)

```bash
npx prisma generate       # genera el cliente (también lo hace el build)
npx prisma migrate deploy # aplica las migraciones incluidas a la base de datos
```

> Alternativa rápida sin historial de migraciones: `npx prisma db push`.

### 4. Arrancar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Ve a `/admin`, introduce el PIN y crea la porra.

---

## 🗄️ Crear una base de datos PostgreSQL gratis

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

## ☁️ Despliegue en Vercel

1. Sube el repositorio a GitHub/GitLab e impórtalo en [vercel.com](https://vercel.com).
2. En **Settings → Environment Variables** añade:
   - `DATABASE_URL` (si usas Vercel Postgres se añade sola al crear la base de datos).
   - `ADMIN_PIN`.
3. **Deploy.** No hace falta configurar nada más: Vercel detecta el script
   `vercel-build` del `package.json`, que ejecuta automáticamente
   `prisma generate && prisma migrate deploy && next build`. Es decir, **las tablas se
   crean solas** en la base de datos de producción en el primer despliegue.
4. Abre tu dominio de Vercel, entra en `/admin`, introduce el `ADMIN_PIN` y crea la porra.

> Si prefieres aplicar las migraciones manualmente, usa la `DATABASE_URL` de producción y
> ejecuta `npx prisma migrate deploy` desde tu máquina.

---

## 📡 API

| Método | Ruta            | Descripción                                            | PIN |
| ------ | --------------- | ------------------------------------------------------ | --- |
| GET    | `/api/porra`    | Estado actual: porra + apuestas + bote + ganadores.    | No  |
| POST   | `/api/porra`    | Crear la porra (equipos, fecha/hora, precio).          | Sí  |
| PATCH  | `/api/porra`    | `accion`: `ABRIR` \| `CERRAR` \| `FINALIZAR`.          | Sí  |
| DELETE | `/api/porra`    | Reiniciar (borra porra y apuestas).                    | Sí  |
| POST   | `/api/apuestas` | Crear una apuesta (nombre + marcador).                 | No  |

El PIN se envía en la cabecera `x-admin-pin` (o en el cuerpo como `pin`). Si es incorrecto,
la API responde **401**. Si la porra está completa o cerrada al apostar, responde **409**.

---

## 🏆 Cálculo del ganador (con ejemplos)

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

- Precio: 3 €. Apuestas (5): Ana `1-0` (d=2), Luis `3-1` (d=2), Eva `2-2` (d=3),
  Sara `2-0` (d=1), Tom `0-3` (d=5). Resultado real: **2-1**.
- Bote = 5 × 3 = **15 €**. Distancia mínima = 1 (Sara) → Sara gana **15,00 €**.
- Si Sara no existiera, empatarían Ana y Luis (d=2) → 15 / 2 = **7,50 € cada uno**.

La lógica está en [`lib/porra.ts`](lib/porra.ts).

---

## 📂 Estructura

```
app/
  api/
    porra/route.ts      # GET/POST/PATCH/DELETE de la porra
    apuestas/route.ts   # POST de apuestas
  page.tsx              # Home pública
  admin/page.tsx        # Panel de administración
  layout.tsx, globals.css
components/              # Marcador, Escudo, CuentaAtras, Toast
lib/
  prisma.ts             # Cliente Prisma
  porra.ts              # Cálculo de bote y ganadores
  estado.ts             # Construcción del estado actual (DTO)
  validation.ts         # Validaciones de entrada
  auth.ts               # Validación del PIN
  format.ts, types.ts
prisma/
  schema.prisma
  migrations/           # Migración inicial lista para `migrate deploy`
```

---

## 🧪 Verificar el build

```bash
npm run build
```

Compila el cliente de Prisma y la aplicación Next.js sin errores de tipos.

## Nota

Este README está escrito en español debido a los potenciales usuarios que tienen la aplicación.