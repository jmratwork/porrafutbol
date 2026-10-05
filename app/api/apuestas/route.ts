import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoActual, obtenerPorraActiva } from "@/lib/estado";
import { normalizarNombre, validarGoles, validarNombre } from "@/lib/validation";
import { generarCodigo, hashCodigo } from "@/lib/codigo";
import { invitacionValida } from "@/lib/invitacion";
import { ipDe, limpiarFallos, rateLimitOk, registrarFallo } from "@/lib/rateLimit";
import { MAX_APOSTANTES } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/apuestas → crear una apuesta.
 * Valida: porra ABIERTA, < 20 apuestas, nombre no vacío y único en la porra,
 * goles 0–20 enteros. Genera un código secreto para que su dueño la gestione.
 * Devuelve 409 si la porra está completa/cerrada o el nombre ya existe.
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

  const porra = await obtenerPorraActiva();
  if (!porra) {
    return NextResponse.json(
      { error: "No hay ninguna porra activa todavía." },
      { status: 404 },
    );
  }

  if (porra.estado !== "ABIERTA") {
    return NextResponse.json(
      { error: "La porra no admite apuestas en este momento." },
      { status: 409 },
    );
  }

  if (new Date() >= porra.fechaPartido) {
    return NextResponse.json(
      { error: "El partido ya ha comenzado. Las apuestas están cerradas." },
      { status: 409 },
    );
  }

  if (porra.apuestas.length >= MAX_APOSTANTES) {
    return NextResponse.json({ error: "Porra completa." }, { status: 409 });
  }

  const vNombre = validarNombre(body.nombre);
  if (!vNombre.ok || vNombre.data === undefined) {
    return NextResponse.json({ error: vNombre.error }, { status: 400 });
  }

  const vLocal = validarGoles(body.golesLocal, "el equipo local");
  if (!vLocal.ok || vLocal.data === undefined) {
    return NextResponse.json({ error: vLocal.error }, { status: 400 });
  }

  const vVis = validarGoles(body.golesVisitante, "el equipo visitante");
  if (!vVis.ok || vVis.data === undefined) {
    return NextResponse.json({ error: vVis.error }, { status: 400 });
  }

  const nombreNormalizado = normalizarNombre(vNombre.data);

  // Autorización: sólo se puede apostar con una invitación firmada por el admin
  // para ese nombre exacto en esta porra. Las guardas de estado (porra ABIERTA
  // y partido no comenzado) ya se han comprobado antes, así que la invitación
  // caduca sola al cerrar la porra o al empezar el partido.
  if (!invitacionValida(porra.id, nombreNormalizado, String(body.inv ?? ""))) {
    await registrarFallo(ip);
    return NextResponse.json(
      { error: "Invitación no válida para ese nombre." },
      { status: 403 },
    );
  }

  try {
    // La generación del código va dentro del try: si falta APUESTA_SECRET en
    // producción, hashCodigo() lanza y debe devolverse un 500 JSON claro (no
    // una página de error que el cliente interpretaría como "Error de red").
    const codigo = generarCodigo();
    const codigoHash = hashCodigo(codigo);

    // Re-comprobación del límite, el estado y la unicidad dentro de una
    // transacción SERIALIZABLE. El nivel importa: con el aislamiento por
    // defecto (READ COMMITTED) dos envíos simultáneos con nombres distintos
    // leen ambos el mismo `count` y ambos insertan, de modo que el tope de 20
    // se puede superar (el índice único sólo evita nombres repetidos, no limita
    // el número de filas). En SERIALIZABLE, Postgres detecta el conflicto entre
    // la lectura del recuento y la inserción ajena y aborta una (P2034).
    const apuestaId = await prisma.$transaction(
      async (tx) => {
      const count = await tx.apuesta.count({ where: { porraId: porra.id } });
      if (count >= MAX_APOSTANTES) {
        throw new Error("PORRA_COMPLETA");
      }
      const actual = await tx.porra.findUnique({ where: { id: porra.id } });
      if (!actual || actual.estado !== "ABIERTA") {
        throw new Error("PORRA_NO_ABIERTA");
      }
      if (new Date() >= actual.fechaPartido) {
        throw new Error("PARTIDO_COMENZADO");
      }
      const duplicada = await tx.apuesta.findFirst({
        where: { porraId: porra.id, nombreNormalizado },
        select: { id: true },
      });
      if (duplicada) {
        throw new Error("NOMBRE_DUPLICADO");
      }
      const creada = await tx.apuesta.create({
        data: {
          porraId: porra.id,
          nombre: vNombre.data!,
          nombreNormalizado,
          codigoHash,
          golesLocal: vLocal.data!,
          golesVisitante: vVis.data!,
        },
        select: { id: true },
      });
      return creada.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await limpiarFallos(ip);
    const estado = await obtenerEstadoActual();
    return NextResponse.json({ estado, apuestaId, codigo }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "PORRA_COMPLETA") {
      return NextResponse.json({ error: "Porra completa." }, { status: 409 });
    }
    if (e instanceof Error && e.message === "PORRA_NO_ABIERTA") {
      return NextResponse.json(
        { error: "La porra no admite apuestas en este momento." },
        { status: 409 },
      );
    }
    if (e instanceof Error && e.message === "PARTIDO_COMENZADO") {
      return NextResponse.json(
        { error: "El partido ya ha comenzado. Las apuestas están cerradas." },
        { status: 409 },
      );
    }
    // Nombre duplicado: detectado por la pre-comprobación o por el índice único.
    if (
      (e instanceof Error && e.message === "NOMBRE_DUPLICADO") ||
      (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    ) {
      return NextResponse.json(
        { error: "Ya existe una apuesta con ese nombre. Elige otro." },
        { status: 409 },
      );
    }
    // Conflicto de serialización: otro envío simultáneo ganó la carrera. No es
    // un error del cliente, así que se le pide reintentar en vez de un 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return NextResponse.json(
        { error: "Varias apuestas llegaron a la vez. Vuelve a intentarlo." },
        { status: 409 },
      );
    }
    console.error("POST /api/apuestas", e);
    return NextResponse.json({ error: "No se pudo registrar la apuesta." }, { status: 500 });
  }
}
