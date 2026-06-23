import type { Apuesta, Porra } from "@prisma/client";
import type { GanadorDTO } from "./types";

/**
 * Redondea a 2 decimales (evitando errores de coma flotante).
 */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Distancia Manhattan entre el marcador real y el apostado.
 * |localReal - localApostado| + |visitanteReal - visitanteApostado|
 */
export function distancia(
  realLocal: number,
  realVisitante: number,
  apuesta: Pick<Apuesta, "golesLocal" | "golesVisitante">,
): number {
  return (
    Math.abs(realLocal - apuesta.golesLocal) +
    Math.abs(realVisitante - apuesta.golesVisitante)
  );
}

/**
 * Calcula el bote total: nº de apuestas × precio.
 */
export function calcularBote(numApuestas: number, precio: number): number {
  return redondear2(numApuestas * precio);
}

/**
 * Calcula los ganadores de una porra FINALIZADA y el premio de cada uno.
 *
 * Reglas:
 *  1. Ganan por ACIERTO EXACTO quienes acierten goles local Y visitante.
 *     El bote se reparte a partes iguales entre ellos.
 *  2. Si nadie acierta el exacto, ganan el/los más cercanos por distancia
 *     Manhattan; en caso de empate, se reparte el bote a partes iguales.
 *
 * Devuelve [] si la porra no está finalizada, no hay resultado o no hay apuestas.
 */
export function calcularGanadores(
  porra: Porra,
  apuestas: Apuesta[],
): GanadorDTO[] {
  if (
    porra.estado !== "FINALIZADA" ||
    porra.resultadoLocal === null ||
    porra.resultadoVisitante === null ||
    apuestas.length === 0
  ) {
    return [];
  }

  const realLocal = porra.resultadoLocal;
  const realVisitante = porra.resultadoVisitante;
  const bote = calcularBote(apuestas.length, porra.precio);

  // 1. Aciertos exactos.
  const exactos = apuestas.filter(
    (a) => a.golesLocal === realLocal && a.golesVisitante === realVisitante,
  );

  let ganadores: Apuesta[];
  let tipo: GanadorDTO["tipo"];

  if (exactos.length > 0) {
    ganadores = exactos;
    tipo = "EXACTO";
  } else {
    // 2. Más cercanos por distancia Manhattan.
    let minDist = Infinity;
    for (const a of apuestas) {
      const d = distancia(realLocal, realVisitante, a);
      if (d < minDist) minDist = d;
    }
    ganadores = apuestas.filter(
      (a) => distancia(realLocal, realVisitante, a) === minDist,
    );
    tipo = "CERCANO";
  }

  const premioPorGanador = redondear2(bote / ganadores.length);

  return ganadores.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    golesLocal: a.golesLocal,
    golesVisitante: a.golesVisitante,
    premio: premioPorGanador,
    tipo,
  }));
}
