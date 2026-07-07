import { NextResponse } from "next/server";
import { admiteApuestas, obtenerPorraActiva } from "@/lib/estado";
import { normalizarNombre, validarNombre } from "@/lib/validation";
import { extraerPin, pinValido } from "@/lib/auth";
import { ipDe, limpiarFallos, rateLimitOk, registrarFallo } from "@/lib/rateLimit";
import { firmarInvitacion } from "@/lib/invitacion";
import { MAX_APOSTANTES } from "@/lib/types";

export const dynamic = "force-dynamic";

// Tope de nombres por petición (evita cuerpos gigantes aunque venga con PIN).
const MAX_NOMBRES = 100;

/**
 * POST /api/invitaciones → genera un enlace de invitación por nombre (requiere PIN).
 * Cuerpo `{ nombres: string[] }`. Cada enlace autoriza a apostar EXACTAMENTE con
 * ese nombre en la porra activa. Nunca se registran el secreto ni las firmas.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  const ip = ipDe(req);
  if (!(await rateLimitOk(ip))) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 },
    );
  }
  if (!pinValido(extraerPin(req))) {
    await registrarFallo(ip);
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  await limpiarFallos(ip);

  const porra = await obtenerPorraActiva();
  if (!porra) {
    return NextResponse.json({ error: "No hay ninguna porra activa." }, { status: 404 });
  }

  // No tiene sentido emitir invitaciones si la porra no puede recibir apuestas:
  // cerrada, finalizada o con el partido ya empezado (admiteApuestas), o llena
  // (aforo, que admiteApuestas no comprueba porque una porra con 20 apuestas
  // sigue en estado ABIERTA).
  if (!admiteApuestas(porra)) {
    return NextResponse.json(
      { error: "La porra no admite apuestas ahora mismo; no se generan invitaciones." },
      { status: 409 },
    );
  }
  if (porra.apuestas.length >= MAX_APOSTANTES) {
    return NextResponse.json(
      { error: "Porra completa: no quedan plazas para nuevas invitaciones." },
      { status: 409 },
    );
  }

  const nombresRaw = Array.isArray(body.nombres) ? body.nombres : [];
  if (nombresRaw.length > MAX_NOMBRES) {
    return NextResponse.json(
      { error: `Demasiados nombres (máximo ${MAX_NOMBRES}).` },
      { status: 400 },
    );
  }
  const vistos = new Set<string>();
  const invitaciones: { nombre: string; url: string }[] = [];

  for (const bruto of nombresRaw) {
    const v = validarNombre(bruto);
    if (!v.ok || v.data === undefined) continue;
    const nombreNormalizado = normalizarNombre(v.data);
    if (vistos.has(nombreNormalizado)) continue; // deduplica por nombre normalizado
    vistos.add(nombreNormalizado);
    const firma = firmarInvitacion(porra.id, nombreNormalizado);
    const url = `/?nombre=${encodeURIComponent(v.data)}&inv=${firma}`;
    invitaciones.push({ nombre: v.data, url });
  }

  if (invitaciones.length === 0) {
    return NextResponse.json({ error: "Ninguno de los nombres es válido." }, { status: 400 });
  }

  return NextResponse.json({ invitaciones });
}
