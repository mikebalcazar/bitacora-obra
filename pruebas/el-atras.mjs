/* El botón «atrás» del navegador regresa a la función anterior.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior, que usualmente es la pantalla
 * inicial (…). Hay funciones que son 3 o 4 clics para llegar y si le picas
 * back al navegador te saca y pierdes la ruta de navegación que habías
 * hecho».
 *
 * Escogió, con botones: atrás deshace «el último paso hacia adentro», y
 * alternar pestañas NO cuenta como paso.
 *
 * POR QUÉ ESTO SE MIDE CON UN HISTORIAL DE MENTIRAS, Y NO MIRANDO
 *
 * Lo que puede romperse aquí no se ve en una pantalla: se ve tres toques
 * después. Un `pushState` de más y el usuario tiene que picar atrás dos
 * veces para cerrar una ventana; uno de menos y atrás lo saca de la app. Las
 * dos fallas se ven idénticas mientras pruebas —la pantalla queda bien—, y
 * sólo se notan al caminar el recorrido completo.
 *
 * Así que se camina el recorrido completo, contando entradas. El doble de
 * `history` de aquí abajo es una pila de verdad: apila, reemplaza y
 * retrocede como la del navegador, y si el módulo apila de más, se ve en el
 * conteo.
 *
 *   node pruebas/el-atras.mjs
 */

import { readFileSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

/* ── un navegador de mentiras, con su pila de historial ───────────────── */
function navegadorFalso() {
  const pila = [{ estado: { hondura: 0 }, url: '#/' }];
  let i = 0;
  const oyentes = { popstate: [], hashchange: [] };
  const avisa = (qué) => oyentes[qué].slice().forEach((f) => f());
  const history = {
    get state() { return pila[i].estado; },
    pushState(estado, _t, url) { pila.splice(i + 1); pila.push({ estado, url: url ?? pila[i].url }); i = pila.length - 1; },
    replaceState(estado, _t, url) { pila[i] = { estado, url: url ?? pila[i].url }; },
    back() { if (i > 0) { i--; avisa('popstate'); avisa('hashchange'); } },
  };
  const location = {
    get hash() { const u = pila[i].url; return u.startsWith('#') ? u : ''; },
    // Asignar el hash empuja una entrada con estado nulo, igual que el
    // navegador de verdad. Así es como la app entra a una obra.
    set hash(v) { pila.splice(i + 1); pila.push({ estado: null, url: v }); i = pila.length - 1; avisa('hashchange'); },
    href: 'http://x/',
  };
  return {
    history, location,
    addEventListener: (qué, f) => oyentes[qué] && oyentes[qué].push(f),
    removeEventListener: (qué, f) => { const l = oyentes[qué]; if (l) l.splice(l.indexOf(f), 1); },
    dispatchEvent: () => avisa('hashchange'),
    HashChangeEvent: class {},
    cuantas: () => pila.length,
    dónde: () => pila[i].url,
  };
}

// El módulo se carga con el navegador falso puesto en los globales, para
// medir EL MISMO código que corre en la app y no una copia.
const g = navegadorFalso();
globalThis.history = g.history;
globalThis.location = g.location;
globalThis.window = { addEventListener: g.addEventListener, removeEventListener: g.removeEventListener, dispatchEvent: g.dispatchEvent };
globalThis.HashChangeEvent = g.HashChangeEvent;
const { HONDURA, irA, sellar, alAbrir } = await import('../web/src/navegar.js');

const seccion = (v) => irA(`/p/OBRA${v && v !== 'plan' ? '/' + v : ''}`, v && v !== 'plan' ? HONDURA.seccion : HONDURA.obra);

console.log('· el recorrido de cuatro clics, y atrás paso por paso');
g.location.hash = '#/p/OBRA';   // como entra la app desde el inicio
sellar(HONDURA.obra);           // y la pantalla sella su nivel al montarse
rev(g.dónde() === '#/p/OBRA', '1· se entra a la obra');
seccion('lista');
rev(g.dónde() === '#/p/OBRA/lista', '2· se abre la lista');
irA('/p/OBRA/e/M1', HONDURA.item);
rev(g.dónde() === '#/p/OBRA/e/M1', '3· se abre un ítem');
let ventanaAbierta = true;
const cerrarVentana = alAbrir(() => { ventanaAbierta = false; });
rev(g.cuantas() === 5, '4· la ventana encima deja su entrada', `${g.cuantas()} entradas`);

g.history.back();
rev(!ventanaAbierta && g.dónde() === '#/p/OBRA/e/M1', 'atrás cierra la ventana y deja el ítem');
g.history.back();
rev(g.dónde() === '#/p/OBRA/lista', 'atrás cierra el ítem y regresa a la lista');
g.history.back();
rev(g.dónde() === '#/p/OBRA', 'atrás regresa de la lista al plano');
g.history.back();
rev(g.dónde() === '#/', 'atrás sale de la obra al inicio');

console.log('· alternar pestañas no acumula: es lo que Mike pidió expresamente');
g.location.hash = '#/p/OBRA';
sellar(HONDURA.obra);
const antes = g.cuantas();
for (let n = 0; n < 5; n++) { seccion('lista'); seccion('plan'); seccion('dudas'); }
/* Una sola entrada nueva —la del primer paso del plano a una sección, que
 * SÍ es un paso— y ni una más por los catorce toques siguientes. Eso es
 * exactamente «de ida y vuelta no cuenta». */
rev(g.cuantas() === antes + 1, 'quince toques de pestaña dejan UNA sola entrada', `${g.cuantas()} vs ${antes}`);
g.history.back();
rev(g.dónde() === '#/p/OBRA', 'atrás regresa al plano, no a quince pestañas atrás', g.dónde());
g.history.back();
rev(g.dónde() === '#/', 'y el siguiente sale de la obra');

console.log('· cerrar con el botón propio no deja basura');
/* Si la entrada se quedara puesta, el siguiente «atrás» reabriría lo que la
 * persona acaba de cerrar — que es peor que el defecto original, porque
 * parece que la app se devolvió sola. */
g.location.hash = '#/p/OBRA';
sellar(HONDURA.obra);
const base = g.cuantas();
let abierta = true;
const cerrar = alAbrir(() => { abierta = false; });
rev(g.cuantas() === base + 1, 'abrir la ventana apila una');
cerrar();
rev(g.cuantas() === base + 1 && g.dónde() === '#/p/OBRA',
    'cerrarla con su botón consume la entrada, no apila otra', `${g.cuantas()} entradas`);

console.log('· ir a donde ya estás no hace nada');
const quietas = g.cuantas();
seccion('plan'); seccion('plan'); seccion('plan');
rev(g.cuantas() === quietas, 'tres toques al plano estando en el plano', `${g.cuantas()} vs ${quietas}`);

console.log('· y la pantalla está cableada a esto, no a variables sueltas');
const proyecto = readFileSync('web/src/Project.jsx', 'utf8');
rev(!/useState\(null\);?\s*$/m.test(proyecto.match(/const \[sel,[^\n]*/)?.[0] || ''),
    '`sel` ya no es un useState: sale de la dirección');
rev(/const sel = trozos\[0\] === 'e'/.test(proyecto), 'el ítem abierto se lee del hash');
rev(/const vista = \['lista', 'dudas'\]\.includes/.test(proyecto), 'y la sección también');
rev(!/setSel\(/.test(proyecto), 'no queda ningún `setSel` que se salte el historial');
const cuantasVentanas = (proyecto.match(/useEncima\(/g) || []).length;
rev(cuantasVentanas >= 6, 'cada ventana de la obra avisa al historial', `${cuantasVentanas} ventanas`);

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
