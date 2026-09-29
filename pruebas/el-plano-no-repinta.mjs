/* El plano no repinta con React mientras el dedo está encima, y el PDF sólo
 * se vuelve a dibujar cuando hace falta.
 *
 * Mike, 29-sep-2026: «Hay que reducir el consumo de recursos de las apps en
 * MÓVIL. Es crítico.» Escogió, con botones, empezar por el plano de quell101.
 *
 * POR QUÉ ESTO SE MIDE CON NÚMEROS Y NO MIRANDO
 *
 * El plano se veía igual antes y después: la diferencia está en cuántas veces
 * por segundo trabaja el teléfono. Hasta hoy cada `pointermove` pasaba por el
 * estado de React y rearmaba todos los pines; y cada pausa del dedo volvía a
 * ejecutar la página del PDF completa con pdf.js. Nada de eso se ve; se
 * cuenta. Aquí se miden las cuentas de `plano.js` con vistas de mentira, y se
 * revisa en el código de la pantalla que el gesto ya no pase por React.
 *
 *   node pruebas/el-plano-no-repinta.mjs
 */

import { readFileSync } from 'node:fs';
import { hojaConMargen, pegado, hayQueRedibujar, mismaSenal, MARGEN, UMBRAL_ZOOM, ESPERA_MS, AREA_MAX_HOJA } from '../web/src/plano.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

console.log('· la hoja del PDF se dibuja con margen, sin reventar la memoria');
let m = hojaConMargen({ w: 780, h: 1688 });          // un celular de 390×844 a densidad 2
rev(Math.abs(m.m - MARGEN) < 1e-9, `en el celular el margen es el completo (${MARGEN}×)`, `${m.m}`);
rev(m.aw === 780 + 2 * m.mx && m.ah === 1688 + 2 * m.my, 'y el tamaño es la pantalla más el margen por los dos lados', `${m.aw}×${m.ah}`);
rev(m.aw * m.ah <= AREA_MAX_HOJA, 'cabe en el tope de píxeles', `${m.aw * m.ah}`);
m = hojaConMargen({ w: 2560, h: 1440 });             // un monitor grande a densidad 1
rev(m.m < MARGEN && m.m >= 1, 'en un monitor grande el margen se encoge en vez de pasarse', `${m.m.toFixed(2)}×`);
rev(m.aw * m.ah <= AREA_MAX_HOJA + 2 * (m.aw + m.ah), 'y queda dentro del tope', `${m.aw * m.ah}`);
m = hojaConMargen({ w: 0, h: 0 });
rev(m.aw > 0 && m.ah > 0, 'sin medidas todavía, no sale una hoja de cero');

console.log('· cuándo se vuelve a pedir la página a pdf.js');
const w = 780, h = 1688, p = 2;
const dib = hojaConMargen({ w, h });
const hv = { x: 100, y: 50, s: 0.4, estirar: 1, mx: dib.mx, my: dib.my, aw: dib.aw, ah: dib.ah, w, h };
rev(hayQueRedibujar({ vv: hv, hv: null, w, h, p }) === 'sin hoja', 'la primera vez, sí');
rev(hayQueRedibujar({ vv: hv, hv, w, h, p }) === null, 'con la misma vista, no');
let vv = { ...hv, x: hv.x + 60, y: hv.y - 80 };     // un paneo corto (60×80 puntos = 120×160 píxeles)
rev(hayQueRedibujar({ vv, hv, w, h, p }) === null, 'un paneo corto se resuelve con lo ya dibujado');
vv = { ...hv, x: hv.x + (dib.mx / p) + 5 };         // se pasó del margen
rev(hayQueRedibujar({ vv, hv, w, h, p }) === 'se salió', 'un paneo que sale del margen, sí', hayQueRedibujar({ vv, hv, w, h, p }));
vv = { ...hv, s: hv.s * 1.15 };
rev(hayQueRedibujar({ vv, hv, w, h, p }) === null, 'un zoom de 15 % se estira, no se redibuja');
vv = { ...hv, s: hv.s * (UMBRAL_ZOOM + 0.05) };
rev(hayQueRedibujar({ vv, hv, w, h, p }) === 'zoom', `un zoom de más de ${Math.round((UMBRAL_ZOOM - 1) * 100)} % sí se redibuja`);
vv = { ...hv, s: hv.s / (UMBRAL_ZOOM + 0.05) };
rev(hayQueRedibujar({ vv, hv, w, h, p }) === 'zoom', 'y alejarse otro tanto, también');
rev(hayQueRedibujar({ vv: hv, hv, w: w + 10, h, p }) === 'tamaño', 'si cambió el tamaño de la caja, sí');
rev(ESPERA_MS >= 400, 'se espera al menos 400 ms quieta antes de dibujar', `${ESPERA_MS} ms`);

