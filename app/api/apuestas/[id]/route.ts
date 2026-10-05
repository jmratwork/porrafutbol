import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { admiteApuestas, obtenerEstadoActual } from "@/lib/estado";
import { validarGoles } from "@/lib/validation";
import { compararCodigo } from "@/lib/codigo";
import { tieneSesionAdmin } from "@/lib/auth";
import {
  claveIp,
  devolverIntento,
  ipDe,
  limpiarFallos,
  rateLimitConsumir,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Extrae el código de la apuesta de la cabecera o del cuerpo. */
function extraerCodigo(req: Request, body?: Record<string, unknown>): string | null {
  const header = req.headers.get("x-apuesta-codigo");
  if (header) return header;
  if (body && typeof body.codigo === "string") return body.codigo;
  return null;
}

/**
 * Reserva un intento de adivinar el código de una apuesta.
 *
 * El código tiene ~30 bits, así que el freno es la única defensa. Tres detalles
 * importan:
 *  - Se CONSUME el intento de forma atómica antes de comparar: con
 *    "comprobar y luego registrar" una ráfaga concurrente pasaba entera.
 *  - Se cuenta también por apuesta objetivo: los ids son públicos, y sin esto
 *    bastaba con rotar de víctima.
 *  - Un acierto limpia el contador de ESA apuesta y devuelve el intento de la
 *    IP, pero nunca vacía el contador de la IP: al vaciarlo, quien tuviera un
 *    código válido reseteaba el freno a voluntad intercalando una petición
 *    legítima. Devolver sólo su propio intento deja intacto el coste de cada
 *    fallo y, a la vez, no penaliza a quien usa la aplicación de verdad.
 */
async function reservarIntento(ip: string, id: string): Promise<boolean> {
  const porIp = await rateLimitConsumir(`codigo:${claveIp(ip)}`);
  const porApuesta = await rateLimitConsumir(`apuesta:${id}`);
  return porIp && porApuesta;
}

/** Tras un acierto: libera el freno de esa apuesta y devuelve el intento de la IP. */
async function aciertoVerificado(ip: string, id: string): Promise<void> {
  await limpiarFallos(`apuesta:${id}`);
  await devolverIntento(`codigo:${claveIp(ip)}`);
}

/**
 * PATCH /api/apuestas/[id] → editar el marcador de una apuesta propia.
 * Requiere el código secreto de la apuesta. Sólo mientras la porra esté ABIERTA.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  const ip = ipDe(req);
  if (!(await reservarIntento(ip, id))) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 },
    );
  }

  const apuesta = await prisma.apuesta.findUnique({
    where: { id },
    include: { porra: true },
  });
  if (!apuesta) {
    return NextResponse.json({ error: "La apuesta no existe." }, { status: 404 });
  }

  const codigo = extraerCodigo(req, body);
  if (!codigo || !compararCodigo(codigo, apuesta.codigoHash)) {
    return NextResponse.json({ error: "Código incorrecto." }, { status: 401 });
  }
  await aciertoVerificado(ip, id);

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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  const ip = ipDe(req);
  // El rescate del admin va autenticado por cookie, así que no consume cuota:
  // de lo contrario, la fuerza bruta de un tercero podría dejar al organizador
  // sin poder borrar nada.
  const esAdmin = tieneSesionAdmin(req);
  if (!esAdmin && !(await reservarIntento(ip, id))) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 },
    );
  }

  const apuesta = await prisma.apuesta.findUnique({
    where: { id },
    include: { porra: true },
  });
  if (!apuesta) {
    return NextResponse.json({ error: "La apuesta no existe." }, { status: 404 });
  }

  const codigo = extraerCodigo(req, body);
  const esDueno = !!codigo && compararCodigo(codigo, apuesta.codigoHash);

  if (!esDueno && !esAdmin) {
    return NextResponse.json({ error: "Código incorrecto." }, { status: 401 });
  }
  if (esDueno) await aciertoVerificado(ip, id);

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
