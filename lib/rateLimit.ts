/**
 * Limitador de tasa MUY básico en memoria, pensado como freno anti-fuerza-bruta
 * para los endpoints que validan PIN o código de apuesta.
 *
 * Sólo cuenta INTENTOS FALLIDOS por clave (normalmente la IP), de modo que el
 * uso legítimo no se penaliza. Al validar correctamente se limpia el contador.
 *
 * AVISO: en un entorno serverless (Vercel) el estado es por instancia y se
 * pierde en los "cold starts"; no resiste ataques distribuidos. Para protección
 * real usar un almacén compartido (Vercel KV / Upstash Redis).
 */

const VENTANA_MS = 15 * 60 * 1000; // 15 minutos
const MAX_FALLOS = 10;

const fallos = new Map<string, { count: number; resetAt: number }>();

/** IP del cliente a partir de las cabeceras habituales de proxy. */
export function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "desconocida";
}

/** ¿Está la clave por debajo del umbral de fallos? (true = puede continuar). */
export function rateLimitOk(clave: string): boolean {
  const e = fallos.get(clave);
  if (!e) return true;
  if (Date.now() > e.resetAt) {
    fallos.delete(clave);
    return true;
  }
  return e.count < MAX_FALLOS;
}

/** Registra un intento fallido para la clave. */
export function registrarFallo(clave: string): void {
  const ahora = Date.now();
  const e = fallos.get(clave);
  if (!e || ahora > e.resetAt) {
    fallos.set(clave, { count: 1, resetAt: ahora + VENTANA_MS });
    return;
  }
  e.count++;
}

/** Limpia los fallos de la clave (tras una validación correcta). */
export function limpiarFallos(clave: string): void {
  fallos.delete(clave);
}
