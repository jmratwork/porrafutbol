import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoActual, obtenerPorraActiva } from "@/lib/estado";
import { cuerpoComoObjeto, validarGoles, validarPorra } from "@/lib/validation";
import { tieneSesionAdmin } from "@/lib/auth";

// Esta API depende de la base de datos: nunca debe cachearse.
export const dynamic = "force-dynamic";

/** Se lanza dentro de la transacción de creación si ya hay una porra. */
class PorraYaExisteError extends Error {}

/** ¿El error es un conflicto de concurrencia (transacción serializable abortada)? */
function esConflictoConcurrencia(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
}

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
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = cuerpoComoObjeto(await req.json());
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  if (!tieneSesionAdmin(req)) {
    return NextResponse.json(
      { error: "Sesión de administración no válida o caducada." },
      { status: 401 },
    );
  }

  // Pre-chequeo rápido (caso normal): si ya hay porra, 409 sin abrir transacción.
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
    // Re-chequeo dentro de una transacción SERIALIZABLE: si dos POST llegan a la
    // vez, ambos verían la tabla vacía en el pre-chequeo, pero Postgres aborta
    // una de las transacciones concurrentes (P2034) y así nunca se crean dos.
    await prisma.$transaction(
      async (tx) => {
        if ((await tx.porra.count()) > 0) throw new PorraYaExisteError();
        await tx.porra.create({
          data: {
            equipoLocal: validacion.data!.equipoLocal,
            equipoVisitante: validacion.data!.equipoVisitante,
            fechaPartido: validacion.data!.fechaPartido,
            precio: validacion.data!.precio,
            estado: "ABIERTA",
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const estado = await obtenerEstadoActual();
    return NextResponse.json(estado, { status: 201 });
  } catch (e) {
    if (e instanceof PorraYaExisteError || esConflictoConcurrencia(e)) {
      return NextResponse.json(
        { error: "Ya existe una porra. Reiníciala para crear una nueva." },
        { status: 409 },
      );
    }
    console.error("POST /api/porra", e);
    return NextResponse.json({ error: "No se pudo crear la porra." }, { status: 500 });
  }
}

/**
 * PATCH /api/porra → cambiar estado o introducir resultado real (requiere PIN).
 * body.accion: "ABRIR" | "CERRAR" | "FINALIZAR"
 *  - FINALIZAR requiere resultadoLocal y resultadoVisitante.
 */
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = cuerpoComoObjeto(await req.json());
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  if (!tieneSesionAdmin(req)) {
    return NextResponse.json(
      { error: "Sesión de administración no válida o caducada." },
      { status: 401 },
    );
  }

  const porra = await obtenerPorraActiva();
  if (!porra) {
    return NextResponse.json({ error: "No hay ninguna porra activa." }, { status: 404 });
  }

  const accion = body.accion;

  try {
    if (accion === "ABRIR") {
      // Una porra cerrada NO se reabre: es irreversible para que las invitaciones
      // caduquen de forma fiable. La porra nace ABIERTA (en creación y reinicio),
      // así que ABRIR sólo puede ser un no-op sobre una porra ya abierta.
      if (porra.estado !== "ABIERTA") {
        return NextResponse.json(
          { error: "Una porra cerrada no se puede reabrir. Reiníciala para empezar de nuevo." },
          { status: 409 },
        );
      }
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
      if (porra.estado === "FINALIZADA") {
        return NextResponse.json(
          { error: "La porra ya está finalizada. No se puede modificar el resultado." },
          { status: 409 },
        );
      }
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
export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    // El cuerpo es opcional en DELETE.
    const text = await req.text();
    if (text) body = cuerpoComoObjeto(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición no válido." }, { status: 400 });
  }

  if (!tieneSesionAdmin(req)) {
    return NextResponse.json(
      { error: "Sesión de administración no válida o caducada." },
      { status: 401 },
    );
  }

  // Si el reinicio trae los datos de la porra siguiente, se validan ANTES de
  // borrar nada: antes se hacía al revés, de modo que un error al teclear la
  // fecha o el precio se llevaba la porra y las 20 apuestas por delante y sólo
  // después devolvía un 400.
  const tieneCampos =
    body.equipoLocal || body.equipoVisitante || body.fechaPartido || body.precio;
  let datos = null;
  if (tieneCampos) {
    const validacion = validarPorra(body);
    if (!validacion.ok || !validacion.data) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }
    datos = validacion.data;
  }

  try {
    // Borrado y creación en una sola transacción: si la creación falla, el
    // borrado no se queda aplicado a medias. SERIALIZABLE para que dos
    // reinicios simultáneos no puedan dejar dos porras activas.
    await prisma.$transaction(
      async (tx) => {
        // Borra todas las porras (y sus apuestas en cascada).
        await tx.porra.deleteMany({});
        if (datos) {
          await tx.porra.create({
            data: {
              equipoLocal: datos.equipoLocal,
              equipoVisitante: datos.equipoVisitante,
              fechaPartido: datos.fechaPartido,
              precio: datos.precio,
              estado: "ABIERTA",
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const estado = await obtenerEstadoActual();
    return NextResponse.json(estado);
  } catch (e) {
    if (esConflictoConcurrencia(e)) {
      return NextResponse.json(
        { error: "Otro reinicio llegó a la vez. Vuelve a intentarlo." },
        { status: 409 },
      );
    }
    console.error("DELETE /api/porra", e);
    return NextResponse.json({ error: "No se pudo reiniciar la porra." }, { status: 500 });
  }
}