console.log('· la hoja se pega donde toca');
let pg = pegado({ vv: hv, hv, p });
rev(pg.x === -dib.mx && pg.y === -dib.my, 'con la misma vista, corrida sólo por el margen', `${pg.x},${pg.y}`);
rev(pg.ancho === dib.aw && pg.alto === dib.ah, 'y del tamaño con que se dibujó');
pg = pegado({ vv: { ...hv, x: hv.x + 10 }, hv, p });
rev(pg.x === -dib.mx + 10 * p, 'un paneo de 10 puntos la corre 10 puntos (a densidad 2, 20 píxeles)', `${pg.x}`);
pg = pegado({ vv: { ...hv, s: hv.s * 2 }, hv, p });
rev(Math.abs(pg.ancho - dib.aw * 2) < 1e-6 && pg.k === 2, 'al doble de zoom se estira al doble');

console.log('· el aviso de la señal no repinta si no cambió');
rev(mismaSenal({ faltan: 0, red: true }, { faltan: 0, red: true }), 'el mismo aviso dos veces es el mismo');
rev(!mismaSenal({ faltan: 0, red: true }, { faltan: 1, red: true }), 'con uno por subir, ya no');
rev(!mismaSenal({ faltan: 0, red: true }, { faltan: 0, red: false }), 'sin señal, tampoco');

console.log('· la pantalla: el gesto no pasa por React');
const pc = readFileSync('web/src/PlanCanvas.jsx', 'utf8');
const onMove = pc.slice(pc.indexOf('const onMove ='), pc.indexOf('const onUp ='));
rev(!/setV\(/.test(onMove) && /aplica\([^;]*, false\)/.test(onMove), 'al mover el dedo, `aplica` va sin comprometer: nada de setV');
const desdeUp = pc.indexOf('const onUp =');
const onUp = pc.slice(desdeUp, pc.indexOf('return (', desdeUp));
rev(/setV\(vista\.current\)/.test(onUp), 'al soltar, React se entera una sola vez');
rev(/ref=\{mundo\} className="world"(?![^>]*transform)/.test(pc), 'la capa de los pines no lleva la transformación como estilo de React');
rev(!/scale\(\$\{1 \/ v\.s\}\)/.test(pc), 'y los pines ya no reciben un estilo nuevo con cada zoom');
rev(/setProperty\('--k'/.test(pc), 'el tamaño de los pines es una sola variable en la capa');
const css = readFileSync('web/src/styles.css', 'utf8');
rev(/\.pin\{[^}]*scale\(var\(--k,1\)\)/.test(css), 'y el CSS del pin la usa');
rev(/hayQueRedibujar\(\{ vv, hv: hojaVista\.current/.test(pc), 'el PDF pregunta si hace falta antes de dibujar');
rev(/!document\.hidden\) dibujaPdf\(\)/.test(pc), 'y no dibuja con la pestaña oculta');
rev(/\}, ESPERA_MS\);/.test(pc), 'con la espera de plano.js');

console.log('· la app: el reintento de cada minuto ya no despierta al teléfono en vano');
const app = readFileSync('web/src/App.jsx', 'utf8');
rev(/visibilityState === 'visible' && faltan\.current > 0/.test(app), 'sólo con la pestaña a la vista y algo por subir');
rev(/mismaSenal\(antes, n\) \? antes : n/.test(app), 'un aviso igual no repinta');
rev(/useMemo\(\(\) => \(\{\s*user,/.test(app), 'el contexto no es un objeto nuevo en cada pintada');
const html = readFileSync('web/index.html', 'utf8');
rev(!/splash101-flotar 9s ease-in-out infinite/.test(html), 'el plano del arranque no flota para siempre');

console.log(`\n${revisadas} revisadas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
