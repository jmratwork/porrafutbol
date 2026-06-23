// Tipos compartidos entre backend y frontend.

export type EstadoPorra = "ABIERTA" | "CERRADA" | "FINALIZADA";

export const MAX_APOSTANTES = 20;
export const MAX_GOLES = 20;
export const MIN_GOLES = 0;
export const MAX_NOMBRE = 40;

export interface ApuestaDTO {
  id: string;
  nombre: string;
  golesLocal: number;
  golesVisitante: number;
  createdAt: string;
}

export interface GanadorDTO {
  id: string;
  nombre: string;
  golesLocal: number;
  golesVisitante: number;
  // Premio asignado a este ganador (bote / nº ganadores), redondeado a 2 decimales.
  premio: number;
  // "EXACTO" si acertó el marcador, "CERCANO" si ganó por proximidad.
  tipo: "EXACTO" | "CERCANO";
}

export interface PorraDTO {
  id: string;
  equipoLocal: string;
  equipoVisitante: string;
  fechaPartido: string;
  precio: number;
  estado: EstadoPorra;
  resultadoLocal: number | null;
  resultadoVisitante: number | null;
}

// Respuesta de GET /api/porra
export interface EstadoActualDTO {
  porra: PorraDTO | null;
  apuestas: ApuestaDTO[];
  numApuestas: number;
  bote: number;
  completa: boolean;
  ganadores: GanadorDTO[];
}
