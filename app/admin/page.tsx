"use client";

import { useCallback, useEffect, useState } from "react";
import { Toast, type ToastData } from "@/components/Toast";
import { formatearEuros, formatearFecha } from "@/lib/format";
import { MAX_APOSTANTES, MAX_GOLES, type EstadoActualDTO } from "@/lib/types";

export default function AdminPage() {
  // null = comprobando la sesión; false = hay que iniciar sesión; true = dentro.
  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [totpRequerido, setTotpRequerido] = useState(true);
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);

  const [estado, setEstado] = useState<EstadoActualDTO | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  // Comprueba la sesión al montar.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/session", { cache: "no-store" });
        const data = await res.json();
        setTotpRequerido(Boolean(data.totpRequerido));
        setAutenticado(Boolean(data.autenticado));
      } catch {
        setAutenticado(false);
      }
    })();
  }, []);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/porra", { cache: "no-store" });
      const data: EstadoActualDTO = await res.json();
      setEstado(data);
    } catch {
      setToast({ tipo: "error", mensaje: "No se pudo cargar el estado." });
    }
  }, []);

  // Al autenticarse, carga el estado.
  useEffect(() => {
    if (autenticado) cargar();
  }, [autenticado, cargar]);

  /** La sesión ya no vale: vuelve a la pantalla de login. */
  const forzarLogin = useCallback(() => {
    setAutenticado(false);
    setEstado(null);
    setAvisoLogin("Tu sesión ha caducado. Vuelve a iniciar sesión.");
  }, []);

  /** Mutación del panel; la autoriza la cookie de sesión (no se envía el PIN). */
  const peticion = async (
    metodo: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
    mensajeExito: string,
  ) => {
    setTrabajando(true);
    try {
      const res = await fetch("/api/porra", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        forzarLogin();
        return false;
      }
      const data = await res.json();
      if (!res.ok) {
        setToast({ tipo: "error", mensaje: data.error ?? "Operación fallida." });
        return false;
      }
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

  /** Borra una apuesta concreta (rescate del administrador). */
  const eliminarApuesta = async (id: string) => {
    if (!window.confirm("¿Borrar esta apuesta? (rescate de administración)")) return;
    setTrabajando(true);
    try {
      const res = await fetch(`/api/apuestas/${id}`, { method: "DELETE" });
      if (res.status === 401) {
        forzarLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setToast({ tipo: "error", mensaje: data.error ?? "No se pudo borrar la apuesta." });
        return;
      }
      setEstado(data);
      setToast({ tipo: "exito", mensaje: "Apuesta borrada." });
    } catch {
      setToast({ tipo: "error", mensaje: "Error de red. Inténtalo de nuevo." });
    } finally {
      setTrabajando(false);
    }
  };

  const cerrarSesion = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Aunque falle la red, cerramos la sesión en el cliente.
    }
    setEstado(null);
    setAutenticado(false);
    setAvisoLogin(null);
  };

  // ---- Render ----
  if (autenticado === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
        <p className="animate-pulse text-cesped-300">Cargando…</p>
      </main>
    );
  }

  if (!autenticado) {
    return (
      <LoginAdmin
        totpRequerido={totpRequerido}
        avisoInicial={avisoLogin}
        onAutenticado={() => {
          setAvisoLogin(null);
          setAutenticado(true);
        }}
      />
    );
  }

  const porra = estado?.porra ?? null;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-white">⚙️ Administración</h1>
        <div className="flex items-center gap-4 text-sm">
          <a href="/" className="text-cesped-300 underline transition hover:text-cesped-200">
            Ver porra
          </a>
          <button
            onClick={cerrarSesion}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 transition hover:bg-white/[0.08]"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {estado === null ? (
        <p className="animate-pulse text-center text-cesped-300">Cargando…</p>
      ) : porra ? (
        <GestionPorra
          estado={estado}
          trabajando={trabajando}
          peticion={peticion}
          eliminarApuesta={eliminarApuesta}
          onToast={setToast}
          onSesionCaducada={forzarLogin}
        />
      ) : (
        <CrearPorra trabajando={trabajando} peticion={peticion} />
      )}

      <Toast data={toast} onClose={() => setToast(null)} />
    </main>
  );
}

