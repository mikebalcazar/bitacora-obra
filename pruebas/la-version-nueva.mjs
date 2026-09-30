/* El letrero de versión nueva (30-sep-2026).
 *
 * Mike: «Me gusta el letrero que aparece en quote cuando actualizas la
 * versión y estás usándolo, que te dice que guardes tu trabajo y refresques
 * la página. Haz eso para todas las webapps».
 *
 * Se mide sobre lo armado y el fuente: que `npm run build` deje
 * dist/huella.txt con la sha256 del index.html armado, que la app cargue el
 * vigilante, que pida /huella.txt sin caché cada 2 minutos y al volver la
 * pestaña, y que el letrero diga que guarde y tenga botón de recargar.
 *
 *   npm run build && node pruebas/la-version-nueva.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
console.log('· lo armado trae su huella');
const huella = readFileSync('web/dist/huella.txt', 'utf8').trim();
rev(/^[0-9a-f]{64}$/.test(huella), 'dist/huella.txt es una sha256', huella.slice(0, 12));
rev(huella === createHash('sha256').update(readFileSync('web/dist/index.html')).digest('hex'), 'y es la del index.html armado');
rev(/node scripts\/huella\.mjs/.test(readFileSync('package.json', 'utf8')), 'la deja npm run build');
console.log('· la app vigila');
const app = readFileSync('web/src/App.jsx', 'utf8');
const v = readFileSync('web/src/VersionNueva.jsx', 'utf8');
rev(/<VersionNueva \/>/.test(app) && /import VersionNueva from '\.\/VersionNueva\.jsx'/.test(app), 'App carga el vigilante');
rev(/fetch\('\/huella\.txt', \{ cache: 'no-store' \}\)/.test(v), 'pide /huella.txt sin caché');
rev(/if \(base === null\) base = h;\s*else if \(h !== base && vivo\) setHay\(true\);/.test(v), 'compara con la de al abrir y avisa si cambió');
rev(/setInterval\(revisar, 120000\)/.test(v) && /visibilitychange/.test(v) && !/'focus'/.test(v), 'cada 2 minutos y al volver la pestaña, no con focus');
rev(/Termina lo que estés escribiendo, guarda, y recarga\./.test(v) && /location\.reload\(\)/.test(v), 'el letrero dice que guarde y tiene botón de recargar');
rev(/#aviso-version\{position:fixed/.test(readFileSync('web/src/styles.css', 'utf8')), 'y tiene su estilo');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
