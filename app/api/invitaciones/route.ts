import { NextResponse } from "next/server";
import { obtenerPorraActiva } from "@/lib/estado";
import { normalizarNombre, validarNombre } from "@/lib/validation";
import { extraerPin, pinValido } from "@/lib/auth";
import { firmarInvitacion } from "@/lib/invitacion";

export const dynamic = "force-dynamic";

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

  if (!pinValido(extraerPin(req))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const porra = await obtenerPorraActiva();
  if (!porra) {
    return NextResponse.json({ error: "No hay ninguna porra activa." }, { status: 404 });
  }

  const nombresRaw = Array.isArray(body.nombres) ? body.nombres : [];
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
