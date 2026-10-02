/* El menú de abajo se ve en el celular, y el plano se comparte.
 *
 * Mike, 2-oct-2026, en un iPhone con Safari 26: «No alcanzo a ver el menú de
 * abajo, quiero compartir ese plano (imagen o pdf) y me imagino que está
 * tapado ahí abajo donde no puedo ver.»
 *
 * Dos cosas: Safari 26 pone su barra flotante ENCIMA de la página y la app
 * medía la pantalla entera, así que Plano · Lista · Pendientes · Ítem ·
 * Reporte quedaba detrás de esa barra; y compartir el plano no existía (el
 * botón estaba en fotos y documentos del ítem). Aquí se mide la cuenta de lo
 * visible sin navegador, que el CSS la use, y que el botón de compartir el
 * plano esté colgado y comparta el original.
 *
 *   npm run build && node pruebas/el-menu-se-ve-en-safari.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { medirAlto } from '../web/src/alto.js';
import { archivoDelPlano } from '../web/src/compartir.js';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

console.log('· cuánto se ve de verdad');
const m1 = medirAlto({ vv: { height: 760, offsetTop: 0, scale: 1 }, innerHeight: 852, enfocado: null });
rev(m1 && m1.alto === 760 && m1.tapa === 92, 'con la barra de Safari fuera, la app mide lo visible y lo tapado es la barra', JSON.stringify(m1));
const m2 = medirAlto({ vv: { height: 852, offsetTop: 0, scale: 1 }, innerHeight: 852, enfocado: null });
rev(m2 && m2.alto === 852 && m2.tapa === 0, 'con la barra encogida, nada tapado', JSON.stringify(m2));
rev(medirAlto({ vv: { height: 400, offsetTop: 0, scale: 1 }, innerHeight: 852, enfocado: { tagName: 'INPUT' } }) === null, 'con un campo enfocado (teclado) no se mide');
rev(medirAlto({ vv: { height: 400, offsetTop: 0, scale: 1 }, innerHeight: 852, enfocado: { tagName: 'DIV', isContentEditable: true } }) === null, 'ni con un editable enfocado');
rev(medirAlto({ vv: { height: 426, offsetTop: 0, scale: 2 }, innerHeight: 852, enfocado: null }) === null, 'ni con la página ampliada con los dedos');
rev(medirAlto({ vv: null, innerHeight: 852, enfocado: null }) === null, 'sin visualViewport, nada (queda el 100% del CSS)');
const m3 = medirAlto({ vv: { height: 700, offsetTop: 60, scale: 1 }, innerHeight: 852, enfocado: null });
rev(m3 && m3.alto === 760 && m3.tapa === 92, 'si la página se corrió, lo visible cuenta desde arriba', JSON.stringify(m3));

console.log('· el CSS del celular usa la medida');
const css = sinComentarios(readFileSync('web/src/styles.css', 'utf8'));
const movil = css.slice(css.indexOf('@media (max-width:900px)'));
rev(/\.app\{[^}]*height:var\(--alto-visible,100%\)/.test(movil), 'la caja de la app mide lo visible, y 100% si no hay medida');
rev(/\.ov\{[^}]*height:var\(--alto-visible,100%\)/.test(movil), 'los modales también');
rev(/\.senal\{[^}]*var\(--tapa,0px\)/.test(css), 'y el aviso de señal se sube lo tapado');
rev(/\.mnav\{[^}]*calc\(6px \+ var\(--sab\)\)/.test(movil), 'la barra de abajo conserva su franja del indicador de inicio');
const main = readFileSync('web/src/main.jsx', 'utf8');
rev(/import \{ vigilarAlto \} from '\.\/alto\.js'/.test(main) && /^vigilarAlto\(\);/m.test(main), 'y se mide desde que arranca la app');
const alto = readFileSync('web/src/alto.js', 'utf8');
rev(/vv\.addEventListener\('resize', medir\)/.test(alto) && /vv\.addEventListener\('scroll', medir\)/.test(alto), 'se vuelve a medir cuando Safari saca o esconde su barra');
rev(/setProperty\('--alto-visible'/.test(alto) && /setProperty\('--tapa'/.test(alto), 'y se deja en <html> para el CSS');

console.log('· el plano se comparte');
const a1 = archivoDelPlano({ name: 'Planta baja', file_name: 'planta-baja.pdf', source_key: 'orgs/x/planos/1.pdf', image_key: 'orgs/x/planos/1.png' });
rev(a1 && a1.llave === 'orgs/x/planos/1.pdf' && a1.nombre === 'planta-baja.pdf', 'se comparte el original que se subió (PDF o imagen), con su nombre', JSON.stringify(a1));
const a2 = archivoDelPlano({ name: 'Planta baja', image_key: 'orgs/x/planos/1.png' });
rev(a2 && a2.llave === 'orgs/x/planos/1.png' && a2.nombre === 'Planta baja.png', 'un plano viejo sin original comparte su imagen, nombrada', JSON.stringify(a2));
rev(archivoDelPlano({ name: 'x' }) === null && archivoDelPlano(null) === null, 'sin archivo, no hay botón');
const proy = sinComentarios(readFileSync('web/src/Project.jsx', 'utf8'));
rev(/import \{ BotonCompartir \} from '\.\/Fotos\.jsx'/.test(proy) && /import \{ archivoDelPlano \} from '\.\/compartir\.js'/.test(proy), 'Project.jsx trae el botón y la cuenta del archivo');
rev(/vista === 'plan' && archivoDelPlano\(plan\) && \(\s*<BotonCompartir url=\{fileUrl\(archivoDelPlano\(plan\)\.llave\)\} nombre=\{archivoDelPlano\(plan\)\.nombre\} className="btn sm" \/>/.test(proy), 'el plano que se ve tiene «Compartir» arriba, junto a Imprimir');
rev(/archivoDelPlano\(p\) && <BotonCompartir url=\{fileUrl\(archivoDelPlano\(p\)\.llave\)\} nombre=\{archivoDelPlano\(p\)\.nombre\} className="btn sm">⇪<\/BotonCompartir>/.test(proy), 'y cada plano de la lista de planos también');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/--alto-visible/.test(js), 'la medida está en el JavaScript publicado');
const cssDist = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/var\(--alto-visible,\s*100%\)/.test(cssDist), 'y el CSS publicado la usa');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
