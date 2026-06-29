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
    <div className="relative flex items-center justify-center gap-3 sm:gap-6">
      <div className="flex flex-1 flex-col items-center gap-2.5 text-center">
        <Escudo nombre={local} />
        <span className="line-clamp-2 text-sm font-semibold text-slate-100 sm:text-base">
          {local}
        </span>
      </div>

      <div className="flex min-w-[84px] flex-col items-center">
        {hayResultado ? (
          <span
            className="text-5xl font-black tabular-nums text-white sm:text-6xl"
            style={{ textShadow: "0 0 24px rgba(74,222,128,0.45)" }}
          >
            {golesLocal}
            <span className="px-1.5 text-cesped-400">-</span>
            {golesVisitante}
          </span>
        ) : (
          <span
            className="text-3xl font-black text-cesped-300 sm:text-4xl"
            style={{ textShadow: "0 0 22px rgba(74,222,128,0.45)" }}
          >
            VS
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-2.5 text-center">
        <Escudo nombre={visitante} />
        <span className="line-clamp-2 text-sm font-semibold text-slate-100 sm:text-base">
          {visitante}
        </span>
      </div>
    </div>
  );
}
