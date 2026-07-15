import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Código secreto por apuesta: permite a su dueño editarla o borrarla sin cuentas.
 *
 * - Se genera en el servidor y se muestra UNA sola vez al apostar.
 * - En la base de datos sólo se guarda su HMAC-SHA256 (nunca el código en claro).
 */

// Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L) para dictar/copiar sin errores.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LONGITUD = 6;

/** Genera un código aleatorio legible, p. ej. "K7M2QP". */
export function generarCodigo(): string {
  let codigo = "";
  for (let i = 0; i < LONGITUD; i++) {
    codigo += ALFABETO[randomInt(ALFABETO.length)];
  }
  return codigo;
}

/**
 * Secreto del servidor (pepper) para el HMAC de los códigos. Es OBLIGATORIO en
 * producción: si falta, se aborta en vez de degradar a un valor público (que
 * permitiría falsificar códigos con un volcado de la BD). En desarrollo se
 * permite un valor de relleno para no entorpecer las pruebas locales.
 */
function secreto(): string {
  const s = process.env.APUESTA_SECRET;
  if (s && s.length > 0) {
    // Un pepper corto permitiría falsificar códigos con un volcado de la BD:
    // exigimos un mínimo razonable en producción (≥ 32 caracteres).
    if (process.env.NODE_ENV === "production" && s.length < 32) {
      throw new Error("APUESTA_SECRET debe tener al menos 32 caracteres en producción.");
    }
    return s;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APUESTA_SECRET no está configurado. Define un valor largo y aleatorio en el entorno.",
    );
  }
  return "dev-only-no-usar-en-produccion";
}

/** Normaliza un código tal y como lo escribe el usuario (mayúsculas, sin espacios). */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

/** Calcula el hash que se almacena en la base de datos. */
export function hashCodigo(codigo: string): string {
  return createHmac("sha256", secreto()).update(normalizarCodigo(codigo)).digest("hex");
}

/** Comparación en tiempo constante entre un código recibido y el hash guardado. */
export function compararCodigo(codigo: string, hash: string): boolean {
  if (!codigo || !hash) return false;
  const calculado = Buffer.from(hashCodigo(codigo));
  const guardado = Buffer.from(hash);
  if (calculado.length !== guardado.length) return false;
  return timingSafeEqual(calculado, guardado);
}
