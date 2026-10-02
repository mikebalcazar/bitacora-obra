/* Que la obra sepa distinguir lo que está dentro del alcance de lo que no.
 *
 * Mike, 20-sep-2026: «los no aprobados NO APARECEN en quell al menos que veas
 * la vista de ítems fuera de alcance». Mike, 2-oct-2026: «solo existirá "en
 * alcance" o "fuera de alcance" (…) solo en la bitácora sí aparecerá como "se
 * sacó del alcance" y si se agrega de nuevo aparecerá después "se agregó al
 * alcance" con su fecha y quién la agregó».
 *
 * POR QUÉ ESTO SE MIDE SOBRE LO ARMADO
 *
 * Lo que se puede romper aquí no truena: se degrada. Si el filtro dejara de
 * aplicarse, el plano volvería a enseñar todo revuelto y se vería igual de
 * bien —sólo que con piezas que nadie aprobó entre las que se están
 * fabricando—. Y si la regla se copiara a esta pantalla en vez de leerse de
 * la API, habría dos definiciones de «cancelado» y una se quedaría atrás.
 *
 *   npm run build && node pruebas/alcance.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const proyecto = readFileSync('web/src/Project.jsx', 'utf8');
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const puerta = readFileSync('worker/index.js', 'utf8');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

console.log('· el plano arranca enseñando lo que se está fabricando');
rev(/useState\('dentro'\)/.test(proyecto), "el filtro nace en 'dentro'");
rev(/alcance === 'todos' \|\| \(e\.alcance \|\| 'dentro'\) === alcance/.test(proyecto),
    'y las piezas se filtran por el alcance que manda la API');

console.log('· el filtro tiene DOS respuestas, como lo pidió Mike el 2-oct');
rev(proyecto.includes('value="fuera"'), 'hay opción para «fuera»');
rev(!proyecto.includes('value="no_aprobado"') && !proyecto.includes('value="cancelado"'),
    'y ya no se divide entre no aprobados y cancelados');
rev(/cuantosAlcance\('fuera'\)/.test(proyecto), 'y la opción dice cuántos hay detrás');
const api = readFileSync('web/src/api.js', 'utf8');
rev(/fuera: 'Fuera de alcance'/.test(api) && !/no_aprobado/.test(api) && !/descartado/.test(api),
    'los nombres del alcance son dos: en alcance y fuera de alcance');
rev(/entra: 'Se agregó al alcance'/.test(api) && /sale: 'Se sacó del alcance'/.test(api),
    'y la bitácora habla con las palabras de Mike');

console.log('· la regla NO se vuelve a escribir aquí');
/* La pantalla no puede decidir qué es un cancelado: eso sale de `estado` y
 * `aprobado_at`, y lo resuelve la suite. Si esta pantalla los mencionara,
 * sería una segunda definición. */
rev(!/aprobado_at/.test(proyecto) && !/aprobado_at/.test(panel),
    'ni Project ni ElementPanel deducen el alcance de `aprobado_at`');

console.log('· sacar del alcance desde la obra');
rev(/items\/\$\{e\.item_id\}\/\$\{que\}/.test(panel), 'el panel del ítem lo pide a la suite');
rev(/mover\('sacar'\)/.test(panel) && !/mover\('cancelar'\)/.test(panel), 'y lo que pide es «sacar», no «cancelar»');
rev(/seg\[2\] === 'aprobar' \|\| seg\[2\] === 'sacar'/.test(puerta), 'y la puerta reenvía «sacar» (y «cancelar» por los viejos)');
rev(panel.includes('Agregar al alcance') && panel.includes('Sacar del alcance'), 'los dos botones dicen lo que hacen');
rev(!/descartado/.test(panel) && !/Cancelado:/.test(panel), 'y ya no se habla de cancelados ni descartados');

console.log('· la bitácora del alcance, debajo de los botones');
rev(/item_alcance_movimientos/.test(panel), 'el panel lee los movimientos que manda la suite');
rev(/MOVIMIENTOS_ALCANCE\[m\.accion\]/.test(panel), 'y cada renglón dice «se agregó» o «se sacó»');
rev(/sin registro de quién/.test(panel), 'lo sembrado sin quién se dice así, no se inventa un nombre');
rev(/\.alcance-bitacora\{/.test(css), 'y la lista tiene su estilo en lo armado');
rev(/'\/items\/\$\{encodeURIComponent\(seg\[1\]\)\}\/\$\{seg\[2\]\}`, ''\)/.test(puerta.replace(/`/g, "'")) || puerta.includes("`/items/${encodeURIComponent(seg[1])}/${seg[2]}`, ''"),
    'sin el prefijo del motor: la ruta es de la empresa, no de la obra');

console.log('· y todo eso llegó a lo armado');
rev(js.includes('Fuera de alcance') && js.includes('Se sacó del alcance'), 'el paquete trae los alcances y la bitácora');
rev(!js.includes('no_aprobado'), 'y ya no trae el tercer estado');
rev(/\.pin\.fuera\{/.test(css), 'y el pin de lo que está fuera se pinta distinto');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
