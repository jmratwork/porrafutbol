import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { COOKIE_SESION, sesionValida } from "./session";

/**
 * Autenticación del panel de administración con DOBLE FACTOR:
 *   1. PIN (algo que sabes)          → variable de entorno ADMIN_PIN.
 *   2. Código TOTP (algo que tienes) → ver lib/totp.ts.
 *
 * Superados ambos en /api/admin/login se emite una cookie de sesión firmada
 * (lib/session.ts). Las rutas protegidas ya NO reciben el PIN en cada petición:
 * validan esa cookie con `tieneSesionAdmin()`.
 */

// Longitud mínima exigida al ADMIN_PIN en producción.
export const MIN_ADMIN_PIN = 12;

export class AdminAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

/** ADMIN_PIN configurado y bien formado; lanza AdminAuthError(500) si no. */
function pinEsperado(): string {
  const pin = process.env.ADMIN_PIN;
  if (!pin || pin.length === 0) {
    throw new AdminAuthError(500, "ADMIN_PIN no está configurado en el servidor.");
  }
  if (process.env.NODE_ENV === "production" && pin.length < MIN_ADMIN_PIN) {
    throw new AdminAuthError(
      500,
      `ADMIN_PIN debe tener al menos ${MIN_ADMIN_PIN} caracteres en producción.`,
    );
  }
  return pin;
}

/** Primer factor: ¿el PIN recibido es correcto? (comparación en tiempo constante). */
export function pinCorrecto(pin: unknown): boolean {
  if (typeof pin !== "string" || pin.length === 0) return false;
  const a = Buffer.from(pin);
  const b = Buffer.from(pinEsperado());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** ¿La petición trae una cookie de sesión de administración válida y no caducada? */
export function tieneSesionAdmin(req: NextRequest): boolean {
  return sesionValida(req.cookies.get(COOKIE_SESION)?.value);
}
