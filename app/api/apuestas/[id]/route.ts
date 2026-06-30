import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { admiteApuestas, obtenerEstadoActual } from "@/lib/estado";
import { validarGoles } from "@/lib/validation";
import { compararCodigo } from "@/lib/codigo";
import { extraerPin, pinValido } from "@/lib/auth";
import { ipDe, limpiarFallos, rateLimitOk, registrarFallo } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Extrae el código de la apuesta de la cabecera o del cuerpo. */
function extraerCodigo(req: Request, body?: Record<string, unknown>): string | null {
  const header = req.headers.get("x-apuesta-codigo");
  if (header) return header;
  if (body && typeof body.codigo === "string") return body.codigo;
  return null;
}

/**
 * PATCH /api/apuestas/[id] → editar el marcador de una apuesta propia.
 * Requiere el código secreto de la apuesta. Sólo mientras la porra esté ABIERTA.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  const ip = ipDe(req);
  if (!rateLimitOk(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 },
    );
  }

  const apuesta = await prisma.apuesta.findUnique({
    where: { id: params.id },
    include: { porra: true },
  });
  if (!apuesta) {
    return NextResponse.json({ error: "La apuesta no existe." }, { status: 404 });
  }

  const codigo = extraerCodigo(req, body);
  if (!codigo || !compararCodigo(codigo, apuesta.codigoHash)) {
    registrarFallo(ip);
    return NextResponse.json({ error: "Código incorrecto." }, { status: 401 });
  }
  limpiarFallos(ip);

  if (!admiteApuestas(apuesta.porra)) {
    return NextResponse.json(
      { error: "La porra ya no admite cambios (cerrada o el partido ya ha comenzado)." },
      { status: 409 },
    );
  }

  const vLocal = validarGoles(body.golesLocal, "el equipo local");
  if (!vLocal.ok || vLocal.data === undefined) {
    return NextResponse.json({ error: vLocal.error }, { status: 400 });
  }
  const vVis = validarGoles(body.golesVisitante, "el equipo visitante");
  if (!vVis.ok || vVis.data === undefined) {
    return NextResponse.json({ error: vVis.error }, { status: 400 });
  }

  try {
    await prisma.apuesta.update({
      where: { id: apuesta.id },
      data: { golesLocal: vLocal.data, golesVisitante: vVis.data },
    });
  } catch (e) {
    console.error("PATCH /api/apuestas/[id]", e);
    return NextResponse.json({ error: "No se pudo actualizar la apuesta." }, { status: 500 });
  }

  const estado = await obtenerEstadoActual();
  return NextResponse.json(estado);
}

/**
 * DELETE /api/apuestas/[id] → borrar una apuesta.
 * Autoriza si llega el código secreto correcto (su dueño) O un PIN de admin
 * válido (rescate). El dueño sólo puede borrar mientras la porra esté ABIERTA;
 * el admin también con la porra CERRADA, pero nunca una vez FINALIZADA.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  const ip = ipDe(req);
  if (!rateLimitOk(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 },
    );
  }

  const apuesta = await prisma.apuesta.findUnique({
    where: { id: params.id },
    include: { porra: true },
  });
  if (!apuesta) {
    return NextResponse.json({ error: "La apuesta no existe." }, { status: 404 });
  }

  const codigo = extraerCodigo(req, body);
  const esDueno = !!codigo && compararCodigo(codigo, apuesta.codigoHash);
  const esAdmin = pinValido(extraerPin(req));

  if (!esDueno && !esAdmin) {
    registrarFallo(ip);
    return NextResponse.json({ error: "Código incorrecto." }, { status: 401 });
  }
  limpiarFallos(ip);

  if (apuesta.porra.estado === "FINALIZADA") {
    return NextResponse.json(
      { error: "No se puede borrar una apuesta de una porra finalizada." },
      { status: 409 },
    );
  }
  // El dueño (sin ser admin) sólo puede borrar mientras siga admitiendo apuestas
  // (abierta y antes del inicio del partido).
  if (esDueno && !esAdmin && !admiteApuestas(apuesta.porra)) {
    return NextResponse.json(
      { error: "La porra ya no admite cambios (cerrada o el partido ya ha comenzado)." },
      { status: 409 },
    );
  }

  try {
    await prisma.apuesta.delete({ where: { id: apuesta.id } });
  } catch (e) {
    console.error("DELETE /api/apuestas/[id]", e);
    return NextResponse.json({ error: "No se pudo borrar la apuesta." }, { status: 500 });
  }

  const estado = await obtenerEstadoActual();
  return NextResponse.json(estado);
}
