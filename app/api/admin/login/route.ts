import { NextResponse, type NextRequest } from "next/server";
import { AdminAuthError, pinCorrecto } from "@/lib/auth";
import { cuerpoComoObjeto } from "@/lib/validation";
import { comprobarTotp, totpRequerido } from "@/lib/totp";
import { crearTokenSesion, COOKIE_SESION, TTL_SESION_MS } from "@/lib/session";
import { ipDe, limpiarFallos, pasoTotpYaUsado, rateLimitConsumir } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/login — cuerpo { pin, code }: los DOS factores a la vez.
 *
 * Se evalúan ambos y se responde un único error genérico. Antes el login iba en
 * dos pasos y respondía 200 { requiereCodigo: true } en cuanto el PIN era
 * correcto, además de distinguir "PIN incorrecto" de "código incorrecto": eso
 * convertía el primer factor en un oráculo y permitía atacarlos por separado.
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
    body = cuerpoComoObjeto(await req.json());
  } catch {
    body = {};
  }
  const pin = typeof body.pin === "string" ? body.pin : "";
  const code = typeof body.code === "string" ? body.code : "";

  try {
    // Se comprueban SIEMPRE los dos factores, sin cortocircuitar en el primero,
    // para no revelar cuál ha fallado.
    const pinOk = pinCorrecto(pin);
    const totp = totpRequerido() ? comprobarTotp(code) : { valido: true, paso: null };

    // El paso TOTP se reserva sólo si todo lo demás cuadra: así un atacante que
    // no sepa el PIN no puede quemar el código legítimo del organizador.
    const reutilizado =
      pinOk && totp.valido && totp.paso !== null ? await pasoTotpYaUsado(totp.paso) : false;

    if (!pinOk || !totp.valido || reutilizado) {
      return NextResponse.json({ error: "Credenciales incorrectas." }, { status: 401 });
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
