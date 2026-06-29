"use client";

import { useEffect } from "react";

export type TipoToast = "exito" | "error";

export interface ToastData {
  tipo: TipoToast;
  mensaje: string;
}

/**
 * Toast accesible que se autodescarta a los 4s. role=alert para lectores de pantalla.
 */
export function Toast({
  data,
  onClose,
}: {
  data: ToastData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [data, onClose]);

  if (!data) return null;

  const estilos =
    data.tipo === "exito"
      ? "ring-cesped-400/40 text-cesped-100"
      : "ring-red-400/40 text-red-100";

  const icono = data.tipo === "exito" ? "✓" : "✕";
  const iconoColor =
    data.tipo === "exito"
      ? "bg-cesped-400/20 text-cesped-300"
      : "bg-red-400/20 text-red-300";

  return (
    <div
      role="alert"
      className={`fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md animate-rise-in items-center gap-3 rounded-2xl border border-white/10 bg-noche-900/90 px-4 py-3 font-medium shadow-2xl ring-1 backdrop-blur-md sm:inset-x-0 ${estilos}`}
    >
      <span
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-black ${iconoColor}`}
        aria-hidden="true"
      >
        {icono}
      </span>
      <span>{data.mensaje}</span>
    </div>
  );
}
