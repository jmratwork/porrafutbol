import { NextResponse, type NextRequest } from "next/server";
import { AdminAuthError, pinCorrecto } from "@/lib/auth";
import { comprobarTotp, totpRequerido } from "@/lib/totp";
import { crearTokenSesion, COOKIE_SESION, TTL_SESION_MS } from "@/lib/session";
import { ipDe, limpiarFallos, pasoTotpYaUsado, rateLimitConsumir } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/login — login en DOS pasos (doble factor):
 *  - Paso 1: cuerpo { pin }. Verifica el PIN (primer factor).
 *      · PIN incorrecto → 401.
 *      · PIN correcto y hace falta 2FA → 200 { requiereCodigo: true }.
 *      · PIN correcto y NO hace falta 2FA (dev) → emite la cookie de sesión.
 *  - Paso 2: cuerpo { pin, code }. Verifica PIN + código TOTP y, si son
 *      correctos, emite la cookie de sesión (401 si el código es incorrecto).
 *
 * Limitado por IP (rate limiting) para frenar la fuerza bruta.
 */
export async function POST(req: NextRequest) {
  // Cada petición consume un intento de forma atómica (evita que una ráfaga
  // concurrente se salte el tope). Un login correcto limpia el contador.
  const clave = `login:${ipDe(req)}`;
  if (!(await rateLimitConsumir(clave))) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const pin = typeof body.pin === "string" ? body.pin : "";
  const code = typeof body.code === "string" ? body.code : "";

  try {
    // Primer factor.
    if (!pinCorrecto(pin)) {
      return NextResponse.json({ error: "PIN de administración incorrecto." }, { status: 401 });
    }

    // Segundo factor (si procede).
    if (totpRequerido()) {
      if (!code) {
        // Paso 1 superado: pedimos el código de verificación.
        return NextResponse.json({ requiereCodigo: true });
      }
      const totp = comprobarTotp(code);
      if (!totp.valido || (totp.paso !== null && (await pasoTotpYaUsado(totp.paso)))) {
        return NextResponse.json({ error: "Código de verificación incorrecto." }, { status: 401 });
      }
    }

    // Éxito: emite la cookie de sesión.
    await limpiarFallos(clave);
    const res = NextResponse.json({ autenticado: true });
    res.cookies.set(COOKIE_SESION, crearTokenSesion(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: Math.floor(TTL_SESION_MS / 1000),
    });
    return res;
  } catch (e) {
    // Un AdminAuthError indica una (mala) configuración del servidor. No revelamos
    // el detalle a un cliente sin autenticar (confirmaría el fallo a un sondeo
    // anónimo): lo registramos en el servidor y devolvemos un mensaje genérico.
    console.error("POST /api/admin/login", e);
    const status = e instanceof AdminAuthError ? e.status : 500;
    return NextResponse.json({ error: "Error interno del servidor." }, { status });
  }
}
