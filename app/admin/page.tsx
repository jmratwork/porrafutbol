"use client";

import { useCallback, useEffect, useState } from "react";
import { Toast, type ToastData } from "@/components/Toast";
import { formatearEuros, formatearFecha } from "@/lib/format";
import { MAX_GOLES, type EstadoActualDTO } from "@/lib/types";

const PIN_STORAGE_KEY = "porra_admin_pin";

export default function AdminPage() {
  const [estado, setEstado] = useState<EstadoActualDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pin, setPin] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  // Recupera el PIN guardado en sesión (comodidad, no es seguridad real).
  useEffect(() => {
    const guardado = sessionStorage.getItem(PIN_STORAGE_KEY);
    if (guardado) setPin(guardado);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/porra", { cache: "no-store" });
      const data: EstadoActualDTO = await res.json();
      setEstado(data);
    } catch {
      setToast({ tipo: "error", mensaje: "No se pudo cargar el estado." });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Realiza una petición con el PIN en cabecera y gestiona errores comunes. */
  const peticion = async (
    metodo: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
    mensajeExito: string,
  ) => {
    if (!pin) {
      setToast({ tipo: "error", mensaje: "Introduce el PIN de administración." });
      return false;
    }
    setTrabajando(true);
    try {
      const res = await fetch("/api/porra", {
        method: metodo,
        headers: { "Content-Type": "application/json", "x-admin-pin": pin },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ tipo: "error", mensaje: data.error ?? "Operación fallida." });
        return false;
      }
      sessionStorage.setItem(PIN_STORAGE_KEY, pin);
      setEstado(data);
      setToast({ tipo: "exito", mensaje: mensajeExito });
      return true;
    } catch {
      setToast({ tipo: "error", mensaje: "Error de red. Inténtalo de nuevo." });
      return false;
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
        <p className="animate-pulse text-cesped-700">Cargando…</p>
      </main>
    );
  }

  const porra = estado?.porra ?? null;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black text-cesped-800">⚙️ Administración</h1>
        <a href="/" className="text-sm text-cesped-700 underline">
          Ver porra
        </a>
      </header>

      {/* PIN */}
      <section className="mb-6 rounded-2xl bg-white p-5 shadow">
        <label htmlFor="pin" className="mb-1 block text-sm font-medium text-slate-700">
          PIN de administración
        </label>
        <input
          id="pin"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Introduce el PIN"
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-cesped-600"
        />
        <p className="mt-1 text-xs text-slate-500">
          Se valida contra la variable de entorno <code>ADMIN_PIN</code>. Necesario para todas las
          acciones.
        </p>
      </section>

      {porra ? (
        <GestionPorra
          estado={estado!}
          trabajando={trabajando}
          peticion={peticion}
        />
      ) : (
        <CrearPorra trabajando={trabajando} peticion={peticion} />
      )}

      <Toast data={toast} onClose={() => setToast(null)} />
    </main>
  );
}

type PeticionFn = (
  metodo: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
  mensajeExito: string,
) => Promise<boolean>;

