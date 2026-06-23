import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoActual, obtenerPorraActiva } from "@/lib/estado";
import { validarGoles, validarPorra } from "@/lib/validation";
import { extraerPin, pinValido } from "@/lib/auth";

// Esta API depende de la base de datos: nunca debe cachearse.
export const dynamic = "force-dynamic";

/**
 * GET /api/porra → estado actual (porra + apuestas + bote + ganadores).
 */
export async function GET() {
  try {
    const estado = await obtenerEstadoActual();
    return NextResponse.json(estado);
  } catch (e) {
    console.error("GET /api/porra", e);
    return NextResponse.json(
      { error: "No se pudo cargar la porra. Revisa la conexión a la base de datos." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/porra → crear porra (requiere PIN).
 * Sólo se permite si no existe ya una porra activa.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  if (!pinValido(extraerPin(req, body))) {
    return NextResponse.json({ error: "PIN incorrecto." }, { status: 401 });
  }

  const existente = await obtenerPorraActiva();
  if (existente) {
    return NextResponse.json(
      { error: "Ya existe una porra. Reiníciala para crear una nueva." },
      { status: 409 },
    );
  }

  const validacion = validarPorra(body);
  if (!validacion.ok || !validacion.data) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }

  try {
    await prisma.porra.create({
      data: {
        equipoLocal: validacion.data.equipoLocal,
        equipoVisitante: validacion.data.equipoVisitante,
        fechaPartido: validacion.data.fechaPartido,
        precio: validacion.data.precio,
        estado: "ABIERTA",
      },
    });
    const estado = await obtenerEstadoActual();
    return NextResponse.json(estado, { status: 201 });
  } catch (e) {
    console.error("POST /api/porra", e);
    return NextResponse.json({ error: "No se pudo crear la porra." }, { status: 500 });
  }
}

/**
 * PATCH /api/porra → cambiar estado o introducir resultado real (requiere PIN).
 * body.accion: "ABRIR" | "CERRAR" | "FINALIZAR"
 *  - FINALIZAR requiere resultadoLocal y resultadoVisitante.
 */
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  if (!pinValido(extraerPin(req, body))) {
    return NextResponse.json({ error: "PIN incorrecto." }, { status: 401 });
  }

  const porra = await obtenerPorraActiva();
  if (!porra) {
    return NextResponse.json({ error: "No hay ninguna porra activa." }, { status: 404 });
  }

  const accion = body.accion;

  try {
    if (accion === "ABRIR") {
      if (porra.estado === "FINALIZADA") {
        return NextResponse.json(
          { error: "No se puede reabrir una porra finalizada." },
          { status: 409 },
        );
      }
      await prisma.porra.update({
        where: { id: porra.id },
        data: { estado: "ABIERTA" },
      });
    } else if (accion === "CERRAR") {
      if (porra.estado === "FINALIZADA") {
        return NextResponse.json(
          { error: "La porra ya está finalizada." },
          { status: 409 },
        );
      }
      await prisma.porra.update({
        where: { id: porra.id },
        data: { estado: "CERRADA" },
      });
    } else if (accion === "FINALIZAR") {
      const vLocal = validarGoles(body.resultadoLocal, "el equipo local");
      if (!vLocal.ok || vLocal.data === undefined) {
        return NextResponse.json({ error: vLocal.error }, { status: 400 });
      }
      const vVis = validarGoles(body.resultadoVisitante, "el equipo visitante");
      if (!vVis.ok || vVis.data === undefined) {
        return NextResponse.json({ error: vVis.error }, { status: 400 });
      }
      await prisma.porra.update({
        where: { id: porra.id },
        data: {
          estado: "FINALIZADA",
          resultadoLocal: vLocal.data,
          resultadoVisitante: vVis.data,
        },
      });
    } else {
      return NextResponse.json(
        { error: "Acción no válida. Usa ABRIR, CERRAR o FINALIZAR." },
        { status: 400 },
      );
    }

    const estado = await obtenerEstadoActual();
    return NextResponse.json(estado);
  } catch (e) {
    console.error("PATCH /api/porra", e);
    return NextResponse.json({ error: "No se pudo actualizar la porra." }, { status: 500 });
  }
}

/**
 * DELETE /api/porra → reiniciar (borra la porra y sus apuestas).
 * Si el cuerpo trae datos válidos de una nueva porra, la crea acto seguido.
 * Requiere PIN.
 */
export async function DELETE(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    // El cuerpo es opcional en DELETE.
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  if (!pinValido(extraerPin(req, body))) {
    return NextResponse.json({ error: "PIN incorrecto." }, { status: 401 });
  }

  try {
    // Borra todas las porras (y sus apuestas en cascada).
    await prisma.porra.deleteMany({});

    // Si vienen datos válidos, crea inmediatamente una porra nueva.
    const tieneCampos =
      body.equipoLocal || body.equipoVisitante || body.fechaPartido || body.precio;
    if (tieneCampos) {
      const validacion = validarPorra(body);
      if (!validacion.ok || !validacion.data) {
        return NextResponse.json({ error: validacion.error }, { status: 400 });
      }
      await prisma.porra.create({
        data: {
          equipoLocal: validacion.data.equipoLocal,
          equipoVisitante: validacion.data.equipoVisitante,
          fechaPartido: validacion.data.fechaPartido,
          precio: validacion.data.precio,
          estado: "ABIERTA",
        },
      });
    }

    const estado = await obtenerEstadoActual();
    return NextResponse.json(estado);
  } catch (e) {
    console.error("DELETE /api/porra", e);
    return NextResponse.json({ error: "No se pudo reiniciar la porra." }, { status: 500 });
  }
}
