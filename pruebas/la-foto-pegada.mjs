/* La foto pegada o arrastrada en la bitácora del ítem.
 *
 * Mike, 30-sep-2026: «En quell, cuando escribo en la bitácora del ítem,
 * quiero poder agregar fotos pero solo arrastrando o pegando lo que está en
 * el portapapeles».
 *
 * Lo que se mide sin navegador: que de un pegado o un arrastre se saquen
 * SÓLO las imágenes (el texto pegado sigue pegándose; un PDF arrastrado no
 * entra), que la foto pegada reciba nombre, y que la bitácora tenga colgados
 * los manejadores en la caja y en la zona, con la marca visual al arrastrar.
 *
 *   npm run build && node pruebas/la-foto-pegada.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { imagenesDe, nombreDePegada } from '../web/src/pegar.js';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const archivo = (type, name = '') => ({ type, name });
const item = (kind, type, f) => ({ kind, type, getAsFile: () => f });

console.log('· de un pegado se toman sólo las imágenes');
const foto = archivo('image/png', 'image.png');
let dt = { items: [item('string', 'text/plain', null), item('file', 'image/png', foto)], files: [] };
rev(imagenesDe(dt).length === 1 && imagenesDe(dt)[0] === foto, 'un pegado con texto y una imagen deja la imagen');
dt = { items: [item('string', 'text/plain', null)], files: [] };
rev(imagenesDe(dt).length === 0, 'un pegado de puro texto no toma nada (y el texto se pega como siempre)');
dt = { items: [item('file', 'application/pdf', archivo('application/pdf', 'plano.pdf'))], files: [] };
rev(imagenesDe(dt).length === 0, 'un PDF no entra como foto');
const a = archivo('image/jpeg', 'a.jpg'), b = archivo('image/png', 'b.png');
dt = { items: [], files: [a, archivo('text/plain', 'notas.txt'), b] };
rev(imagenesDe(dt).length === 2 && imagenesDe(dt)[0] === a && imagenesDe(dt)[1] === b, 'un arrastre de varios archivos deja las dos fotos, en orden');
rev(imagenesDe(null).length === 0 && imagenesDe({}).length === 0, 'sin DataTransfer, nada y sin tronar');

console.log('· la foto pegada recibe nombre');
const cuando = new Date(2026, 8, 30, 14, 5, 9);
rev(nombreDePegada({ type: 'image/png' }, cuando) === 'pegada-20260930-140509.png', 'con la fecha y la hora', nombreDePegada({ type: 'image/png' }, cuando));
rev(nombreDePegada({ type: 'image/jpeg' }, cuando).endsWith('.jpg'), 'y la extensión corta para JPEG');

console.log('· la bitácora los tiene colgados');
const fotos = readFileSync('web/src/Fotos.jsx', 'utf8');
rev(/export function usePegarYSoltar\(add\)/.test(fotos), 'hay un gancho para pegar y soltar');
rev(/onPaste: \(ev\) => \{ if \(toma\(ev\.clipboardData\)\) ev\.preventDefault\(\); \}/.test(fotos), 'al pegar, sólo si había imágenes se frena el pegado normal');
rev(/onDrop: \(ev\) => \{ ev\.preventDefault\(\); setSoltando\(false\); toma\(ev\.dataTransfer\); \}/.test(fotos), 'al soltar se toman las del arrastre');
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const log = panel.slice(panel.indexOf('function Log('), panel.indexOf('// El camino del ítem'));
rev(/usePegarYSoltar\(add\)/.test(log), 'la bitácora usa el gancho');
rev(/data-compose="bitacora" onDragOver=\{onDragOver\} onDragLeave=\{onDragLeave\} onDrop=\{onDrop\}/.test(log), 'la zona de escribir recibe el arrastre');
rev(/<textarea[\s\S]{0,200}?onPaste=\{onPaste\}/.test(log), 'y la caja de texto, el pegado');
rev(/\{soltando && <div className="suelta-aqui">Suelta la foto aquí<\/div>\}/.test(log), 'mientras algo va encima, dice «Suelta la foto aquí»');
rev(/pega o arrastra una foto aquí/.test(log), 'y el placeholder lo ofrece');
rev(/<PhotoInput onFiles=\{add\} \/>/.test(log), 'la cámara y las fotos del teléfono siguen ahí');
const css = readFileSync('web/src/styles.css', 'utf8');
rev(/\.compose\.soltando\{[^}]*dashed/.test(css), 'la zona se marca punteada al arrastrar');
console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Suelta la foto aquí/.test(js) && /pega o arrastra una foto aquí/.test(js), 'los textos están en el JavaScript publicado');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
