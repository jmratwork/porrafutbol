/**
 * Escudo genérico: muestra las iniciales del equipo en un círculo.
 * Sin imágenes con copyright.
 */
export function Escudo({ nombre, size = 56 }: { nombre: string; size?: number }) {
  const iniciales = nombre
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);

  return (
    <div
      className="flex items-center justify-center rounded-full bg-white font-extrabold text-cesped-800 shadow-md ring-2 ring-cesped-600"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {iniciales || "?"}
    </div>
  );
}
