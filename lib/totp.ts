import { verifySync } from "otplib";
import { AdminAuthError } from "./auth";

/**
 * Segundo factor de autenticación: código TOTP de una app de autenticación
 * (Google Authenticator, Authy, 1Password…).
 *
 * El secreto compartido vive en la variable de entorno TOTP_SECRET (base32),
 * estable entre instancias serverless. El enrolamiento se hace una vez con
 * `npm run totp:setup`.
 *
 * - En producción TOTP_SECRET es OBLIGATORIO.
 * - En desarrollo, si no está configurado, se OMITE el segundo factor (con un
 *   aviso) para no bloquear el arranque local; el PIN sigue siendo obligatorio.
 *
 * La verificación (constante en tiempo) es sólo criptográfica; el anti-replay
 * (que un código no se use dos veces) vive en `lib/rateLimit.ts` para funcionar
 * entre instancias, usando el `timeStep` que devuelve la propia verificación.
 */

const PERIODO_S = 30;
// Tolerancia de ±1 paso (±30 s) para el desfase de reloj del móvil.
const TOLERANCIA_S = 30;

export function totpConfigurado(): boolean {
  return !!process.env.TOTP_SECRET;
}

/** ¿Se exige el segundo factor? Siempre en producción; en dev sólo si hay secreto. */
export function totpRequerido(): boolean {
  return totpConfigurado() || process.env.NODE_ENV === "production";
}

export interface ResultadoTotp {
  /** El código es válido criptográficamente (o el 2FA está desactivado en dev). */
  valido: boolean;
  /** Paso de tiempo TOTP (`timeStep`) del código, para el anti-replay, o null. */
  paso: number | null;
}

/**
 * Comprueba un código TOTP de 6 dígitos contra TOTP_SECRET (sin anti-replay).
 * Lanza AdminAuthError(500) si falta el secreto —o si no cumple el mínimo de
 * 128 bits que exige otplib— en producción.
 */
export function comprobarTotp(code: string): ResultadoTotp {
  const secreto = process.env.TOTP_SECRET;

  if (!secreto) {
    if (process.env.NODE_ENV === "production") {
      throw new AdminAuthError(500, "TOTP_SECRET no está configurado en el servidor.");
    }
    console.warn(
      "[totp] TOTP_SECRET no configurado: se omite el segundo factor (sólo en desarrollo).",
    );
    return { valido: true, paso: null };
  }

  const limpio = (code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(limpio)) return { valido: false, paso: null };

  let resultado;
  try {
    resultado = verifySync({
      secret: secreto,
      token: limpio,
      period: PERIODO_S,
      epochTolerance: TOLERANCIA_S,
    });
  } catch (e) {
    // Un TOTP_SECRET que no cumple el mínimo de 128 bits (p. ej. uno generado
    // con la versión anterior) hace que otplib lance aquí: hay que regenerarlo.
    if (e instanceof Error && e.name.startsWith("Secret")) {
      throw new AdminAuthError(
        500,
        "TOTP_SECRET no es válido. Regenera el segundo factor con: npm run totp:setup.",
      );
    }
    throw e;
  }

  if (!resultado.valid) return { valido: false, paso: null };
  // `verifySync` devuelve el tipo unión TOTP|HOTP; el `timeStep` (paso de tiempo,
  // para el anti-replay) sólo está en la variante TOTP, que es la que usamos.
  const paso = "timeStep" in resultado ? resultado.timeStep : null;
  return { valido: true, paso };
}
