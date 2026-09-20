/* Que el plano se pueda IMPRIMIR y se lea, medido sobre lo armado.
 *
 * Mike, 20-sep-2026: «quiero poder imprimir el plano de quell pero enfocado
 * a que la impresión salga, con el plano ligeramente claro (un 75% de
 * opacidad) y los círculos de ítems en sus colores bien, pero el código del
 * ítem en letra más legible, de unos 6-8 pts».
 *
 * POR QUÉ ESTO ES UNA PRUEBA Y NO UN «ya quedó»
 *
 * Una impresión no se rompe con un error: se degrada en silencio. Si alguien
 * quita `print-color-adjust: exact` en una limpieza de estilos, la app se ve
 * idéntica en pantalla y los círculos salen todos blancos en la hoja —el
 * navegador tira los fondos al imprimir para ahorrar tinta—. Nadie se entera
 * hasta que un plano llega a obra sin poder distinguir un tipo de otro.
 * Igual con el tamaño del código: en píxeles se imprime a lo que quedó del
 * zoom, no a lo que se pidió.
 *
 * Se mide sobre `web/dist`, que es lo que se publica, y también sobre el
 * fuente del lienzo, porque el encuadre al imprimir vive ahí.
 *
 *   npm run build && node pruebas/impresion.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const dir = 'web/dist/assets';
const cssNombre = readdirSync(dir).find((f) => f.endsWith('.css'));
const css = cssNombre ? readFileSync(`${dir}/${cssNombre}`, 'utf8') : '';
const sinEspacios = css.replace(/\s+/g, '');

console.log('· el bloque de impresión llegó a lo armado');
rev(Boolean(cssNombre), 'hay hoja de estilos armada', cssNombre || 'no se encontró');
rev(/@media\s*print/.test(css), 'trae un bloque @media print');

console.log('· el plano más claro, y sólo el plano');
rev(sinEspacios.includes('.hoja{opacity:.75}') || sinEspacios.includes('.hoja{opacity:0.75}'),
    'el lienzo del plano va al 75 %');

console.log('· los círculos conservan su color en la hoja');
rev(/print-color-adjust:\s*exact/.test(css), 'se pide print-color-adjust: exact');

console.log('· el código del ítem, en puntos y entre 6 y 8');
const enPuntos = [...css.matchAll(/font-size:\s*([\d.]+)pt/g)].map((m) => Number(m[1]));
rev(enPuntos.length > 0, 'hay al menos un tamaño en pt', JSON.stringify(enPuntos));
rev(enPuntos.some((n) => n >= 6 && n <= 8), 'y cae en el rango que pidió Mike', JSON.stringify(enPuntos));

console.log('· el encuadre antes de imprimir');
const lienzo = readFileSync('web/src/PlanCanvas.jsx', 'utf8');
rev(lienzo.includes("'beforeprint'"), 'el lienzo se ajusta al oír beforeprint');
rev(lienzo.includes("'afterprint'"), 'y deja la vista como estaba al terminar');

console.log('· y hay por dónde pedirla');
rev(readFileSync('web/src/Project.jsx', 'utf8').includes('window.print()'), 'el botón de imprimir existe');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
