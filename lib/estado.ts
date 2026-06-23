import type { Apuesta, Porra } from "@prisma/client";
import { prisma } from "./prisma";
import { calcularBote, calcularGanadores } from "./porra";
import { MAX_APOSTANTES } from "./types";
import type { ApuestaDTO, EstadoActualDTO, PorraDTO } from "./types";

function serializarPorra(porra: Porra): PorraDTO {
  return {
    id: porra.id,
    equipoLocal: porra.equipoLocal,
    equipoVisitante: porra.equipoVisitante,
    fechaPartido: porra.fechaPartido.toISOString(),
    precio: porra.precio,
    estado: porra.estado,
    resultadoLocal: porra.resultadoLocal,
    resultadoVisitante: porra.resultadoVisitante,
  };
}

function serializarApuesta(a: Apuesta): ApuestaDTO {
  return {
    id: a.id,
    nombre: a.nombre,
    golesLocal: a.golesLocal,
    golesVisitante: a.golesVisitante,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * Obtiene la porra activa (la más reciente) con todas sus apuestas
 * y construye el DTO de estado actual (bote, ganadores, etc.).
 */
export async function obtenerEstadoActual(): Promise<EstadoActualDTO> {
  const porra = await prisma.porra.findFirst({
    orderBy: { createdAt: "desc" },
    include: { apuestas: { orderBy: { createdAt: "asc" } } },
  });

  if (!porra) {
    return {
      porra: null,
      apuestas: [],
      numApuestas: 0,
      bote: 0,
      completa: false,
      ganadores: [],
    };
  }

  const numApuestas = porra.apuestas.length;
  const bote = calcularBote(numApuestas, porra.precio);
  const ganadores = calcularGanadores(porra, porra.apuestas);

  return {
    porra: serializarPorra(porra),
    apuestas: porra.apuestas.map(serializarApuesta),
    numApuestas,
    bote,
    completa: numApuestas >= MAX_APOSTANTES,
    ganadores,
  };
}

/**
 * Obtiene la porra activa cruda (sin serializar). Útil en mutaciones.
 */
export async function obtenerPorraActiva() {
  return prisma.porra.findFirst({
    orderBy: { createdAt: "desc" },
    include: { apuestas: true },
  });
}
