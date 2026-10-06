/* Los dos candados del ítem en el cronograma (6-oct-2026).
 *
 * Mike: «todos los ítems necesitan cumplir 2 parámetros para que se fije su
 * fecha de inicio (…) anticipo y definición de diseño. Mientras los
 * parámetros no se cumplan la fecha de inicio se sigue recorriendo al día
 * presente (…) necesito poder marcar en el ítem la fecha de definición de
 * diseño, y si hay cambios, poder editarla».
 *
 * Lo que se mide sin navegador: el campo de la fecha de diseño al editar el
 * ítem y que viaje en el PATCH; el encabezado del ítem con los dos candados
 * (para quien dirige); el rótulo de los candados en la lista y en la
 * gráfica, con la palabra que falta y «corre desde hoy»; y que lo armado lo
 * traiga. Las cuentas (desde cuándo corre la pieza) las hace la API 0.70.0.
 *
 *   npm run build && node pruebas/los-candados.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const crono = readFileSync('web/src/Cronograma.jsx', 'utf8');
const gantt = readFileSync('web/src/Gantt.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');

console.log('· la fecha de diseño en el ítem');
rev(/useState\(\{ code: e\.code, type: e\.type, name: e\.name, resp: e\.resp, diseno_definido: e\.diseno_definido \|\| '' \}\)/.test(panel), 'al editar, el formulario carga la fecha que tenga (o vacía)');
rev(/<label>Diseño definido el <small className="muted">\(candado del cronograma; vacío = sin definir\)<\/small><\/label><input type="date" value=\{f\.diseno_definido\} onChange=\{\(ev\) => setF\(\{ \.\.\.f, diseno_definido: ev\.target\.value \}\)\} \/>/.test(panel), 'un campo de fecha «Diseño definido el»; vacío = sin definir');
rev(/api\.patch\(`\/elements\/\$\{e\.id\}`, f\)/.test(panel), 'y viaja en el mismo PATCH del ítem (la API lo valida y lo guarda)');
rev(/\{staff && <span data-candado="diseno" className=\{e\.diseno_definido \? '' : 'falta'\}[^>]*>Diseño \{e\.diseno_definido \? `definido \$\{fmtD\(e\.diseno_definido\)\}` : 'sin definir'\}<\/span>\}/.test(panel), 'el encabezado del ítem dice «Diseño definido el…» o «Diseño sin definir» (sólo a quien dirige)');
rev(/\{staff && <span data-candado="anticipo" className=\{e\.anticipo_fecha \? '' : 'falta'\}[\s\S]*?\{e\.anticipo_fecha \? `Anticipo \$\{fmtD\(e\.anticipo_fecha\)\}` : e\.item_id \? 'Sin anticipo' : 'Sin ítem en dash101'\}<\/span>\}/.test(panel), 'y «Anticipo …», «Sin anticipo» o «Sin ítem en dash101» según el caso');
rev(/\.panel \.meta span\.falta\{color:var\(--pend\)\}/.test(css), 'lo que falta va en rojo');

console.log('· los candados en el cronograma');
rev(/export function Candados\(\{ k, corto = false \}\)/.test(crono), 'un rótulo común para la lista y la gráfica');
rev(/if \(k\.listo\) return <span className="candados listo"[^>]*>\{corto \? '✓' : `Arranca \$\{fecha\(k\.arranque\)\}`\}<\/span>;/.test(crono), 'con los dos: «Arranca <fecha>» (✓ en la gráfica)');
rev(/\{!k\.anticipo && <em[^>]*>\{corto \? '⚠ anticipo' : k\.ligado \? 'Sin anticipo' : 'Sin ítem en dash101'\}<\/em>\}/.test(crono), 'sin anticipo: «Sin anticipo», o «Sin ítem en dash101» si la pieza no está ligada');
rev(/\{!k\.diseno && <em[^>]*>\{corto \? '⚠ diseño' : 'Sin diseño'\}<\/em>\}/.test(crono), 'sin diseño: «Sin diseño»');
rev(/\{!corto && <small>corre desde hoy<\/small>\}/.test(crono), 'y la lista dice «corre desde hoy»');
rev(/<Candados k=\{e\.candados\} \/>/.test(crono), 'en la lista, en la cabecera de cada pieza');
rev(/import \{ Candados, nombreDe, ordenaFases \} from '\.\/Cronograma\.jsx';/.test(gantt) && /<Candados k=\{f\.e\.candados\} corto \/>/.test(gantt), 'en la gráfica, en el renglón de cada pieza, en corto');
rev(/Una pieza corre desde que tiene anticipo \(se reparte en dash101 al registrar el pago\) y diseño definido \(se fecha en el ítem\); mientras le falte alguno, corre desde hoy\./.test(crono), 'y la nota de arriba explica la regla');
rev(/\.candados\.faltan em\{[^}]*background:var\(--pend-soft\);color:var\(--pend\)/.test(css), 'lo que falta se ve en rojo');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/corre desde hoy/.test(js) && /Diseño definido el/.test(js) && /Sin ítem en dash101/.test(js), 'está en el JavaScript publicado');
const cssPub = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.candados\.faltan em\{/.test(cssPub), 'y el estilo en el CSS publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
