import { MAX_GOLES, MAX_NOMBRE, MIN_GOLES } from "./types";

export interface ResultadoValidacion<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Valida que un valor sea un entero dentro de [MIN_GOLES, MAX_GOLES].
 */
export function validarGoles(valor: unknown, etiqueta: string): ResultadoValidacion<number> {
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return { ok: false, error: `Los goles de ${etiqueta} deben ser un número.` };
  }
  if (!Number.isInteger(n)) {
    return { ok: false, error: `Los goles de ${etiqueta} deben ser un número entero.` };
  }
  if (n < MIN_GOLES || n > MAX_GOLES) {
    return {
      ok: false,
      error: `Los goles de ${etiqueta} deben estar entre ${MIN_GOLES} y ${MAX_GOLES}.`,
    };
  }
  return { ok: true, data: n };
}

/**
 * Valida y normaliza (trim) un nombre de apostante.
 */
export function validarNombre(valor: unknown): ResultadoValidacion<string> {
  if (typeof valor !== "string") {
    return { ok: false, error: "El nombre es obligatorio." };
  }
  const nombre = valor.trim();
  if (nombre.length < 1) {
    return { ok: false, error: "El nombre es obligatorio." };
  }
  if (nombre.length > MAX_NOMBRE) {
    return { ok: false, error: `El nombre no puede superar los ${MAX_NOMBRE} caracteres.` };
  }
  return { ok: true, data: nombre };
}

/**
 * Valida los campos de creación/configuración de una porra.
 */
export interface DatosPorra {
  equipoLocal: string;
  equipoVisitante: string;
  fechaPartido: Date;
  precio: number;
}

export function validarPorra(body: Record<string, unknown>): ResultadoValidacion<DatosPorra> {
  const equipoLocal = typeof body.equipoLocal === "string" ? body.equipoLocal.trim() : "";
  const equipoVisitante =
    typeof body.equipoVisitante === "string" ? body.equipoVisitante.trim() : "";

  if (!equipoLocal || equipoLocal.length > MAX_NOMBRE) {
    return { ok: false, error: "El nombre del equipo local es obligatorio (máx. 40 caracteres)." };
  }
  if (!equipoVisitante || equipoVisitante.length > MAX_NOMBRE) {
    return {
      ok: false,
      error: "El nombre del equipo visitante es obligatorio (máx. 40 caracteres).",
    };
  }

  const fechaRaw = body.fechaPartido;
  if (typeof fechaRaw !== "string" || fechaRaw.length === 0) {
    return { ok: false, error: "La fecha y hora del partido son obligatorias." };
  }
  const fechaPartido = new Date(fechaRaw);
  if (Number.isNaN(fechaPartido.getTime())) {
    return { ok: false, error: "La fecha y hora del partido no son válidas." };
  }

  const precioNum = typeof body.precio === "string" ? Number(body.precio) : body.precio;
  if (typeof precioNum !== "number" || !Number.isFinite(precioNum) || precioNum <= 0) {
    return { ok: false, error: "El precio debe ser un número mayor que 0." };
  }

  return {
    ok: true,
    data: { equipoLocal, equipoVisitante, fechaPartido, precio: precioNum },
  };
}