/** Pantalla de login con doble factor: PIN y, si procede, código TOTP. */
function LoginAdmin({
  totpRequerido,
  avisoInicial,
  onAutenticado,
}: {
  totpRequerido: boolean;
  avisoInicial: string | null;
  onAutenticado: () => void;
}) {
  const [fase, setFase] = useState<"pin" | "codigo">("pin");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(avisoInicial);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fase === "pin" ? { pin } : { pin, code }),
      });
      const data = await res.json();
      if (res.ok && data.requiereCodigo) {
        setFase("codigo");
        return;
      }
      if (res.ok && data.autenticado) {
        onAutenticado();
        return;
      }
      setError(data.error ?? "No se pudo iniciar sesión.");
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-black text-white">⚙️ Administración</h1>
        <p className="mt-1 text-sm text-slate-400">Acceso restringido al organizador.</p>
      </header>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-white">Iniciar sesión</h2>

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
          {fase === "pin" ? (
            <div>
              <label htmlFor="pin" className="label">
                PIN de administración
              </label>
              <input
                id="pin"
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Introduce el PIN"
                autoComplete="current-password"
                autoFocus
                className="input"
              />
            </div>
          ) : (
            <div>
              <p className="mb-3 text-sm text-slate-300">
                Introduce el código de 6 dígitos de tu app de autenticación.
              </p>
              <label htmlFor="code" className="label">
                Código de verificación
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d*"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                autoFocus
                className="input text-center font-mono text-xl tracking-[0.4em]"
              />
            </div>
          )}

          <button type="submit" disabled={enviando} className="btn-primary w-full">
            {enviando
              ? fase === "pin"
                ? "Comprobando…"
                : "Verificando…"
              : fase === "pin"
                ? totpRequerido
                  ? "Continuar"
                  : "Entrar"
                : "Verificar"}
          </button>

          {fase === "codigo" && (
            <button
              type="button"
              onClick={() => {
                setFase("pin");
                setCode("");
                setError(null);
              }}
              className="text-center text-xs text-slate-400 underline transition hover:text-slate-200"
            >
              Volver
            </button>
          )}
        </form>
      </section>

      <p className="mt-4 text-center text-xs text-slate-500">
        <a href="/" className="underline transition hover:text-slate-300">
          Volver a la porra
        </a>
      </p>
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
        // Se envía la hora de pared tal cual; el servidor la interpreta SIEMPRE
        // como hora de Barcelona, sin depender de la zona del organizador.
        fechaPartido: fecha,
        precio: precio === "" ? null : Number(precio),
      },
      "Porra creada correctamente.",
    );
  };

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-white">Crear porra</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="local" className="label">
            Equipo local
          </label>
          <input
            id="local"
            type="text"
            required
            maxLength={40}
            value={equipoLocal}
            onChange={(e) => setEquipoLocal(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="visitante" className="label">
            Equipo visitante
          </label>
          <input
            id="visitante"
            type="text"
            required
            maxLength={40}
            value={equipoVisitante}
            onChange={(e) => setEquipoVisitante(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="fecha" className="label">
            Fecha y hora del partido <span className="text-slate-400">(hora de Barcelona)</span>
          </label>
          <input
            id="fecha"
            type="datetime-local"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="input [color-scheme:dark]"
          />
        </div>
        <div>
          <label htmlFor="precio" className="label">
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
            className="input"
          />
        </div>
        <button type="submit" disabled={trabajando} className="btn-primary w-full">
          {trabajando ? "Creando…" : "Crear porra"}
        </button>
      </form>
    </section>
  );
}

/** Gestión de una porra existente: invitaciones, cerrar, finalizar, reiniciar. */
function GestionPorra({
  estado,
  trabajando,
  peticion,
  eliminarApuesta,
  onToast,
  onSesionCaducada,
}: {
  estado: EstadoActualDTO;
  trabajando: boolean;
  peticion: PeticionFn;
  eliminarApuesta: (id: string) => void;
  onToast: (t: ToastData) => void;
  onSesionCaducada: () => void;
}) {
  const porra = estado.porra!;
  // Abierta en la BD pero el partido ya empezó: cerrada automáticamente por hora.
  const cerradaPorHora = porra.estado === "ABIERTA" && !estado.admiteApuestas;
  const [resLocal, setResLocal] = useState("");
  const [resVisitante, setResVisitante] = useState("");
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);

  const cerrar = async () => {
    if (
      !window.confirm(
        "¿Cerrar las apuestas? Es IRREVERSIBLE: la porra no se podrá reabrir e invalida " +
          "todas las invitaciones emitidas. Para empezar de nuevo habría que reiniciarla.",
      )
    ) {
      return;
    }
    await peticion("PATCH", { accion: "CERRAR" }, "Apuestas cerradas.");
  };

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
      <section className="card p-5">
        <h2 className="mb-3 text-lg font-bold text-white">
          {porra.equipoLocal} <span className="text-slate-500">vs</span> {porra.equipoVisitante}
        </h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-400">Estado</dt>
          <dd className="text-right font-semibold text-slate-100">
            {porra.estado}
            {cerradaPorHora && (
              <span className="ml-1 font-normal text-amber-300">(cerrada por hora)</span>
            )}
          </dd>
          <dt className="text-slate-400">Fecha</dt>
          <dd className="text-right text-slate-100">{formatearFecha(porra.fechaPartido)}</dd>
          <dt className="text-slate-400">Precio</dt>
          <dd className="text-right text-slate-100">{formatearEuros(porra.precio)}</dd>
          <dt className="text-slate-400">Apuestas</dt>
          <dd className="text-right text-slate-100">
            {estado.numApuestas}/{MAX_APOSTANTES}
          </dd>
          <dt className="text-slate-400">Bote</dt>
          <dd className="text-right font-bold text-cesped-300">{formatearEuros(estado.bote)}</dd>
        </dl>
      </section>

      {/* Invitaciones: sólo si la porra admite apuestas y no está llena (coincide
          con la guarda del servidor en POST /api/invitaciones). */}
      {estado.admiteApuestas && !estado.completa && (
        <SeccionInvitaciones onToast={onToast} onSesionCaducada={onSesionCaducada} />
      )}

      {/* Cerrar apuestas (irreversible) */}
      {porra.estado === "ABIERTA" && (
        <section className="card p-5">
          <h3 className="mb-3 font-bold text-white">Cerrar apuestas</h3>
          <p className="mb-3 text-xs text-slate-400">
            Cierra la porra antes de la hora del partido. Es <strong>irreversible</strong> y deja
            sin efecto todas las invitaciones emitidas.
          </p>
          <button
            disabled={trabajando}
            onClick={cerrar}
            className="btn-amber w-full py-2"
          >
            Cerrar apuestas
          </button>
        </section>
      )}

      {/* Finalizar con resultado */}
      {porra.estado !== "FINALIZADA" ? (
        <section className="card p-5">
          <h3 className="mb-3 font-bold text-white">Introducir resultado y finalizar</h3>
          <form onSubmit={finalizar} className="flex flex-col gap-4" noValidate>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="resLocal" className="mb-1 block text-xs text-slate-400">
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
                  className="input-score"
                />
              </div>
              <span className="mb-2 text-2xl font-black text-cesped-400">-</span>
              <div className="flex-1">
                <label htmlFor="resVisitante" className="mb-1 block text-xs text-slate-400">
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
                  className="input-score"
                />
              </div>
            </div>
            <button type="submit" disabled={trabajando} className="btn-primary w-full">
              {trabajando ? "Procesando…" : "Finalizar y calcular ganadores"}
            </button>
          </form>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-oro-400/30 bg-oro-400/[0.06] p-5 shadow-glow-gold">
          <h3 className="font-bold text-oro-300">
            Resultado: {porra.resultadoLocal} - {porra.resultadoVisitante}
          </h3>
          {estado.ganadores.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {estado.ganadores.map((g) => (
                <li
                  key={g.id}
                  className="flex justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5"
                >
                  <span className="font-semibold text-oro-200">🏆 {g.nombre}</span>
                  <span className="font-bold text-oro-300">{formatearEuros(g.premio)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-400">No hubo apuestas.</p>
          )}
        </section>
      )}

      {/* Apuestas registradas (rescate: borrar una concreta) */}
      <section className="card p-5">
        <h3 className="mb-3 font-bold text-white">Apuestas ({estado.numApuestas})</h3>
        {estado.apuestas.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no hay apuestas.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {estado.apuestas.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2.5"
              >
                <span className="font-medium text-slate-200">{a.nombre}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-300">
                    {a.golesLocal} - {a.golesVisitante}
                  </span>
                  {porra.estado !== "FINALIZADA" && (
                    <button
                      disabled={trabajando}
                      onClick={() => eliminarApuesta(a.id)}
                      className="rounded-lg border border-red-500/30 px-2 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Borrar
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Rescate para quien haya perdido su código. No disponible una vez finalizada la porra.
        </p>
      </section>

      {/* Reiniciar */}
      <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
        <h3 className="mb-2 font-bold text-red-300">Zona peligrosa</h3>
        <p className="mb-3 text-sm text-red-200/80">
          Reiniciar borra la porra actual y todas sus apuestas. Esta acción no se puede deshacer.
        </p>
        {confirmarReinicio ? (
          <div className="flex gap-3">
            <button
              disabled={trabajando}
              onClick={reiniciar}
              className="btn-danger flex-1 py-2"
            >
              Sí, borrar todo
            </button>
            <button
              disabled={trabajando}
              onClick={() => setConfirmarReinicio(false)}
              className="btn-ghost flex-1 py-2"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmarReinicio(true)} className="btn-danger py-2">
            Reiniciar porra
          </button>
        )}
      </section>
    </div>
  );
}

/**
 * Genera enlaces de invitación (uno por nombre). Cada enlace autoriza a apostar
 * exactamente con ese nombre en la porra activa. La firma se calcula en el
 * servidor; aquí sólo se muestran y se copian los enlaces resultantes.
 */
function SeccionInvitaciones({
  onToast,
  onSesionCaducada,
}: {
  onToast: (t: ToastData) => void;
  onSesionCaducada: () => void;
}) {
  const [nombres, setNombres] = useState("");
  const [generando, setGenerando] = useState(false);
  const [enlaces, setEnlaces] = useState<{ nombre: string; url: string }[]>([]);

  const generar = async () => {
    const lista = nombres
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lista.length === 0) {
      onToast({ tipo: "error", mensaje: "Escribe al menos un nombre." });
      return;
    }
    setGenerando(true);
    try {
      const res = await fetch("/api/invitaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombres: lista }),
      });
      if (res.status === 401) {
        onSesionCaducada();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        onToast({
          tipo: "error",
          mensaje: data.error ?? "No se pudieron generar las invitaciones.",
        });
        return;
      }
      const generadas: { nombre: string; url: string }[] = data.invitaciones ?? [];
      setEnlaces(generadas);
      onToast({ tipo: "exito", mensaje: `${generadas.length} invitación(es) generada(s).` });
    } catch {
      onToast({ tipo: "error", mensaje: "Error de red. Inténtalo de nuevo." });
    } finally {
      setGenerando(false);
    }
  };

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + url);
      onToast({ tipo: "exito", mensaje: "Enlace copiado al portapapeles." });
    } catch {
      onToast({ tipo: "error", mensaje: "No se pudo copiar el enlace." });
    }
  };

  return (
    <section className="card p-5">
      <h3 className="mb-1 font-bold text-white">Invitaciones</h3>
      <p className="mb-3 text-xs text-slate-400">
        Un nombre por línea. Cada persona recibe un enlace personal: sólo con él podrá apostar,
        y exactamente con ese nombre.
      </p>
      <textarea
        value={nombres}
        onChange={(e) => setNombres(e.target.value)}
        rows={4}
        placeholder={"Ana\nLuis\nNuria"}
        className="input font-mono"
      />
      <button disabled={generando} onClick={generar} className="btn-primary mt-3 w-full">
        {generando ? "Generando…" : "Generar invitaciones"}
      </button>

      {enlaces.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {enlaces.map((e) => (
            <li
              key={e.nombre}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-200">{e.nombre}</span>
                <span className="block truncate font-mono text-xs text-slate-500">{e.url}</span>
              </span>
              <button onClick={() => copiar(e.url)} className="btn-ghost px-3 py-1.5 text-xs">
                Copiar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