/** Formulario de creación de porra cuando no existe ninguna. */
function CrearPorra({ trabajando, peticion }: { trabajando: boolean; peticion: PeticionFn }) {
  const [equipoLocal, setEquipoLocal] = useState("");
  const [equipoVisitante, setEquipoVisitante] = useState("");
  const [fecha, setFecha] = useState("");
  const [precio, setPrecio] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await peticion(
      "POST",
      {
        equipoLocal,
        equipoVisitante,
        // datetime-local devuelve hora local sin zona; lo convertimos a ISO.
        fechaPartido: fecha ? new Date(fecha).toISOString() : "",
        precio: precio === "" ? null : Number(precio),
      },
      "Porra creada correctamente.",
    );
  };

  return (
    <section className="rounded-2xl bg-white p-5 shadow sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-cesped-800">Crear porra</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="local" className="mb-1 block text-sm font-medium text-slate-700">
            Equipo local
          </label>
          <input
            id="local"
            type="text"
            required
            maxLength={40}
            value={equipoLocal}
            onChange={(e) => setEquipoLocal(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-cesped-600"
          />
        </div>
        <div>
          <label htmlFor="visitante" className="mb-1 block text-sm font-medium text-slate-700">
            Equipo visitante
          </label>
          <input
            id="visitante"
            type="text"
            required
            maxLength={40}
            value={equipoVisitante}
            onChange={(e) => setEquipoVisitante(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-cesped-600"
          />
        </div>
        <div>
          <label htmlFor="fecha" className="mb-1 block text-sm font-medium text-slate-700">
            Fecha y hora del partido
          </label>
          <input
            id="fecha"
            type="datetime-local"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-cesped-600"
          />
        </div>
        <div>
          <label htmlFor="precio" className="mb-1 block text-sm font-medium text-slate-700">
            Precio de la apuesta (€)
          </label>
          <input
            id="precio"
            type="number"
            required
            min={0.01}
            step={0.01}
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-cesped-600"
          />
        </div>
        <button
          type="submit"
          disabled={trabajando}
          className="rounded-lg bg-cesped-600 px-4 py-3 font-bold text-white shadow hover:bg-cesped-700 disabled:opacity-60"
        >
          {trabajando ? "Creando…" : "Crear porra"}
        </button>
      </form>
    </section>
  );
}

/** Gestión de una porra existente: abrir/cerrar, finalizar, reiniciar. */
function GestionPorra({
  estado,
  trabajando,
  peticion,
}: {
  estado: EstadoActualDTO;
  trabajando: boolean;
  peticion: PeticionFn;
}) {
  const porra = estado.porra!;
  const [resLocal, setResLocal] = useState("");
  const [resVisitante, setResVisitante] = useState("");
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);

  const finalizar = async (e: React.FormEvent) => {
    e.preventDefault();
    await peticion(
      "PATCH",
      {
        accion: "FINALIZAR",
        resultadoLocal: resLocal === "" ? null : Number(resLocal),
        resultadoVisitante: resVisitante === "" ? null : Number(resVisitante),
      },
      "Porra finalizada. Ganadores calculados.",
    );
  };

  const reiniciar = async () => {
    const ok = await peticion("DELETE", {}, "Porra reiniciada. Crea una nueva.");
    if (ok) setConfirmarReinicio(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Resumen */}
      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="mb-2 text-lg font-bold text-cesped-800">
          {porra.equipoLocal} vs {porra.equipoVisitante}
        </h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Estado</dt>
          <dd className="text-right font-semibold">{porra.estado}</dd>
          <dt className="text-slate-500">Fecha</dt>
          <dd className="text-right">{formatearFecha(porra.fechaPartido)}</dd>
          <dt className="text-slate-500">Precio</dt>
          <dd className="text-right">{formatearEuros(porra.precio)}</dd>
          <dt className="text-slate-500">Apuestas</dt>
          <dd className="text-right">{estado.numApuestas}/20</dd>
          <dt className="text-slate-500">Bote</dt>
          <dd className="text-right font-bold text-cesped-700">{formatearEuros(estado.bote)}</dd>
        </dl>
      </section>

      {/* Abrir / Cerrar */}
      {porra.estado !== "FINALIZADA" && (
        <section className="rounded-2xl bg-white p-5 shadow">
          <h3 className="mb-3 font-bold text-cesped-800">Apuestas</h3>
          <div className="flex gap-3">
            <button
              disabled={trabajando || porra.estado === "ABIERTA"}
              onClick={() => peticion("PATCH", { accion: "ABRIR" }, "Apuestas abiertas.")}
              className="flex-1 rounded-lg bg-cesped-600 px-4 py-2 font-semibold text-white hover:bg-cesped-700 disabled:opacity-40"
            >
              Abrir
            </button>
            <button
              disabled={trabajando || porra.estado === "CERRADA"}
              onClick={() => peticion("PATCH", { accion: "CERRAR" }, "Apuestas cerradas.")}
              className="flex-1 rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
            >
              Cerrar
            </button>
          </div>
        </section>
      )}

      {/* Finalizar con resultado */}
      {porra.estado !== "FINALIZADA" ? (
        <section className="rounded-2xl bg-white p-5 shadow">
          <h3 className="mb-3 font-bold text-cesped-800">Introducir resultado y finalizar</h3>
          <form onSubmit={finalizar} className="flex flex-col gap-4" noValidate>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="resLocal" className="mb-1 block text-xs text-slate-500">
                  {porra.equipoLocal}
                </label>
                <input
                  id="resLocal"
                  type="number"
                  required
                  min={0}
                  max={MAX_GOLES}
                  step={1}
                  value={resLocal}
                  onChange={(e) => setResLocal(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg font-bold focus:border-cesped-600"
                />
              </div>
              <span className="mb-2 text-xl font-black text-slate-400">-</span>
              <div className="flex-1">
                <label htmlFor="resVisitante" className="mb-1 block text-xs text-slate-500">
                  {porra.equipoVisitante}
                </label>
                <input
                  id="resVisitante"
                  type="number"
                  required
                  min={0}
                  max={MAX_GOLES}
                  step={1}
                  value={resVisitante}
                  onChange={(e) => setResVisitante(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg font-bold focus:border-cesped-600"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={trabajando}
              className="rounded-lg bg-cesped-700 px-4 py-3 font-bold text-white shadow hover:bg-cesped-800 disabled:opacity-60"
            >
              {trabajando ? "Procesando…" : "Finalizar y calcular ganadores"}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-2xl border-2 border-cesped-500 bg-cesped-50 p-5 shadow">
          <h3 className="font-bold text-cesped-800">
            Resultado: {porra.resultadoLocal} - {porra.resultadoVisitante}
          </h3>
          {estado.ganadores.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {estado.ganadores.map((g) => (
                <li key={g.id} className="flex justify-between rounded-lg bg-white px-4 py-2">
                  <span className="font-semibold">🏆 {g.nombre}</span>
                  <span className="font-bold text-cesped-700">{formatearEuros(g.premio)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No hubo apuestas.</p>
          )}
        </section>
      )}

      {/* Reiniciar */}
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <h3 className="mb-2 font-bold text-red-800">Zona peligrosa</h3>
        <p className="mb-3 text-sm text-red-700">
          Reiniciar borra la porra actual y todas sus apuestas. Esta acción no se puede deshacer.
        </p>
        {confirmarReinicio ? (
          <div className="flex gap-3">
            <button
              disabled={trabajando}
              onClick={reiniciar}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              Sí, borrar todo
            </button>
            <button
              disabled={trabajando}
              onClick={() => setConfirmarReinicio(false)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmarReinicio(true)}
            className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          >
            Reiniciar porra
          </button>
        )}
      </section>
    </div>
  );
}
