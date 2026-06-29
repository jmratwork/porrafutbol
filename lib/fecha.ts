// Toda la porra usa SIEMPRE la hora de Barcelona (Cataluña) como referencia.
// Cataluña comparte zona con Madrid (CET/CEST); en IANA es "Europe/Madrid".
export const ZONA_BARCELONA = "Europe/Madrid";

/**
 * Desfase de una zona horaria en un instante dado, en milisegundos,
 * tal que: horaLocal = horaUTC + desfase. (P. ej. +7200000 en verano peninsular.)
 */
function desfaseZonaMs(fecha: Date, zona: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const v: Record<string, number> = {};
  for (const p of dtf.formatToParts(fecha)) {
    if (p.type !== "literal") v[p.type] = Number(p.value);
  }
  const comoUTC = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return comoUTC - fecha.getTime();
}

/**
 * Convierte la fecha/hora del formulario a un instante UTC interpretándola
 * SIEMPRE como hora de Barcelona, independientemente de dónde esté el
 * organizador. Acepta "YYYY-MM-DDTHH:mm" (lo que devuelve un datetime-local).
 * Si la cadena ya trae zona (Z o ±hh:mm) se respeta tal cual.
 */
export function parseFechaBarcelona(raw: string): Date | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  // Ya incluye zona horaria explícita: respétala.
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const [, y, mo, d, h, mi, s] = m;
  // Instante "como si la hora de pared fuera UTC".
  const provisional = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  // Restando el desfase de Barcelona en ese instante obtenemos el UTC real.
  const desfase = desfaseZonaMs(new Date(provisional), ZONA_BARCELONA);
  const real = new Date(provisional - desfase);
  return Number.isNaN(real.getTime()) ? null : real;
}
