/**
 * Formatea una fecha ISO a una cadena legible en español (zona del navegador).
 */
export function formatearFecha(fechaISO: string): string {
  const d = new Date(fechaISO);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
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
