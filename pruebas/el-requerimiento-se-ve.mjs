/* El pin del requerimiento se ve: amarillo relleno con aro verde.
 *
 * Mike, 3-oct-2026: «El color de los círculos de los requerimientos en quell
 * no se ven. Podríamos hacerlos un amarillo relleno con círculo verde? o
 * algo más visible?»
 *
 * Por qué no se veían: el requerimiento era gris a propósito (22-sep) y desde
 * el 2-oct está fuera del alcance, y lo que está fuera del alcance se pinta
 * hueco, punteado y a tres cuartos. Gris + hueco + punteado sobre un plano
 * blanco es casi nada. Aquí se mide que el tipo sea amarillo, que el pin del
 * requerimiento lleve su clase, que la regla gane a la de «fuera» y que lo
 * armado lo traiga.
 *
 *   npm run build && node pruebas/el-requerimiento-se-ve.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { TIPOS, colorTipo, enRevision } from '../web/src/api.js';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

console.log('· el tipo');
const req = TIPOS.find((t) => t.clave === 'Requerimiento');
rev(!!req, 'Requerimiento sigue siendo un tipo');
rev(req && /^#F0C419$/i.test(req.color), 'y su color es amarillo', req && req.color);
rev(colorTipo('Requerimiento') === req.color, 'colorTipo lo da igual (lista, filtros, leyenda)');
rev(!TIPOS.some((t) => t.clave !== 'Requerimiento' && /^#F0C419$/i.test(t.color)), 'ningún otro tipo es amarillo');
rev(enRevision('requerimiento') && enRevision(' Requerimiento ') && !enRevision('Mueble'), 'enRevision sigue normalizando');

console.log('· el pin');
const canvas = sinComentarios(readFileSync('web/src/PlanCanvas.jsx', 'utf8'));
rev(/import \{[^}]*\benRevision\b[^}]*\} from '\.\/api\.js'/.test(canvas), 'PlanCanvas sabe qué es un requerimiento');
rev(/\+ \(enRevision\(e\.type\) \? ' revision' : ''\)/.test(canvas), 'y le pone la clase «revision» al pin');
const css = sinComentarios(readFileSync('web/src/styles.css', 'utf8'));
const iFuera = css.indexOf('.pin.fuera{'), iRev = css.indexOf('.pin.revision{');
rev(iFuera > 0 && iRev > iFuera, 'la regla del requerimiento va DESPUÉS de la de «fuera del alcance», para ganarle');
const regla = css.slice(iRev, css.indexOf('}', iRev));
rev(/background:var\(--tinte\) !important/.test(regla), 'relleno del color del tipo (amarillo), por encima del hueco de «fuera»');
rev(/border-style:solid/.test(regla) && /border-color:var\(--ok\)/.test(regla), 'aro verde y liso, sin punteado');
rev(/opacity:1/.test(regla), 'y sin transparencia');
rev(/\.pin\.revision\.abierto\{border-color:var\(--pend\)\}/.test(css), 'con pendientes abiertos el aro sigue rojo');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/#F0C419/i.test(js), 'el amarillo está en el JavaScript publicado');
const cssDist = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.pin\.revision\{/.test(cssDist), 'y la regla del pin en el CSS publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
