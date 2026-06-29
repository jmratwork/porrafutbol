"use client";

import { useEffect, useState } from "react";

/**
 * Cuenta atrás hasta el inicio del partido. Se actualiza cada segundo.
 * Si la fecha ya pasó, muestra "El partido ya ha comenzado".
 */
export function CuentaAtras({ fechaISO }: { fechaISO: string }) {
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    const objetivo = new Date(fechaISO).getTime();
    const tick = () => setRestante(objetivo - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fechaISO]);

  // Evita desajuste de hidratación: no renderiza el tiempo hasta montar en cliente.
  if (restante === null) {
    return <span className="text-sm text-slate-400">Calculando…</span>;
  }

  if (restante <= 0) {
    return (
      <span className="rounded-full bg-amber-400/15 px-3 py-1 text-sm font-semibold text-amber-300 ring-1 ring-amber-400/30">
        El partido ya ha comenzado
      </span>
    );
  }

  const seg = Math.floor(restante / 1000);
  const dias = Math.floor(seg / 86400);
  const horas = Math.floor((seg % 86400) / 3600);
  const mins = Math.floor((seg % 3600) / 60);
  const segs = seg % 60;

  const partes: { valor: number; etiqueta: string }[] = [];
  if (dias > 0) partes.push({ valor: dias, etiqueta: "d" });
  partes.push(
    { valor: horas, etiqueta: "h" },
    { valor: mins, etiqueta: "m" },
    { valor: segs, etiqueta: "s" },
  );

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Empieza en
      </span>
      <span className="flex items-center gap-1.5">
        {partes.map((p) => (
          <span
            key={p.etiqueta}
            className="rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-sm font-bold tabular-nums text-cesped-300 ring-1 ring-white/10"
          >
            {String(p.valor).padStart(2, "0")}
            <span className="ml-0.5 text-[0.65rem] text-slate-500">{p.etiqueta}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
