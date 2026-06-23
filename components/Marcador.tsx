import { Escudo } from "./Escudo";

/**
 * Cabecera tipo marcador: LOCAL — VISITANTE con escudos genéricos.
 * Si se pasan goles, los muestra; si no, muestra "VS".
 */
export function Marcador({
  local,
  visitante,
  golesLocal,
  golesVisitante,
}: {
  local: string;
  visitante: string;
  golesLocal?: number | null;
  golesVisitante?: number | null;
}) {
  const hayResultado =
    typeof golesLocal === "number" && typeof golesVisitante === "number";

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-6">
      <div className="flex flex-1 flex-col items-center gap-2 text-center">
        <Escudo nombre={local} />
        <span className="line-clamp-2 text-sm font-semibold sm:text-base">{local}</span>
      </div>

      <div className="flex min-w-[72px] flex-col items-center">
        {hayResultado ? (
          <span className="text-4xl font-black tabular-nums sm:text-5xl">
            {golesLocal} <span className="text-cesped-200">-</span> {golesVisitante}
          </span>
        ) : (
          <span className="text-2xl font-black text-cesped-100 sm:text-3xl">VS</span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-2 text-center">
        <Escudo nombre={visitante} />
        <span className="line-clamp-2 text-sm font-semibold sm:text-base">{visitante}</span>
      </div>
    </div>
  );
}
