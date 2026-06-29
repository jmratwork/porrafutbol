import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoActual, obtenerPorraActiva } from "@/lib/estado";
import { normalizarNombre, validarGoles, validarNombre } from "@/lib/validation";
import { generarCodigo, hashCodigo } from "@/lib/codigo";
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
  const codigo = generarCodigo();
  const codigoHash = hashCodigo(codigo);

  try {
    // Re-comprobación del límite, el estado y la unicidad dentro de una
    // transacción para evitar condiciones de carrera al acercarse a las 20
    // apuestas o ante envíos simultáneos del mismo nombre.
    const apuestaId = await prisma.$transaction(async (tx) => {
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
    });

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
    console.error("POST /api/apuestas", e);
    return NextResponse.json({ error: "No se pudo registrar la apuesta." }, { status: 500 });
  }
}
