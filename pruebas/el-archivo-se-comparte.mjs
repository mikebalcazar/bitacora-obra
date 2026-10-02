/* Compartir una copia de un archivo: fotos de la bitácora, planos, PDF y
 * documentos de soporte.
 *
 * Mike, 2-oct-2026: «los documentos o fotos que se suban (ya sea fotos de la
 * bitácora, pdf, planos o documentos de soporte) tengan una opción de
 * compartir para enviar una copia del archivo».
 *
 * Lo que se mide sin navegador: cómo se decide (hoja de compartir del
 * celular si sabe compartir archivos; descarga si no), cómo se nombra la
 * copia, que se comparta el ARCHIVO y no una liga con sesión, y que el botón
 * esté colgado en la foto ampliada y en la tarjeta de cada documento.
 *
 *   npm run build && node pruebas/el-archivo-se-comparte.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { comoCompartir, nombreDelArchivo } from '../web/src/compartir.js';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const archivo = { name: 'plano.pdf', type: 'application/pdf' };

console.log('· cómo se decide');
rev(comoCompartir({ share() {}, canShare: () => true }, archivo) === 'hoja', 'un celular que sabe compartir archivos abre su hoja de compartir');
rev(comoCompartir({ share() {}, canShare: () => false }, archivo) === 'descarga', 'uno que comparte texto pero no archivos, descarga');
rev(comoCompartir({}, archivo) === 'descarga', 'un navegador de escritorio sin share, descarga');
rev(comoCompartir({ share() {}, canShare: () => { throw new Error('x'); } }, archivo) === 'descarga', 'si canShare truena, descarga y no se cae');
rev(comoCompartir(null, archivo) === 'descarga', 'sin navigator, descarga');

console.log('· cómo se nombra la copia');
rev(nombreDelArchivo('Plano cocina v3.pdf', 'https://x/files/orgs/a/b/01ABC-plano.pdf?t=TOKEN') === 'Plano cocina v3.pdf', 'con nombre, el nombre');
rev(nombreDelArchivo('', 'https://x/files/orgs/a/b/01ABC-plano%20cocina.pdf?t=TOKEN') === '01ABC-plano cocina.pdf', 'sin nombre, el último tramo de la llave, sin la firma de la sesión');
rev(nombreDelArchivo(undefined, '') === 'archivo', 'sin nada, «archivo»');

console.log('· se comparte el archivo, no la liga');
const comp = readFileSync('web/src/compartir.js', 'utf8');
rev(/fetch\(url, \{ credentials: 'include' \}\)/.test(comp), 'baja el archivo con la sesión');
rev(/navigator\.share\(\{ files: \[archivo\]/.test(comp), 'y a la hoja de compartir va el ARCHIVO');
rev(/a\.download = archivo\.name/.test(comp), 'la descarga lleva su nombre');
rev(/e\.name === 'AbortError'\) return 'cancelado'/.test(comp), 'cancelar la hoja no es error');

console.log('· el botón está colgado');
const fotos = readFileSync('web/src/Fotos.jsx', 'utf8');
rev(/export function BotonCompartir\(/.test(fotos), 'hay un botón de compartir');
rev(/export function Lightbox\(/.test(fotos) && /<BotonCompartir url=\{url\} nombre=\{nombre\} className="btn" \/>/.test(fotos), 'la foto ampliada lo trae');
rev(/setLb\(\{ url: fileUrl\(p\.r2_key\), nombre: p\.file_name \}\)/.test(fotos), 'y al ampliar viaja el nombre de la foto');
const docs = readFileSync('web/src/DocsItem.jsx', 'utf8');
rev(/<BotonCompartir url=\{fileUrl\(doc\.r2_key\)\} nombre=\{doc\.nombre\}>/.test(docs), 'la tarjeta de cada documento (plano, versión, soporte) lo trae');
for (const f of ['web/src/ElementPanel.jsx', 'web/src/Dudas.jsx']) {
  const s = readFileSync(f, 'utf8');
  rev(!/className="lightbox"/.test(s) && /<Lightbox lb=\{lb\}/.test(s), `${f.split('/').pop()} usa el visor con compartir`);
}
const css = readFileSync('web/src/styles.css', 'utf8');
rev(/\.lb-acciones\{/.test(css), 'el visor tiene su barra de acciones');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Compartir una copia del archivo/.test(js), 'el botón está en el JavaScript publicado');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
