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
    return <span className="text-sm text-cesped-100/80">Calculando…</span>;
  }

  if (restante <= 0) {
    return (
      <span className="text-sm font-semibold text-amber-200">
        El partido ya ha comenzado
      </span>
    );
  }

  const seg = Math.floor(restante / 1000);
  const dias = Math.floor(seg / 86400);
  const horas = Math.floor((seg % 86400) / 3600);
  const mins = Math.floor((seg % 3600) / 60);
  const segs = seg % 60;

  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias}d`);
  partes.push(`${horas}h`, `${mins}m`, `${segs}s`);

  return (
    <span className="font-mono text-sm font-semibold tabular-nums text-cesped-100">
      Empieza en {partes.join(" ")}
    </span>
  );
}
