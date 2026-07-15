import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Invitación firmada por el organizador (admin) para autorizar una apuesta con
 * un nombre concreto en la porra activa.
 *
 * - La firma se calcula SIEMPRE en el servidor (HMAC-SHA256 sobre
 *   `porraId:nombreNormalizado`); el cliente nunca ve el secreto.
 * - Va ligada a `(porraId, nombreNormalizado)`: sólo sirve para ese nombre y
 *   esa porra. Reiniciar crea una porra con otro id, lo que invalida por sí
 *   solo las invitaciones anteriores.
 * - No hay estado "usada": la unicidad de nombre por porra ya hace que cada
 *   invitación sirva una sola vez.
 */

/**
 * Secreto del servidor para firmar invitaciones. OBLIGATORIO en producción: si
 * falta, se aborta en vez de degradar a un valor público (que permitiría
 * falsificar invitaciones). En desarrollo se permite un valor de relleno.
 * Es un secreto DISTINTO de APUESTA_SECRET.
 */
function secreto(): string {
  const s = process.env.INVITE_SECRET;
  if (s && s.length > 0) {
    // Una clave HMAC corta permitiría falsificar invitaciones: exigimos un
    // mínimo razonable en producción (≥ 32 caracteres).
    if (process.env.NODE_ENV === "production" && s.length < 32) {
      throw new Error("INVITE_SECRET debe tener al menos 32 caracteres en producción.");
    }
    return s;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "INVITE_SECRET no está configurado. Define un valor largo y aleatorio en el entorno.",
    );
  }
  return "dev-only-no-usar-en-produccion";
}

/**
 * Firma una invitación para (porraId, nombreNormalizado). El nombre debe venir
 * ya pasado por `normalizarNombre` para que emisión y verificación coincidan.
 */
export function firmarInvitacion(porraId: string, nombreNormalizado: string): string {
  return createHmac("sha256", secreto())
    .update(`${porraId}:${nombreNormalizado}`)
    .digest("base64url");
}

/** Verifica una firma en tiempo constante. Devuelve false si la firma es vacía. */
export function invitacionValida(
  porraId: string,
  nombreNormalizado: string,
  firma: string,
): boolean {
  if (!firma) return false;
  const esperada = Buffer.from(firmarInvitacion(porraId, nombreNormalizado));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length) return false;
  return timingSafeEqual(esperada, recibida);
}
