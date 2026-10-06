/**
 * Validación de la calidad de los secretos de servidor.
 *
 * La longitud mínima no basta: los placeholders de `.env.example`
 * ("cambia-esto-por-una-cadena-larga-y-aleatoria") tienen 44 caracteres y
 * pasaban el mínimo de 32. Quien copie el ejemplo y olvide una línea se queda
 * con un `SESSION_SECRET` **público**, con el que se puede forjar la cookie de
 * administración sin PIN ni código TOTP.
 *
 * Estas comprobaciones sólo se aplican en producción; en desarrollo los módulos
 * siguen usando sus valores de relleno.
 */

/**
 * ¿Se permiten los atajos de desarrollo (secretos de relleno públicos y 2FA
 * omitido)? Hace falta pedirlo a mano con ALLOW_INSECURE_DEV=1. Antes bastaba
 * con que NODE_ENV no fuera "production", de modo que un despliegue de staging o
 * autoalojado con NODE_ENV mal puesto arrancaba con una clave de sesión pública
 * —y por tanto con la cookie de admin falsificable— y sin segundo factor.
 */
export const DEV_INSEGURO =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_INSECURE_DEV === "1";

/** Mensaje común cuando falta un secreto y no se permiten los atajos. */
export function faltaSecreto(nombre: string): string {
  return `${nombre} no está configurado. Defínelo, o usa ALLOW_INSECURE_DEV=1 en desarrollo.`;
}

/** Valores de ejemplo y de relleno que nunca deben llegar a producción. */
const EJEMPLO = /cambia-esto|changeme|change-me|placeholder|ejemplo|example|dev-only|desarrollo|insegur|todo|xxxx/i;

/** Los tres secretos HMAC deben ser distintos entre sí. */
const HERMANOS: Record<string, string[]> = {
  SESSION_SECRET: ["APUESTA_SECRET", "INVITE_SECRET"],
  APUESTA_SECRET: ["SESSION_SECRET", "INVITE_SECRET"],
  INVITE_SECRET: ["SESSION_SECRET", "APUESTA_SECRET"],
};

export interface OpcionesSecreto {
  /** Longitud mínima exigida. */
  min: number;
  /**
   * Exigir variedad de caracteres (≥ 8 distintos). Para claves HMAC, que deben
   * ser aleatorias. No se aplica al PIN, que lo elige una persona.
   */
  exigirVariedad?: boolean;
}

/**
 * Devuelve el motivo por el que un secreto es inaceptable en producción, o
 * `null` si es válido. No incluye el valor en el mensaje.
 */
export function motivoSecretoDebil(
  nombre: string,
  valor: string,
  { min, exigirVariedad = true }: OpcionesSecreto,
): string | null {
  if (valor.length < min) {
    return `${nombre} debe tener al menos ${min} caracteres en producción.`;
  }
  if (EJEMPLO.test(valor)) {
    return `${nombre} parece el valor de ejemplo de .env.example: genera uno aleatorio.`;
  }
  if (exigirVariedad && new Set(valor).size < 8) {
    return `${nombre} tiene muy poca variedad de caracteres: genera uno aleatorio.`;
  }
  for (const otro of HERMANOS[nombre] ?? []) {
    if (process.env[otro] === valor) {
      return `${nombre} y ${otro} deben ser secretos distintos.`;
    }
  }
  return null;
}
