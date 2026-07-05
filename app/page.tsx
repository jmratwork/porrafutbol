"use client";

import { useCallback, useEffect, useState } from "react";
import { Marcador } from "@/components/Marcador";
import { CuentaAtras } from "@/components/CuentaAtras";
import { Toast, type ToastData } from "@/components/Toast";
import { formatearEuros, formatearFecha } from "@/lib/format";
import {
  MAX_APOSTANTES,
  MAX_GOLES,
  type ApuestaDTO,
  type CrearApuestaDTO,
  type EstadoActualDTO,
} from "@/lib/types";

// Clave de localStorage donde guardamos los códigos de las apuestas hechas
// desde este navegador: { [apuestaId]: codigo }. Permite gestionar la propia
// apuesta sin volver a teclear el código.
const LS_CODIGOS = "porra_misApuestas";

function leerCodigos(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_CODIGOS) ?? "{}");
  } catch {
    return {};
  }
}

export default function HomePage() {
  const [estado, setEstado] = useState<EstadoActualDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Formulario de nueva apuesta
  const [nombre, setNombre] = useState("");
  const [golesLocal, setGolesLocal] = useState("");
  const [golesVisitante, setGolesVisitante] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Códigos propios + panel del código recién generado
  const [misCodigos, setMisCodigos] = useState<Record<string, string>>({});
  const [codigoNuevo, setCodigoNuevo] = useState<{ id: string; codigo: string } | null>(null);

  // Gestión (editar/borrar) de una apuesta concreta
  const [gestionId, setGestionId] = useState<string | null>(null);
  const [gLocal, setGLocal] = useState("");
  const [gVisitante, setGVisitante] = useState("");
  const [gCodigo, setGCodigo] = useState("");
  const [gTrabajando, setGTrabajando] = useState(false);

  useEffect(() => {
    setMisCodigos(leerCodigos());
  }, []);

  const guardarCodigoLocal = useCallback((id: string, codigo: string) => {
    setMisCodigos((prev) => {
      const siguiente = { ...prev, [id]: codigo };
      window.localStorage.setItem(LS_CODIGOS, JSON.stringify(siguiente));
      return siguiente;
    });
  }, []);

  const olvidarCodigoLocal = useCallback((id: string) => {
    setMisCodigos((prev) => {
      const siguiente = { ...prev };
      delete siguiente[id];
      window.localStorage.setItem(LS_CODIGOS, JSON.stringify(siguiente));
      return siguiente;
    });
  }, []);

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

  // Cierre automático: programa una recarga justo cuando empieza el partido,
  // para que la interfaz refleje el cierre sin necesidad de recargar la página.
  useEffect(() => {
    const p = estado?.porra;
    if (!p || p.estado !== "ABIERTA") return;
    const ms = new Date(p.fechaPartido).getTime() - Date.now();
    // setTimeout desborda por encima de ~24,8 días; sólo programamos si está cerca.
    if (ms <= 0 || ms > 2_147_483_000) return;
    const id = setTimeout(() => cargar(), ms + 500);
    return () => clearTimeout(id);
  }, [estado?.porra, cargar]);

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
        const creada = data as CrearApuestaDTO;
        setEstado(creada.estado);
        guardarCodigoLocal(creada.apuestaId, creada.codigo);
        setCodigoNuevo({ id: creada.apuestaId, codigo: creada.codigo });
        setNombre("");
        setGolesLocal("");
        setGolesVisitante("");
      }
    } catch {
      setToast({ tipo: "error", mensaje: "Error de red. Inténtalo de nuevo." });
    } finally {
      setEnviando(false);
    }
  };

  const abrirGestion = (a: ApuestaDTO) => {
    setGestionId(a.id);
    setGLocal(String(a.golesLocal));
    setGVisitante(String(a.golesVisitante));
    setGCodigo(misCodigos[a.id] ?? "");
  };

  const cerrarGestion = () => {
    setGestionId(null);
    setGCodigo("");
  };

  const guardarEdicion = async (id: string) => {
    setGTrabajando(true);
    try {
      const res = await fetch(`/api/apuestas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-apuesta-codigo": gCodigo.trim() },
        body: JSON.stringify({
          golesLocal: gLocal === "" ? null : Number(gLocal),
          golesVisitante: gVisitante === "" ? null : Number(gVisitante),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ tipo: "error", mensaje: data.error ?? "No se pudo actualizar." });
      } else {
        setEstado(data as EstadoActualDTO);
        guardarCodigoLocal(id, gCodigo.trim());
        cerrarGestion();
        setToast({ tipo: "exito", mensaje: "Apuesta actualizada." });
      }
    } catch {
      setToast({ tipo: "error", mensaje: "Error de red. Inténtalo de nuevo." });
    } finally {
      setGTrabajando(false);
    }
  };

  const borrarApuesta = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres borrar tu apuesta? No se puede deshacer.")) return;
    setGTrabajando(true);
    try {
      const res = await fetch(`/api/apuestas/${id}`, {
        method: "DELETE",
        headers: { "x-apuesta-codigo": gCodigo.trim() },
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ tipo: "error", mensaje: data.error ?? "No se pudo borrar." });
      } else {
        setEstado(data as EstadoActualDTO);
        olvidarCodigoLocal(id);
        if (codigoNuevo?.id === id) setCodigoNuevo(null);
        cerrarGestion();
        setToast({ tipo: "exito", mensaje: "Apuesta borrada." });
      }
    } catch {
      setToast({ tipo: "error", mensaje: "Error de red. Inténtalo de nuevo." });
    } finally {
      setGTrabajando(false);
    }
  };

  const copiarCodigo = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      setToast({ tipo: "exito", mensaje: "Código copiado al portapapeles." });
    } catch {
      setToast({ tipo: "error", mensaje: "No se pudo copiar el código." });
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
        <p className="animate-pulse text-cesped-300">Cargando porra…</p>
      </main>
    );
  }

  if (errorCarga) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-red-300">{errorCarga}</p>
        <button onClick={cargar} className="btn-primary">
          Reintentar
        </button>
      </main>
    );
  }

  const porra = estado?.porra ?? null;

  if (!porra) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="text-5xl" aria-hidden="true">
          ⚽
        </span>
        <h1 className="text-2xl font-black text-white">Porra de fútbol</h1>
        <p className="max-w-sm text-slate-400">
          Todavía no hay ninguna porra activa. El organizador debe crearla desde el panel de
          administración.
        </p>
        <a href="/admin" className="btn-ghost">
          Ir al panel de administración
        </a>
      </main>
    );
  }

  const finalizada = porra.estado === "FINALIZADA";
  const completa = estado!.completa;
  const admite = estado!.admiteApuestas;
  // Abierta en la BD pero el partido ya ha comenzado: cerrada automáticamente.
  const cerradaPorHora = porra.estado === "ABIERTA" && !admite && !finalizada;
  const estadoVisible = cerradaPorHora ? "CERRADA" : porra.estado;
  const puedeApostar = admite && !completa;
  const pctOcupacion = Math.min(100, Math.round((estado!.numApuestas / MAX_APOSTANTES) * 100));

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
      {/* Cabecera tipo videomarcador */}
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-noche-700 to-noche-950 p-6 shadow-2xl sm:p-8">
        {/* Foco de luz superior */}
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-cesped-500/20 blur-3xl" />

        <div className="relative">
          <Marcador
            local={porra.equipoLocal}
            visitante={porra.equipoVisitante}
            golesLocal={finalizada ? porra.resultadoLocal : undefined}
            golesVisitante={finalizada ? porra.resultadoVisitante : undefined}
          />
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <span className="text-sm font-medium text-slate-400">
              {formatearFecha(porra.fechaPartido)}
              <span className="text-slate-500"> · hora de Barcelona</span>
            </span>
            {!finalizada && <CuentaAtras fechaISO={porra.fechaPartido} />}
            <EstadoBadge estado={estadoVisible} />
          </div>
        </div>
      </header>

      {/* Bote y nº de apuestas */}
      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="stat-card">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Bote actual</p>
          <p className="mt-1 text-3xl font-black text-cesped-300">{formatearEuros(estado!.bote)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Apuestas</p>
          <p className="mt-1 text-3xl font-black text-cesped-300">
            {estado!.numApuestas}
            <span className="text-lg font-bold text-slate-500">/{MAX_APOSTANTES}</span>
          </p>
        </div>
      </section>

      {/* Barra de ocupación */}
      <div className="mt-3 card p-4">
        <div className="flex items-center justify-between text-xs font-medium text-slate-400">
          <span>Plazas ocupadas</span>
          <span className="tabular-nums">
            {estado!.numApuestas}/{MAX_APOSTANTES} · {formatearEuros(porra.precio)} por persona
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cesped-500 to-cesped-300 transition-[width] duration-500"
            style={{ width: `${pctOcupacion}%` }}
          />
        </div>
      </div>

      {/* Panel del código recién generado */}
      {codigoNuevo && (
        <section className="mt-4 animate-rise-in rounded-2xl border border-cesped-400/30 bg-cesped-400/[0.08] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-cesped-200">¡Apuesta registrada! 🍀</h2>
              <p className="mt-1 text-sm text-slate-300">
                Guarda este código para editar o borrar tu apuesta más tarde:
              </p>
            </div>
            <button
              onClick={() => setCodigoNuevo(null)}
              className="text-slate-400 transition hover:text-slate-200"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-xl border border-white/10 bg-noche-950/60 px-4 py-2 font-mono text-2xl font-black tracking-[0.3em] text-cesped-300">
              {codigoNuevo.codigo}
            </span>
            <button onClick={() => copiarCodigo(codigoNuevo.codigo)} className="btn-ghost px-3 py-2 text-sm">
              Copiar
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Se ha guardado en este navegador. Apúntalo si vas a gestionarla desde otro dispositivo.
          </p>
        </section>
      )}

      {/* Banner de resultado / ganadores si finalizada */}
      {finalizada && <BannerGanadores estado={estado!} />}

      {/* Formulario de apuesta */}
      {!finalizada && (
        <section className="mt-6 card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-bold text-white">Haz tu apuesta</h2>

          {!admite && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">
              {cerradaPorHora ? (
                <>
                  Las apuestas se <strong>cerraron</strong> al comenzar el partido.
                </>
              ) : (
                <>
                  La porra está <strong>cerrada</strong>. Ya no se aceptan nuevas apuestas.
                </>
              )}
            </p>
          )}
          {admite && completa && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm font-semibold text-amber-200">
              Porra completa ({MAX_APOSTANTES}/{MAX_APOSTANTES}). No se admiten más apuestas.
            </p>
          )}

          {puedeApostar && (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <div>
                <label htmlFor="nombre" className="label">
                  Tu nombre
                </label>
                <input
                  id="nombre"
                  type="text"
                  required
                  maxLength={40}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Pau"
                  className="input"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Cada nombre debe ser único en esta porra.
                </p>
              </div>

              <fieldset>
                <legend className="label">Tu pronóstico (goles)</legend>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label htmlFor="golesLocal" className="mb-1 block text-xs text-slate-400">
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
                      className="input-score"
                    />
                  </div>
                  <span className="mt-5 text-2xl font-black text-cesped-400">-</span>
                  <div className="flex-1">
                    <label htmlFor="golesVisitante" className="mb-1 block text-xs text-slate-400">
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
                      className="input-score"
                    />
                  </div>
                </div>
              </fieldset>

              <button type="submit" disabled={enviando} className="btn-primary mt-1 w-full">
                {enviando ? "Enviando…" : "Apostar"}
              </button>
            </form>
          )}
        </section>
      )}

      {/* Lista de apuestas */}
      <section className="mt-6 card p-5 sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-white">Apuestas ({estado!.numApuestas})</h2>
        {estado!.apuestas.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Todavía no hay apuestas. ¡Sé el primero!
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {estado!.apuestas.map((a) => {
              const esGanador = estado!.ganadores.some((g) => g.id === a.id);
              const esMia = Boolean(misCodigos[a.id]);
              const gestionando = gestionId === a.id;
              return (
                <li
                  key={a.id}
                  className={`rounded-xl ${
                    esGanador
                      ? "bg-oro-400/10 ring-1 ring-oro-400/30"
                      : gestionando
                        ? "bg-white/[0.05] ring-1 ring-cesped-400/30"
                        : "bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span
                      className={`flex items-center gap-2 font-medium ${
                        esGanador ? "text-oro-300" : "text-slate-200"
                      }`}
                    >
                      {esGanador && <span aria-label="Ganador">🏆</span>}
                      {a.nombre}
                      {esMia && (
                        <span className="rounded-full bg-cesped-400/15 px-2 py-0.5 text-[0.65rem] font-bold text-cesped-300 ring-1 ring-cesped-400/30">
                          tuya
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold tabular-nums text-slate-300">
                        {a.golesLocal} - {a.golesVisitante}
                      </span>
                      {admite && (
                        <button
                          onClick={() => (gestionando ? cerrarGestion() : abrirGestion(a))}
                          className="rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                        >
                          {gestionando ? "Cerrar" : "Gestionar"}
                        </button>
                      )}
                    </span>
                  </div>

                  {gestionando && (
                    <div className="border-t border-white/10 px-3 py-3">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs text-slate-400">
                            {porra.equipoLocal}
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={MAX_GOLES}
                            step={1}
                            value={gLocal}
                            onChange={(e) => setGLocal(e.target.value)}
                            className="input-score"
                          />
                        </div>
                        <span className="mb-2 text-xl font-black text-cesped-400">-</span>
                        <div className="flex-1">
                          <label className="mb-1 block text-xs text-slate-400">
                            {porra.equipoVisitante}
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={MAX_GOLES}
                            step={1}
                            value={gVisitante}
                            onChange={(e) => setGVisitante(e.target.value)}
                            className="input-score"
                          />
                        </div>
                      </div>

                      {!esMia && (
                        <div className="mt-3">
                          <label className="mb-1 block text-xs text-slate-400">
                            Código de tu apuesta
                          </label>
                          <input
                            type="text"
                            value={gCodigo}
                            onChange={(e) => setGCodigo(e.target.value)}
                            placeholder="Ej. K7M2QP"
                            className="input font-mono uppercase tracking-widest"
                          />
                        </div>
                      )}

                      <div className="mt-3 flex gap-2">
                        <button
                          disabled={gTrabajando}
                          onClick={() => guardarEdicion(a.id)}
                          className="btn-primary flex-1 py-2 text-sm"
                        >
                          {gTrabajando ? "Guardando…" : "Guardar cambios"}
                        </button>
                        <button
                          disabled={gTrabajando}
                          onClick={() => borrarApuesta(a.id)}
                          className="btn-danger px-3 py-2 text-sm"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Compartir */}
      <div className="mt-6 flex justify-center">
        <button onClick={copiarEnlace} className="btn-ghost px-4 py-2 text-sm">
          🔗 Copiar enlace
        </button>
      </div>

      <footer className="mt-8 text-center text-xs text-slate-500">
        <a href="/admin" className="underline transition hover:text-slate-300">
          Panel de administración
        </a>
      </footer>

      <Toast data={toast} onClose={() => setToast(null)} />
    </main>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const mapa: Record<string, string> = {
    ABIERTA: "bg-cesped-400/15 text-cesped-300 ring-cesped-400/30",
    CERRADA: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
    FINALIZADA: "bg-slate-400/15 text-slate-300 ring-slate-400/30",
  };
  const puntos: Record<string, string> = {
    ABIERTA: "bg-cesped-400 animate-pulse-dot",
    CERRADA: "bg-amber-400",
    FINALIZADA: "bg-slate-400",
  };
  const etiqueta: Record<string, string> = {
    ABIERTA: "Apuestas abiertas",
    CERRADA: "Apuestas cerradas",
    FINALIZADA: "Finalizada",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ring-1 ${
        mapa[estado] ?? ""
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${puntos[estado] ?? "bg-slate-400"}`} />
      {etiqueta[estado] ?? estado}
    </span>
  );
}

function BannerGanadores({ estado }: { estado: EstadoActualDTO }) {
  const { ganadores } = estado;
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-oro-400/30 bg-oro-400/[0.06] p-5 text-center shadow-glow-gold">
      <h2 className="text-lg font-black text-oro-300">🏁 Resultado final</h2>
      {ganadores.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No hubo apuestas para repartir el bote.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-300">
            {ganadores[0].tipo === "EXACTO"
              ? "Ganador(es) por acierto exacto:"
              : "Nadie acertó el marcador exacto. Ganador(es) por proximidad:"}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {ganadores.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5"
              >
                <span className="font-bold text-oro-200">🏆 {g.nombre}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-sm tabular-nums text-slate-400">
                    {g.golesLocal} - {g.golesVisitante}
                  </span>
                  <span className="font-black text-oro-300">{formatearEuros(g.premio)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
