/* El dibujo a mano para la bitácora (9-oct-2026).
 *
 * Mike: «quiero poder hacer un dibujo bitmap adicional a agregar imagen o
 * tomar foto para anotaciones de la bitácora. Un cuadro de 1000x1000 pixeles
 * y un par de pinceles y opción a colores».
 *
 * Lo que se mide sin navegador: el botón «Dibujo» junto a «Cámara» y
 * «Fotos» (en todos los compositores, porque es el mismo `PhotoInput`); el
 * lienzo de 1000×1000; los pinceles y los colores (con «otro color»);
 * deshacer y borrar todo; que el dibujo salga como PNG con nombre y entre a
 * la misma fila de fotos por subir; que el dedo no mueva la página mientras
 * dibuja; y que lo armado lo traiga.
 *
 *   npm run build && node pruebas/el-dibujo.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const fotos = readFileSync('web/src/Fotos.jsx', 'utf8');
const dib = readFileSync('web/src/Dibujo.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');

console.log('· el botón');
rev(/<button type="button" className="btn sm" data-dibujar onClick=\{\(\) => setDibujando\(true\)\}>Dibujo<\/button>/.test(fotos), '«Dibujo» junto a «Cámara» y «Fotos»');
rev(/\{dibujando && <Dibujo onListo=\{\(f\) => onFiles\(\[f\]\)\} onCerrar=\{\(\) => setDibujando\(false\)\} \/>\}/.test(fotos), 'el dibujo entra a la misma fila que las fotos');

console.log('· el lienzo');
rev(/export const LADO = 1000;/.test(dib) && /width=\{LADO\}\s*height=\{LADO\}/.test(dib), 'mide 1000×1000 por dentro');
rev(/\(\(ev\.clientX - r\.left\) \/ r\.width\) \* LADO/.test(dib) && /\(\(ev\.clientY - r\.top\) \/ r\.height\) \* LADO/.test(dib), 'el dedo se lleva a la escala del lienzo');
rev(/touch-action:none/.test(css.slice(css.indexOf('.dibujo-lienzo{'))), 'dibujar no mueve la página');
rev(/aspect-ratio:1\/1/.test(css.slice(css.indexOf('.dibujo-lienzo{'))), 'en la pantalla siempre se ve cuadrado');
rev(/getCoalescedEvents/.test(dib), 'un trazo rápido no sale en rectas');

console.log('· pinceles y colores');
rev(/\{ clave: 'fino', nombre: 'Fino', ancho: 5 \}/.test(dib) && /\{ clave: 'grueso', nombre: 'Grueso', ancho: 18 \}/.test(dib), 'dos pinceles: Fino y Grueso');
rev(/\{ clave: 'borrador', nombre: 'Borrador', ancho: 44, borra: true \}/.test(dib), 'y un borrador');
rev(/export const COLORES = \['#1d1d1f', '#d33a2f', '#2563eb', '#2e8b57', '#f59e0b', '#7c3aed'\];/.test(dib), 'seis colores a la mano');
rev(/<input type="color" value=\{color\} data-color-otro/.test(dib), 'y «otro color» con el selector del sistema');

console.log('· deshacer, borrar y agregar');
rev(/const deshacer = \(\) => \{ trazos\.current\.pop\(\); setN\(trazos\.current\.length\); repinta\(\); \};/.test(dib), 'deshacer quita el último trazo');
rev(/const limpiar = \(\) => \{ trazos\.current\.push\(\{ limpia: true \}\);/.test(dib), '«Borrar todo» también se deshace');
rev(/toBlob\(res, 'image\/png'\)/.test(dib) && /new File\(\[blob\], nombreDeDibujo\(\), \{ type: 'image\/png' \}\)/.test(dib), 'sale un PNG con nombre');
rev(/disabled=\{!hayDibujo \|\| guardando\}/.test(dib), 'no se agrega un dibujo en blanco');
rev(/ev\.target === ev\.currentTarget && !n && onCerrar\(\)/.test(dib), 'picar fuera no tira un dibujo empezado');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Agregar el dibujo/.test(js) && /dibujo-/.test(js), 'está en el JavaScript publicado');
const cssPub = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.dibujo-lienzo\{/.test(cssPub), 'y el estilo en el CSS publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
