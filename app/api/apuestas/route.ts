import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoActual, obtenerPorraActiva } from "@/lib/estado";
import { validarGoles, validarNombre } from "@/lib/validation";
import { MAX_APOSTANTES } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/apuestas → crear una apuesta.
 * Valida: porra ABIERTA, < 20 apuestas, nombre no vacío, goles 0–20 enteros.
 * Devuelve 409 si la porra está completa o cerrada.
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

  try {
    // Re-comprobación del límite dentro de una transacción para evitar
    // condiciones de carrera al acercarse a las 20 apuestas.
    await prisma.$transaction(async (tx) => {
      const count = await tx.apuesta.count({ where: { porraId: porra.id } });
      if (count >= MAX_APOSTANTES) {
        throw new Error("PORRA_COMPLETA");
      }
      const actual = await tx.porra.findUnique({ where: { id: porra.id } });
      if (!actual || actual.estado !== "ABIERTA") {
        throw new Error("PORRA_NO_ABIERTA");
      }
      await tx.apuesta.create({
        data: {
          porraId: porra.id,
          nombre: vNombre.data!,
          golesLocal: vLocal.data!,
          golesVisitante: vVis.data!,
        },
      });
    });
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
    console.error("POST /api/apuestas", e);
    return NextResponse.json({ error: "No se pudo registrar la apuesta." }, { status: 500 });
  }

  const estado = await obtenerEstadoActual();
  return NextResponse.json(estado, { status: 201 });
}
