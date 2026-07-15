import { NextResponse, type NextRequest } from "next/server";
import { AdminAuthError, pinCorrecto } from "@/lib/auth";
import { comprobarTotp, totpRequerido } from "@/lib/totp";
import { crearTokenSesion, COOKIE_SESION, TTL_SESION_MS } from "@/lib/session";
import { ipDe, limpiarFallos, pasoTotpYaUsado, rateLimitOk, registrarFallo } from "@/lib/rateLimit";

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
  const clave = `login:${ipDe(req)}`;
  if (!(await rateLimitOk(clave))) {
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
      await registrarFallo(clave);
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
        await registrarFallo(clave);
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
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/admin/login", e);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
