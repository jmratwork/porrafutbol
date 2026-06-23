"use client";

import { useCallback, useEffect, useState } from "react";
import { Marcador } from "@/components/Marcador";
import { CuentaAtras } from "@/components/CuentaAtras";
import { Toast, type ToastData } from "@/components/Toast";
import { formatearEuros, formatearFecha } from "@/lib/format";
import { MAX_APOSTANTES, MAX_GOLES, type EstadoActualDTO } from "@/lib/types";

export default function HomePage() {
  const [estado, setEstado] = useState<EstadoActualDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Formulario
  const [nombre, setNombre] = useState("");
  const [golesLocal, setGolesLocal] = useState("");
  const [golesVisitante, setGolesVisitante] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/porra", { cache: "no-store" });
      if (!res.ok) throw new Error("Error al cargar");
      const data: EstadoActualDTO = await res.json();
      setEstado(data);
      setErrorCarga(null);
    } catch {
      setErrorCarga("No se pudo cargar la porra. Inténtalo de nuevo en unos segundos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await fetch("/api/apuestas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          golesLocal: golesLocal === "" ? null : Number(golesLocal),
          golesVisitante: golesVisitante === "" ? null : Number(golesVisitante),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ tipo: "error", mensaje: data.error ?? "No se pudo registrar la apuesta." });
      } else {
        setEstado(data);
        setNombre("");
        setGolesLocal("");
        setGolesVisitante("");
        setToast({ tipo: "exito", mensaje: "¡Apuesta registrada! Mucha suerte 🍀" });
      }
    } catch {
      setToast({ tipo: "error", mensaje: "Error de red. Inténtalo de nuevo." });
    } finally {
      setEnviando(false);
    }
  };

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast({ tipo: "exito", mensaje: "Enlace copiado al portapapeles." });
    } catch {
      setToast({ tipo: "error", mensaje: "No se pudo copiar el enlace." });
    }
  };

  // ---- Estados de carga / vacío ----
  if (cargando) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
        <p className="animate-pulse text-cesped-700">Cargando porra…</p>
      </main>
    );
  }

  if (errorCarga) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-red-600">{errorCarga}</p>
        <button
          onClick={cargar}
          className="rounded-lg bg-cesped-600 px-4 py-2 font-semibold text-white hover:bg-cesped-700"
        >
          Reintentar
        </button>
      </main>
    );
  }

  const porra = estado?.porra ?? null;

  if (!porra) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold text-cesped-800">⚽ Porra de fútbol</h1>
        <p className="text-slate-600">
          Todavía no hay ninguna porra activa. El organizador debe crearla desde el panel de
          administración.
        </p>
        <a href="/admin" className="text-cesped-700 underline">
          Ir al panel de administración
        </a>
      </main>
    );
  }

  const abierta = porra.estado === "ABIERTA";
  const finalizada = porra.estado === "FINALIZADA";
  const completa = estado!.completa;
  const puedeApostar = abierta && !completa;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
      {/* Cabecera tipo marcador */}
      <header className="cesped-stripes overflow-hidden rounded-2xl p-5 text-white shadow-xl sm:p-7">
        <Marcador
          local={porra.equipoLocal}
          visitante={porra.equipoVisitante}
          golesLocal={finalizada ? porra.resultadoLocal : undefined}
          golesVisitante={finalizada ? porra.resultadoVisitante : undefined}
        />
        <div className="mt-5 flex flex-col items-center gap-1 text-center">
          <span className="text-sm text-cesped-50/90">{formatearFecha(porra.fechaPartido)}</span>
          {!finalizada && <CuentaAtras fechaISO={porra.fechaPartido} />}
          <EstadoBadge estado={porra.estado} />
        </div>
      </header>

      {/* Bote y nº de apuestas */}
      <section className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 text-center shadow">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bote actual</p>
          <p className="text-2xl font-black text-cesped-700">{formatearEuros(estado!.bote)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-center shadow">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Apuestas</p>
          <p className="text-2xl font-black text-cesped-700">
            {estado!.numApuestas}
            <span className="text-base font-semibold text-slate-400">/{MAX_APOSTANTES}</span>
          </p>
        </div>
      </section>

      <div className="mt-2 text-center text-xs text-slate-500">
        Apuesta: {formatearEuros(porra.precio)} por persona
      </div>

      {/* Banner de resultado / ganadores si finalizada */}
      {finalizada && <BannerGanadores estado={estado!} />}

      {/* Formulario de apuesta */}
      {!finalizada && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-6">
          <h2 className="mb-4 text-lg font-bold text-cesped-800">Haz tu apuesta</h2>

          {!abierta && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              La porra está <strong>cerrada</strong>. Ya no se aceptan nuevas apuestas.
            </p>
          )}
          {abierta && completa && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Porra completa ({MAX_APOSTANTES}/{MAX_APOSTANTES}). No se admiten más apuestas.
            </p>
          )}

          {puedeApostar && (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <div>
                <label htmlFor="nombre" className="mb-1 block text-sm font-medium text-slate-700">
                  Tu nombre
                </label>
                <input
                  id="nombre"
                  type="text"
                  required
                  maxLength={40}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Marta"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-cesped-600"
                />
              </div>

              <fieldset>
                <legend className="mb-1 block text-sm font-medium text-slate-700">
                  Tu pronóstico (goles)
                </legend>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label htmlFor="golesLocal" className="mb-1 block text-xs text-slate-500">
                      {porra.equipoLocal}
                    </label>
                    <input
                      id="golesLocal"
                      type="number"
                      inputMode="numeric"
                      required
                      min={0}
                      max={MAX_GOLES}
                      step={1}
                      value={golesLocal}
                      onChange={(e) => setGolesLocal(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg font-bold focus:border-cesped-600"
                    />
                  </div>
                  <span className="mt-5 text-xl font-black text-slate-400">-</span>
                  <div className="flex-1">
                    <label htmlFor="golesVisitante" className="mb-1 block text-xs text-slate-500">
                      {porra.equipoVisitante}
                    </label>
                    <input
                      id="golesVisitante"
                      type="number"
                      inputMode="numeric"
                      required
                      min={0}
                      max={MAX_GOLES}
                      step={1}
                      value={golesVisitante}
                      onChange={(e) => setGolesVisitante(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg font-bold focus:border-cesped-600"
                    />
                  </div>
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={enviando}
                className="mt-1 rounded-lg bg-cesped-600 px-4 py-3 font-bold text-white shadow transition hover:bg-cesped-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enviando ? "Enviando…" : "Apostar"}
              </button>
            </form>
          )}
        </section>
      )}

      {/* Lista de apuestas */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-cesped-800">
          Apuestas ({estado!.numApuestas})
        </h2>
        {estado!.apuestas.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Todavía no hay apuestas. ¡Sé el primero!
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {estado!.apuestas.map((a) => {
              const esGanador = estado!.ganadores.some((g) => g.id === a.id);
              return (
                <li
                  key={a.id}
                  className={`flex items-center justify-between py-2.5 ${
                    esGanador ? "rounded-lg bg-cesped-50 px-2" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    {esGanador && <span aria-label="Ganador">🏆</span>}
                    {a.nombre}
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-700">
                    {a.golesLocal} - {a.golesVisitante}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Compartir */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={copiarEnlace}
          className="rounded-lg border border-cesped-600 px-4 py-2 text-sm font-semibold text-cesped-700 transition hover:bg-cesped-50"
        >
          🔗 Copiar enlace
        </button>
      </div>

      <footer className="mt-8 text-center text-xs text-slate-400">
        <a href="/admin" className="underline hover:text-slate-600">
          Panel de administración
        </a>
      </footer>

      <Toast data={toast} onClose={() => setToast(null)} />
    </main>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const mapa: Record<string, string> = {
    ABIERTA: "bg-cesped-100 text-cesped-800",
    CERRADA: "bg-amber-100 text-amber-800",
    FINALIZADA: "bg-slate-200 text-slate-800",
  };
  const etiqueta: Record<string, string> = {
    ABIERTA: "Apuestas abiertas",
    CERRADA: "Apuestas cerradas",
    FINALIZADA: "Finalizada",
  };
  return (
    <span className={`mt-1 rounded-full px-3 py-0.5 text-xs font-bold ${mapa[estado] ?? ""}`}>
      {etiqueta[estado] ?? estado}
    </span>
  );
}

function BannerGanadores({ estado }: { estado: EstadoActualDTO }) {
  const { ganadores } = estado;
  return (
    <section className="mt-6 rounded-2xl border-2 border-cesped-500 bg-cesped-50 p-5 text-center shadow">
      <h2 className="text-lg font-black text-cesped-800">🏁 Resultado final</h2>
      {ganadores.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No hubo apuestas para repartir el bote.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">
            {ganadores[0].tipo === "EXACTO"
              ? "Ganador(es) por acierto exacto:"
              : "Nadie acertó el marcador exacto. Ganador(es) por proximidad:"}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {ganadores.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded-lg bg-white px-4 py-2 shadow-sm"
              >
                <span className="font-bold text-cesped-800">🏆 {g.nombre}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-sm tabular-nums text-slate-500">
                    {g.golesLocal} - {g.golesVisitante}
                  </span>
                  <span className="font-black text-cesped-700">{formatearEuros(g.premio)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
