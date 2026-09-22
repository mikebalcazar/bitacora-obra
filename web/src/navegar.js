/* El botón «atrás» del navegador, que hasta hoy sacaba de la app.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior, que usualmente es la pantalla
 * inicial. Queremos que cuando picas back te regrese a la función anterior.
 * Hay funciones que son 3 o 4 clics para llegar y si le picas back al
 * navegador te saca y pierdes la ruta de navegación que habías hecho».
 *
 * LA CAUSA, QUE ES LA MISMA EN TODAS
 *
 * La navegación de adentro vivía en memoria: abrir un ítem, una pestaña o un
 * visor cambiaba una variable de la pantalla, no la dirección. Para el
 * navegador nunca pasó nada, así que su historial tenía una sola entrada y
 * «atrás» era «salir de la app».
 *
 * QUÉ CUENTA COMO PASO — la decisión de Mike, con botones, el 22-sep
 *
 * Escogió «el último paso hacia adentro»: atrás cierra el visor, luego el
 * ítem, luego regresa de la lista al plano, luego de la obra al inicio. Y
 * cambiar de pestaña de ida y vuelta NO cuenta como paso: si anduvo
 * alternando plano y lista cinco veces, no tiene que picar atrás cinco veces
 * para salir.
 *
 * Eso se sostiene con una sola idea: cada pantalla tiene una HONDURA.
 *
 *     0  el inicio: la lista de obras
 *     1  el plano de una obra         (donde se cae al entrar)
 *     2  la lista, las dudas          (hermanas del plano)
 *     3  un ítem abierto
 *     4  lo que se abre encima del ítem: el visor de archivos, un modal
 *
 * El inicio tiene su propio nivel, y no es un detalle: si compartiera el de
 * la obra, entrar a una obra la REEMPLAZARÍA en vez de apilarla y el primer
 * «atrás» saltaría fuera de la app — el mismo defecto que se está
 * arreglando, escondido un nivel más abajo.
 *
 * Y una sola regla:
 *
 *   · ir MÁS HONDO empuja una entrada nueva → atrás regresa a donde estabas;
 *   · moverse al MISMO nivel la reemplaza    → alternar no acumula nada;
 *   · salir a MENOS hondo es `history.back()` → se consume la que había, en
 *     vez de apilar una tercera que habría que deshacer dos veces.
 *
 * La tercera es la que no es obvia y la que evita el historial de basura:
 * cerrar un ítem con la ✕ tiene que dejar el historial igual que si se
 * hubiera picado «atrás», porque si no, el siguiente «atrás» vuelve a abrir
 * el ítem que la persona acaba de cerrar.
 *
 * DE PASO, LAS LIGAS SIRVEN
 *
 * Como la hondura viaja en la dirección, `#/p/OBRA/e/ITEM` abre ese ítem. Se
 * puede mandar por WhatsApp y le abre ahí a quien la reciba, que es lo que
 * hoy no se podía hacer.
 */

/** Cuán hondo está cada tipo de pantalla. Vive aquí y no repartido por la
 *  app: si cada pantalla decidiera su nivel, dos decidirían distinto y el
 *  historial se volvería impredecible justo cuando alguien anda de prisa. */
export const HONDURA = { inicio: 0, obra: 1, seccion: 2, item: 3, encima: 4 };

/** La hondura de donde estamos parados. Se guarda en el estado del historial
 *  y no en una variable del módulo: una variable se pierde al recargar y con
 *  ella la cuenta, y entonces el primer «atrás» después de recargar haría
 *  cualquier cosa. */
export const honduraActual = () => {
  const h = history.state && history.state.hondura;
  return typeof h === 'number' ? h : 0;
};

/**
 * Dejar apuntada la hondura de la pantalla en la que se acaba de caer.
 *
 * Hace falta porque a una pantalla no siempre se llega navegando: se llega
 * abriendo una liga que alguien mandó por WhatsApp, recargando, o volviendo
 * de la pantalla de entrada. En esos casos el navegador pone el estado en
 * nulo, y sin hondura apuntada el módulo creería que está en el inicio —y
 * el siguiente paso apilaría una entrada de más, que el usuario tendría que
 * deshacer dos veces—.
 *
 * Reemplaza, nunca apila: sellar dónde estás no es moverte.
 */
