/* Que la obra sepa distinguir lo que está dentro del alcance de lo que no.
 *
 * Mike, 20-sep-2026: «en el filtro de vista de quell de ítems fuera de
 * alcance debe venir dividido entre no aprobados y cancelados», y «los no
 * aprobados NO APARECEN en quell al menos que veas la vista de ítems fuera
 * de alcance».
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

console.log('· el filtro viene DIVIDIDO, como lo pidió Mike');
for (const cual of ['no_aprobado', 'cancelado']) {
  rev(proyecto.includes(`value="${cual}"`), `hay opción para «${cual}»`);
}
rev(/cuantosAlcance\('no_aprobado'\)/.test(proyecto), 'y cada opción dice cuántos hay detrás');

console.log('· la regla NO se vuelve a escribir aquí');
/* La pantalla no puede decidir qué es un cancelado: eso sale de `estado` y
 * `aprobado_at`, y lo resuelve la suite. Si esta pantalla los mencionara,
 * sería una segunda definición. */
rev(!/aprobado_at/.test(proyecto) && !/aprobado_at/.test(panel),
    'ni Project ni ElementPanel deducen el alcance de `aprobado_at`');

console.log('· sacar del alcance desde la obra');
rev(/items\/\$\{e\.item_id\}\/\$\{que\}/.test(panel), 'el panel del ítem lo pide a la suite');
rev(/seg\[2\] === 'aprobar' \|\| seg\[2\] === 'cancelar'/.test(puerta), 'y la puerta reenvía esas dos rutas');
rev(/'\/items\/\$\{encodeURIComponent\(seg\[1\]\)\}\/\$\{seg\[2\]\}`, ''\)/.test(puerta.replace(/`/g, "'")) || puerta.includes("`/items/${encodeURIComponent(seg[1])}/${seg[2]}`, ''"),
    'sin el prefijo del motor: la ruta es de la empresa, no de la obra');

console.log('· y todo eso llegó a lo armado');
rev(js.includes('no_aprobado'), 'el paquete trae los alcances');
rev(/\.pin\.fuera\{/.test(css), 'y el pin de lo que está fuera se pinta distinto');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
