import { ZONA_BARCELONA } from "./fecha";

/**
 * Formatea una fecha ISO a una cadena legible en español, SIEMPRE en hora de
 * Barcelona (Cataluña), independientemente de la zona del visitante.
 */
export function formatearFecha(fechaISO: string): string {
  const d = new Date(fechaISO);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: ZONA_BARCELONA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Formatea un importe en euros.
 */
export function formatearEuros(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}
