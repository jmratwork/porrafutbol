/**
 * Comprueba el PIN de administración contra la variable de entorno ADMIN_PIN.
 * El PIN puede llegar por la cabecera "x-admin-pin" o en el cuerpo de la petición.
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
  return pinRecibido === esperado;
}

/**
 * Extrae el PIN de una petición: primero de la cabecera, luego del cuerpo.
 */
export function extraerPin(req: Request, body?: Record<string, unknown>): string | null {
  const header = req.headers.get("x-admin-pin");
  if (header) return header;
  if (body && typeof body.pin === "string") return body.pin;
  return null;
}
