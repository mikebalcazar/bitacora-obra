/* El plano principal del ítem, pegado o arrastrado.
 *
 * Mike, 1-oct-2026: «en quell, cuando quiero subir el plano principal de un
 * ítem, quiero poder copiarlo del portapapeles. sea un pdf o una imagen».
 *
 * Lo que se mide sin navegador: que de un pegado o un arrastre se saque el
 * PDF o la imagen (uno solo; el texto y lo demás no), que el pegado reciba
 * nombre con su extensión, y que el cuadro de «Subir» tenga colgados el
 * pegado en el documento y el arrastre en el cuadro, con el aviso.
 *
 *   npm run build && node pruebas/el-plano-pegado.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { planoDe, nombreDePlanoPegado } from '../web/src/pegar.js';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const archivo = (type, name = '') => ({ type, name });
const item = (kind, type, f) => ({ kind, type, getAsFile: () => f });

console.log('· de un pegado sale el plano, sea PDF o imagen');
const pdf = archivo('application/pdf', 'plano.pdf');
let dt = { items: [item('string', 'text/plain', null), item('file', 'application/pdf', pdf)], files: [] };
rev(planoDe(dt) === pdf, 'un PDF pegado entra');
const foto = archivo('image/png', 'image.png');
dt = { items: [item('file', 'image/png', foto)], files: [] };
rev(planoDe(dt) === foto, 'una imagen pegada entra');
dt = { items: [item('string', 'text/plain', null)], files: [] };
rev(planoDe(dt) === null, 'puro texto no da plano');
dt = { items: [item('file', 'text/plain', archivo('text/plain', 'notas.txt'))], files: [] };
rev(planoDe(dt) === null, 'un .txt tampoco');
dt = { items: [], files: [archivo('text/plain', 'notas.txt'), archivo('', 'plano.PDF'), foto] };
rev(planoDe(dt)?.name === 'plano.PDF', 'de un arrastre de varios, el primero que sirva (y el .pdf sin tipo cuenta por el nombre)');
rev(planoDe(null) === null && planoDe({}) === null, 'sin DataTransfer, nada y sin tronar');

console.log('· el pegado recibe nombre con su extensión');
const cuando = new Date(2026, 9, 1, 14, 5, 9);
rev(nombreDePlanoPegado({ type: 'application/pdf' }, cuando) === 'plano-20261001-140509.pdf', 'el PDF sin nombre', nombreDePlanoPegado({ type: 'application/pdf' }, cuando));
rev(nombreDePlanoPegado({ type: 'image/png', name: 'image.png' }, cuando) === 'plano-20261001-140509.png', 'la imagen pegada («image.png») se renombra');
rev(nombreDePlanoPegado({ type: 'image/jpeg', name: 'image.jpeg' }, cuando).endsWith('.jpg'), 'y JPEG lleva la extensión corta');
rev(nombreDePlanoPegado({ type: 'application/pdf', name: 'cocina-v3.pdf' }, cuando) === 'cocina-v3.pdf', 'un archivo con nombre lo conserva');

console.log('· el cuadro de subir lo tiene colgado');
const docs = readFileSync('web/src/DocsItem.jsx', 'utf8');
const subir = docs.slice(docs.indexOf('function Subir('));
rev(/import \{ planoDe, nombreDePlanoPegado \} from '\.\/pegar\.js';/.test(docs), 'DocsItem usa el ayudante de pegar');
rev(/document\.addEventListener\('paste', onPaste\)/.test(subir) && /document\.removeEventListener\('paste', onPaste\)/.test(subir), 'el pegado se escucha en el documento mientras el cuadro está abierto, y se suelta al cerrar');
rev(/const onPaste = \(ev\) => \{ if \(toma\(ev\.clipboardData\)\) ev\.preventDefault\(\); \};/.test(subir), 'al pegar, sólo si traía plano se frena el pegado normal');
rev(/onDrop=\{\(ev\) => \{ ev\.preventDefault\(\); setSoltando\(false\); toma\(ev\.dataTransfer\); \}\}/.test(subir), 'al soltar encima del cuadro se toma el archivo');
rev(/className=\{`modal\$\{soltando \? ' soltando' : ''\}`\}/.test(subir), 'el cuadro se marca mientras algo va encima');
rev(/O pégalo con Ctrl\+V, o arrástralo encima de este cuadro: un PDF o una imagen\./.test(subir), 'y lo ofrece con palabras');
rev(/<input type="file" accept="\.pdf,image\/\*"/.test(subir), 'el botón de escoger archivo sigue ahí');
rev(/data-escogido>Listo para subir: <b>\{file\.name\}<\/b>/.test(subir), 'y dice qué quedó listo para subir, con su nombre');
const css = readFileSync('web/src/styles.css', 'utf8');
rev(/\.modal\.soltando\{[^}]*dashed/.test(css), 'el cuadro se puntea al arrastrar');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/O pégalo con Ctrl\+V, o arrástralo encima de este cuadro/.test(js), 'el texto está en el JavaScript publicado');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
