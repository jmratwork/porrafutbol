import { timingSafeEqual } from "node:crypto";

/**
 * Comprueba el PIN de administración contra la variable de entorno ADMIN_PIN
 * usando comparación en tiempo constante (evita oráculos de temporización).
 */
export function pinValido(pinRecibido: string | null | undefined): boolean {
  const esperado = process.env.ADMIN_PIN;
  if (!esperado) {
    // Sin ADMIN_PIN configurado no se permite ninguna operación de admin.
    return false;
  }
  if (typeof pinRecibido !== "string" || pinRecibido.length === 0) {
    return false;
  }
  const a = Buffer.from(pinRecibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige misma longitud; la diferencia de longitud no se
  // compara byte a byte, pero el espacio de un PIN es acotado y aceptable.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Extrae el PIN de administración EXCLUSIVAMENTE de la cabecera "x-admin-pin".
 * No se acepta en el cuerpo para evitar que aparezca en logs de proxies.
 */
export function extraerPin(req: Request): string | null {
  return req.headers.get("x-admin-pin");
}
