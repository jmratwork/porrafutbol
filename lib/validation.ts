import { MAX_GOLES, MAX_NOMBRE, MIN_GOLES } from "./types";
import { parseFechaBarcelona } from "./fecha";

export interface ResultadoValidacion<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Normaliza el cuerpo JSON de una petición a un objeto.
 *
 * `null`, `123` o `[]` son JSON perfectamente válidos, así que `req.json()`
 * puede devolverlos: leer `body.pin` sobre ellos lanza un TypeError que, al no
 * estar dentro de ningún try, se convertía en un 500 sin autenticar.
 */
export function cuerpoComoObjeto(valor: unknown): Record<string, unknown> {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    return valor as Record<string, unknown>;
  }
  return {};
}

/**
 * Valida que un valor sea un entero dentro de [MIN_GOLES, MAX_GOLES].
 */
export function validarGoles(valor: unknown, etiqueta: string): ResultadoValidacion<number> {
  // Number("") y Number("   ") son 0, así que una cadena vacía colaba como
  // "cero goles": un formulario a medio enviar registraba un 0-0 silencioso, y
  // en el resultado del admin eso finaliza la porra con un marcador falso. Se
  // exigen dígitos explícitos; también quedan fuera "0x10", "1e1" y " 5 ".
  const n = typeof valor === "string" ? (/^\d{1,2}$/.test(valor) ? Number(valor) : NaN) : valor;
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
 * Normaliza un nombre para comprobar unicidad por porra: minúsculas y espacios
 * colapsados. No distingue "Marta", "marta" ni "marta " como nombres distintos.
 */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\s+/g, " ");
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

// Cota superior razonable para el precio de una apuesta (evita botes absurdos).
export const MAX_PRECIO = 10000;

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
  // La hora del formulario se interpreta SIEMPRE como hora de Barcelona.
  const fechaPartido = parseFechaBarcelona(fechaRaw);
  if (!fechaPartido) {
    return { ok: false, error: "La fecha y hora del partido no son válidas." };
  }

  // Igual que en los goles: dígitos explícitos, con dos decimales como máximo y
  // admitiendo la coma como separador. Antes `Number()` aceptaba "" (→ 0),
  // "0x10" (→ 16) y "1e-9", y el límite inferior era `> 0`, de modo que un
  // precio de 0,001 € pasaba la validación y redondeaba el bote a 0 €.
  const precioRaw = typeof body.precio === "string" ? body.precio.trim().replace(",", ".") : body.precio;
  const precioNum =
    typeof precioRaw === "string"
      ? (/^\d+(\.\d{1,2})?$/.test(precioRaw) ? Number(precioRaw) : NaN)
      : precioRaw;
  if (
    typeof precioNum !== "number" ||
    !Number.isFinite(precioNum) ||
    precioNum < 0.01 ||
    precioNum > MAX_PRECIO ||
    // Dos decimales como máximo. Se compara el valor redondeado, no el producto
    // por 100: 0.07 * 100 da 7.000000000000001 en coma flotante y rechazaría un
    // precio perfectamente válido.
    Math.round(precioNum * 100) / 100 !== precioNum
  ) {
    return {
      ok: false,
      error: `El precio debe ser un número entre 0,01 € y ${MAX_PRECIO} €, con dos decimales como máximo.`,
    };
  }

  return {
    ok: true,
    data: { equipoLocal, equipoVisitante, fechaPartido, precio: precioNum },
  };
}
