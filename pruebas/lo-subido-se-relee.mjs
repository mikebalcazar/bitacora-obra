/* Lo que se registró sin señal deja de decir «Por subir» en cuanto sube
 * (16-oct-2026).
 *
 * Al grabar el video de Forespot: sin señal se levantó un pendiente con foto,
 * se vio con «Por subir» —el parche local—, volvió la señal, la fila subió y
 * el letrero de abajo se fue… pero el pendiente seguía diciendo «Por subir» y
 * sin su foto hasta salir del ítem y volver a entrar. Nadie volvía a leer.
 *
 * Lo que se mide sin navegador: la fila avisa cuántas subió; el ítem abierto y
 * la obra se vuelven a leer cuando subió algo, y sólo entonces; y lo armado
 * lo trae. Que la fila suba en orden y no repita lo prueba `entrada.mjs`.
 *
 *   npm run build && node pruebas/lo-subido-se-relee.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const api = readFileSync('web/src/api.js', 'utf8');
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const obra = readFileSync('web/src/Project.jsx', 'utf8');
const vacia = api.slice(api.indexOf('export async function vaciaFila('), api.indexOf("if (typeof window !== 'undefined')"));

console.log('· la fila');
rev(/finally \{[\s\S]*avisa\(\{ ultimoError, subidas \}\);/.test(vacia), 'al terminar avisa cuántas subió');
rev(/subidas\+\+;/.test(vacia), 'y las cuenta sólo cuando el servidor las tomó');

console.log('· el ítem abierto');
rev(/import \{[^}]*\balCambiarRed\b[^}]*\} from '\.\/api\.js';/.test(panel), 'escucha a la fila');
rev(/useEffect\(\(\) => alCambiarRed\(\(n\) => \{ if \(n\.subidas > 0\) load\(\); \}\), \[elementId\]\);/.test(panel), 'se vuelve a leer cuando subió algo, y deja de escuchar al cerrarse');

console.log('· la obra');
rev(/import \{[^}]*\balCambiarRed\b[^}]*\} from '\.\/api\.js';/.test(obra), 'escucha a la fila');
rev(/useEffect\(\(\) => alCambiarRed\(\(n\) => \{ if \(n\.subidas > 0\) load\(\); \}\), \[load\]\);/.test(obra), 'pines y cuenta de pendientes se vuelven a leer');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.subidas>0/.test(js), 'está en el JavaScript publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
