/* Quitar una nota del plano pregunta antes.
 *
 * Mike, 1-oct-2026: «Cuando estoy en las notas del plano principal del ítem,
 * hay una opción de quitar la nota; quiero que si le doy click en quitar,
 * primero me pregunte si estoy seguro, si no es muy fácil quitarla por
 * error».
 *
 * Lo que se mide sin navegador: que `borraMarca` pregunte con `confirm`
 * ANTES de pedirle nada a la API, que diga qué nota se va (con su texto), y
 * que el botón «Quitar» del globo siga pasando por ahí.
 *
 *   npm run build && node pruebas/la-nota-pregunta.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const docs = readFileSync('web/src/DocsItem.jsx', 'utf8');
const fn = docs.slice(docs.indexOf('async function borraMarca('), docs.indexOf('async function borraMarca(') + 900);
console.log('· quitar una marca pregunta antes');
rev(/if \(!confirm\(`¿Quitar \$\{que\}\? No se puede deshacer\.`\)\) return;/.test(fn), 'pregunta con confirm y dice que no se deshace');
rev(fn.indexOf('confirm(') < fn.indexOf("api.post(`/marcas/${id}/borrar`"), 'y pregunta ANTES de pedirle a la API que la borre');
rev(/const que = mk\?\.tipo === 'nota' \? `la nota «\$\{String\(mk\.texto \|\| ''\)\.slice\(0, 60\)\}»` : 'este trazo';/.test(fn), 'nombra la nota con su texto (recortado a 60), o el trazo');
const globo = docs.slice(docs.indexOf('<div className="globo"'), docs.indexOf('<div className="globo"') + 700);
rev(/onClick=\{\(\) => \{ setAbierta\(null\); onBorrar\(mk\.id\); \}\}>Quitar<\/button>/.test(globo), 'el botón «Quitar» del globo sigue pasando por borraMarca');
rev(/onBorrar=\{anotable \? borraMarca : null\}/.test(docs), 'y la hoja recibe borraMarca sólo cuando se puede anotar');
console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/No se puede deshacer\./.test(js), 'el texto de la pregunta está en el JavaScript publicado');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
