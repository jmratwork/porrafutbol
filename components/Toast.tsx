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
      ? "bg-cesped-600 text-white"
      : "bg-red-600 text-white";

  return (
    <div
      role="alert"
      className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl px-4 py-3 text-center font-medium shadow-lg sm:inset-x-0 ${estilos}`}
    >
      {data.mensaje}
    </div>
  );
}