export function sellar(hondura) {
  if (honduraActual() === hondura && history.state) return;
  // Con `null` de dirección, la barra no se toca: es lo que quiere decir
  // «sólo estoy apuntando dónde estoy». Reconstruirla desde `location.href`
  // funcionaba, pero hacía que sellar dependiera de leer bien la dirección,
  // que es justo lo que no hace falta aquí.
  history.replaceState({ ...(history.state || {}), hondura }, '', null);
}

/**
 * Ir a una dirección de la app, apilando o no según a dónde se va.
 *
 * `ruta` es el hash sin el `#`, p. ej. `/p/OBRA/e/ITEM`.
 */
export function irA(ruta, hondura) {
  const destino = '#' + (ruta.startsWith('/') ? ruta : '/' + ruta);
  const ahora = honduraActual();

  // Ya estamos ahí: no se hace nada. Sin esto, volver a picar la pestaña en
  // la que ya estás dejaría una entrada por cada toque.
  if (location.hash === destino && hondura === ahora) return;

  if (hondura > ahora) {
    history.pushState({ hondura }, '', destino);
  } else if (hondura === ahora) {
    history.replaceState({ hondura }, '', destino);
  } else {
    // Salir hacia afuera. Si atrás lleva justo a donde queremos ir, se usa
    // el historial en vez de escribir encima: así la entrada se consume y no
    // queda una hacia adelante que reabra lo que se acaba de cerrar.
    history.back();
    return;
  }
  // `pushState` y `replaceState` no disparan `hashchange`, así que la app no
  // se enteraría. Se avisa a mano, con el mismo evento que ya escucha.
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Para lo que se abre ENCIMA y no tiene dirección propia: un modal, un
 * cajón, un menú. Se llama al abrir; devuelve la función de cerrar.
 *
 *   const cerrar = alAbrir(() => setModal(false));
 *
 * Mientras esté abierto, «atrás» lo cierra en vez de salir de la app. Y
 * cerrarlo con su propio botón consume la entrada, para que el historial
 * quede como si nunca se hubiera abierto.
 */
export function alAbrir(cerrar) {
  const marca = 'encima-' + Math.random().toString(36).slice(2, 8);
  history.pushState({ hondura: honduraActual(), encima: marca }, '', null);

  let vivo = true;
  const volver = () => {
    if (!vivo) return;
    vivo = false;
    window.removeEventListener('popstate', volver);
    cerrar();
  };
  window.addEventListener('popstate', volver);

  // Cerrar con el botón propio: se quita el oyente ANTES de retroceder, para
  // que el `popstate` que provoca no vuelva a llamar a `cerrar` —que ya se
  // está ejecutando— y se cierre dos cosas de un golpe.
  return () => {
    if (!vivo) return;
    vivo = false;
    window.removeEventListener('popstate', volver);
    if (history.state && history.state.encima === marca) history.back();
  };
}

/* ── para React: una línea por ventana ─────────────────────────────────── */

import { useEffect, useRef } from 'react';

/**
 * Hace que «atrás» cierre lo que está abierto encima.
 *
 *     useEncima(!!report, () => setReport(false));
 *
 * Declarativo a propósito: cablear `alAbrir` en cada botón que abre —y
 * acordarse de hacerlo en cada botón que cierra— es donde se cuelan los
 * olvidos, y el síntoma sería un «atrás» que a veces saca de la app. Aquí
 * basta con decir qué está abierto y cómo se cierra.
 */
export function useEncima(abierto, cerrar) {
  // La función de cerrar cambia en cada pintada; guardarla en un ref evita
  // que el efecto se desmonte y se vuelva a montar —lo que empujaría una
  // entrada de historial por cada pintada de la pantalla—.
  const ref = useRef(cerrar);
  ref.current = cerrar;
  useEffect(() => {
    if (!abierto) return undefined;
    return alAbrir(() => ref.current());
  }, [abierto]);
}
