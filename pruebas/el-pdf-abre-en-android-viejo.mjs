/* El PDF del ítem abre en un Android con Chrome viejo.
 *
 * Mike, 7-oct-2026, con la foto de un teléfono: «Me reportan que en Android
 * no abren algunos planos en quell. Este es del proyecto Holcim. Así se queda
 * la pantalla y nunca carga». En la foto, la hoja es un cuadro blanco de
 * 2 a 1: el tamaño que trae un <canvas> recién nacido (300×150). O sea que
 * pdf.js tronó ANTES de medir la hoja, y la pantalla se quedó callada.
 *
 * La causa: la versión moderna de pdf.js usa `Promise.withResolvers`, que
 * Chrome trae desde la 119 (fines de 2023). Un teléfono con Chrome anterior
 * no la tiene, `getDocument` truena y no se pinta nada. Las fotos y el plano
 * de la obra sí abren porque no pasan por pdf.js al verse (el plano se
 * rasteriza al subirlo).
 *
 * Aquí se arma ese teléfono sin navegador: se le quita
 * `Promise.withResolvers` a Node antes de cargar pdf.js, y se abre un PDF con
 * el MISMO módulo que importa `web/src/pdf.js` (se lee de ahí, no se copia).
 * Con la moderna truena al abrirlo; con la legacy lo abre y lee la hoja.
 * (Pintarla necesita un lienzo, que Node no trae; lo que tronaba en el
 * teléfono era abrirlo, y eso es lo que se mide.)
 *
 *   node pruebas/el-pdf-abre-en-android-viejo.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

// Lo que importa la app, tal cual.
const fuente = readFileSync('web/src/pdf.js', 'utf8');
const modulo = fuente.match(/import\('(pdfjs-dist[^']*)'\)/)?.[1];
const trabajador = fuente.match(/import\('(pdfjs-dist[^'?]*)\?url'\)/)?.[1];
const desdeWeb = createRequire(new URL('../web/package.json', import.meta.url));
const resolver = (m) => pathToFileURL(desdeWeb.resolve(m === 'pdfjs-dist' ? 'pdfjs-dist/build/pdf.mjs' : m)).href;

/* Un PDF de una hoja apaisada (792×612), escrito a mano, con la tabla xref
 * calculada aquí: sin archivos de prueba que se pierdan. */
function pdfDePrueba() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R >>',
  ];
  const flujo = '0 0 0 rg 0 0 396 612 re f';
  objs.push(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
  let pdf = '%PDF-1.4\n';
  const off = [];
  objs.forEach((o, i) => { off.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

/** Abre el PDF con el módulo dado. Cada uno en su propio proceso de Node
 *  sería lo limpio; basta con que cada módulo se cargue una vez y la pieza
 *  falte desde antes de cargarlo. */
async function abrir(mod, trab) {
  try {
    const lib = await import(resolver(mod));
    lib.GlobalWorkerOptions.workerSrc = resolver(trab);
    const doc = await lib.getDocument({ data: pdfDePrueba(), isEvalSupported: false, useSystemFonts: false }).promise;
    const pg = await doc.getPage(1);
    const vp = pg.getViewport({ scale: 1 });
    const r = { paginas: doc.numPages, ancho: vp.width, alto: vp.height };
    await doc.destroy();
    return r;
  } catch (e) { return { error: String(e?.message || e) }; }
}

console.log('· el teléfono de prueba es de verdad viejo');
delete Promise.withResolvers;
rev(typeof Promise.withResolvers === 'undefined', 'sin Promise.withResolvers, como Chrome < 119');

console.log('· con la versión moderna de pdf.js, así se veía en el teléfono');
const antes = await abrir('pdfjs-dist/build/pdf.mjs', 'pdfjs-dist/build/pdf.worker.min.mjs');
rev(!!antes.error, 'truena al abrir, antes de pintar: el cuadro blanco de la foto', antes.error || JSON.stringify(antes));

console.log(`· con lo que importa la app (${modulo})`);
rev(!!modulo && !!trabajador, 'web/src/pdf.js dice qué módulo y qué trabajador usa', `${modulo} · ${trabajador}`);
const ahora = modulo && trabajador ? await abrir(modulo, trabajador) : { error: 'sin módulo' };
rev(!ahora.error, 'abre el PDF', ahora.error || '');
rev(ahora.paginas === 1 && ahora.ancho === 792 && ahora.alto === 612, 'y lee la hoja de verdad (792×612), no se queda en 300×150', `${ahora.ancho}×${ahora.alto}`);

console.log('· y si algún PDF aun así no se puede, la hoja lo dice');
const docs = readFileSync('web/src/DocsItem.jsx', 'utf8');
rev(/Este PDF no se pudo mostrar aquí/.test(docs) && /Abrir el PDF ↗/.test(docs), 'con un aviso y la liga para abrirlo aparte, no un cuadro blanco mudo');
rev(/Motivo: \{estado\}/.test(docs), 'y el motivo, para saber qué pasó');
rev(/Abriendo el PDF…/.test(docs), 'mientras abre, dice que está abriendo');

console.log(`\n${revisadas} revisadas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
