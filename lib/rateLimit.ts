/**
 * Freno anti-fuerza-bruta para los endpoints que validan PIN o código de apuesta.
 * Sólo cuenta INTENTOS FALLIDOS por clave (normalmente la IP); el uso legítimo no
 * se penaliza y al validar correctamente se limpia el contador.
 *
 * Dos modos, elegidos automáticamente:
 *  - PERSISTENTE: si hay un store KV configurado (Vercel KV / Upstash Redis vía sus
 *    variables de entorno), el contador es compartido entre instancias serverless.
 *  - EN MEMORIA (respaldo): si no hay store —o si el store falla— se usa un Map local
 *    por instancia. Funciona "out of the box" pero no resiste cold starts ni ataques
 *    distribuidos; es un apaño hasta conectar el KV.
 */

const VENTANA_S = 15 * 60; // 15 minutos
const MAX_FALLOS = 10;

// --- IP del cliente -------------------------------------------------------

export function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "desconocida";
}

// --- Almacén KV opcional (Upstash Redis REST / Vercel KV) -----------------

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** Ejecuta un único comando contra la API REST de Upstash/Vercel KV. */
async function kvCmd(
  cfg: { url: string; token: string },
  comando: (string | number)[],
): Promise<unknown> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(comando),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV respondió ${res.status}`);
  const data = (await res.json()) as { result?: unknown };
  return data.result ?? null;
}

const clave = (k: string) => `rl:${k}`;

// --- Respaldo en memoria --------------------------------------------------

const memoria = new Map<string, { count: number; resetAt: number }>();

function memOk(k: string): boolean {
  const e = memoria.get(k);
  if (!e) return true;
  if (Date.now() > e.resetAt) {
    memoria.delete(k);
    return true;
  }
  return e.count < MAX_FALLOS;
}

function memFallo(k: string): void {
  const ahora = Date.now();
  const e = memoria.get(k);
  if (!e || ahora > e.resetAt) {
    memoria.set(k, { count: 1, resetAt: ahora + VENTANA_S * 1000 });
    return;
  }
  e.count++;
}

// --- API pública (async) --------------------------------------------------

/** ¿Está la clave por debajo del umbral de fallos? (true = puede continuar). */
export async function rateLimitOk(k: string): Promise<boolean> {
  const cfg = kvConfig();
  if (!cfg) return memOk(k);
  try {
    const n = await kvCmd(cfg, ["GET", clave(k)]);
    const count = n ? Number(n) : 0;
    return count < MAX_FALLOS;
  } catch {
    // Si el KV falla, no bloqueamos por un problema de infraestructura.
    return memOk(k);
  }
}

/** Registra un intento fallido para la clave. */
export async function registrarFallo(k: string): Promise<void> {
  const cfg = kvConfig();
  if (!cfg) {
    memFallo(k);
    return;
  }
  try {
    const n = await kvCmd(cfg, ["INCR", clave(k)]);
    // Al primer fallo, fijamos la caducidad de la ventana.
    if (Number(n) === 1) await kvCmd(cfg, ["EXPIRE", clave(k), VENTANA_S]);
  } catch {
    memFallo(k);
  }
}

/** Limpia los fallos de la clave (tras una validación correcta). */
export async function limpiarFallos(k: string): Promise<void> {
  const cfg = kvConfig();
  if (!cfg) {
    memoria.delete(k);
    return;
  }
  try {
    await kvCmd(cfg, ["DEL", clave(k)]);
  } catch {
    memoria.delete(k);
  }
}
