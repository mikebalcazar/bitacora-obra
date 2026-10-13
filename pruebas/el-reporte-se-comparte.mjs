/* El reporte se comparte como PDF desde el teléfono (9-oct-2026).
 *
 * Mike: «en quell, cuando quiero generar un reporte, desde el iPhone y
 * Android quiero poder compartir directo a alguna app tipo WhatsApp el PDF
 * ya listo».
 *
 * Lo que se mide sin navegador: el PDF se arma al abrir el reporte (en el
 * iPhone la hoja de compartir sólo abre en el mismo toque); cada hoja va a
 * una A4 y la que creció se parte; el nombre del archivo; el botón dice
 * «Armando PDF…», «Compartir PDF» o «Descargar PDF»; dentro de la app de
 * Android se comparte con los plugins Filesystem + Share, que el armado de
 * la app instala; en el navegador, con navigator.share; si no, se descarga.
 * El recorrido con PDF de verdad se hizo en Chromium (ver el PR).
 *
 *   npm run build && node pruebas/el-reporte-se-comparte.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const proj = readFileSync('web/src/Project.jsx', 'utf8');
const pdfJs = readFileSync('web/src/reportePdf.js', 'utf8');
const comp = readFileSync('web/src/compartir.js', 'utf8');
const apps = readFileSync('.github/workflows/apps.yml', 'utf8');
const webPkg = JSON.parse(readFileSync('web/package.json', 'utf8'));
const { cortes, nombreDelReporte, ANCHO_PX, medidaReducida, LADO_MAX_PX } = await import('../web/src/reportePdf.js');
const repJs = readFileSync('web/src/report.js', 'utf8');

console.log('· el PDF');
rev(ANCHO_PX === 794, 'se dibuja a lo ancho de una A4 (794 px), no del teléfono');
rev(JSON.stringify(cortes(2246, 1588)) === '[[0,2246]]', 'una hoja que cabe va en una A4');
rev(JSON.stringify(cortes(2280, 1588)) === '[[0,2280]]', 'si sobra muy poco (≤2 %) no se parte');
rev(cortes(5000, 1588).length === 3 && cortes(5000, 1588).at(-1)[1] === 5000, 'una hoja larga (muchas fotos) se parte en varias A4', JSON.stringify(cortes(5000, 1588)));
rev(nombreDelReporte('Reporte de punchlist', 'Sanje', new Date(2026, 9, 9)) === 'Reporte de punchlist - Sanje - 2026-10-09.pdf', 'el nombre: reporte, obra y fecha', nombreDelReporte('Reporte de punchlist', 'Sanje', new Date(2026, 9, 9)));
rev(nombreDelReporte('Reporte', 'Obra/Lomas: "A"', new Date(2026, 9, 9)) === 'Reporte - Obra Lomas A - 2026-10-09.pdf', 'sin lo que un teléfono no acepta en un nombre');
rev(/useCORS: true/.test(pdfJs) && /scale: 2/.test(pdfJs), 'las fotos entran y la letra chica se lee (al doble)');
rev(/import\('jspdf'\)/.test(pdfJs) && /import\('html2canvas-pro'\)/.test(pdfJs) && webPkg.dependencies.jspdf && webPkg.dependencies['html2canvas-pro'], 'las librerías se bajan sólo al abrir un reporte');

/* 13-oct-2026 · Mike: «los reportes de punchlist de quell no están saliendo
 * con las imágenes en el pdf. Salen vacíos los recuadros». Y cada hoja
 * dejaba detrás otra en blanco con sólo el pie (32 hojas para 16). El
 * recorrido en Chromium (como Pixel 7, CPU 6× lenta) quedó en el PR. */
console.log('· las fotos y las hojas (13-oct)');
rev(/await incrustarImagenes\(caja\);\s*const hojas/.test(pdfJs), 'antes de dibujar, cada foto se baja UNA vez y entra ya dibujada (como el plano)');
rev(/fetch\(src, \{ credentials: 'same-origin' \}\)/.test(pdfJs) && /URL\.createObjectURL\(blob\)/.test(pdfJs), 'por fetch y blob: no ensucia el lienzo ni en la app de Android');
rev(LADO_MAX_PX === 1400 && JSON.stringify(medidaReducida(4032, 3024)) === '{"w":1400,"h":1050}', 'una foto de 12 MP se reduce a 1400 px por lado (se ve igual en la A4, pesa mucho menos)', JSON.stringify(medidaReducida(4032, 3024)));
rev(JSON.stringify(medidaReducida(800, 600)) === '{"w":800,"h":600}', 'una foto chica no se agranda');
rev(/h\.style\.boxSizing = 'border-box';/.test(pdfJs) && /h\.style\.minHeight = `\$\{Math\.round\(ANCHO_PX \* A4\.h \/ A4\.w\)\}px`;/.test(pdfJs), 'cada hoja mide una A4 con su margen: ya no sale una hoja en blanco detrás');
rev(/fetch\(src, \{ credentials: 'same-origin' \}\)/.test(repJs) && /URL\.createObjectURL\(b\)/.test(repJs), 'el recorte del plano también se baja por fetch y blob');

console.log('· la pantalla del reporte');
rev(/armarPdf\(html, REPORT_CSS,/.test(proj) && /useEffect\(\(\) => \{\s*let vivo = true;/.test(proj), 'el PDF se arma al abrir, no al picar (el iPhone sólo comparte en el mismo toque)');
rev(/!pdf \? `Armando PDF…\$\{avance \? ' ' \+ avance : ''\}`/.test(proj), 'mientras, el botón dice «Armando PDF… n/m»');
rev(/pdf\.hoja \? 'Compartir PDF' : 'Descargar PDF'/.test(proj), 'ya listo: «Compartir PDF» donde hay hoja, «Descargar PDF» donde no');
rev(/onClick=\{\(\) => window\.print\(\)\}[^>]*>Imprimir<\/button>/.test(proj), 'imprimir sigue ahí');

console.log('· compartir');
rev(/const nativos = \(\) => \(esAndroid\(\) \? \{ Fs: plugin\('Filesystem'\), Share: plugin\('Share'\) \} : \{\}\);/.test(comp), 'en la app de Android, con los plugins Filesystem y Share');
rev(/Fs\.writeFile\(\{ path: archivo\.name, data: await aBase64\(archivo\), directory: 'CACHE' \}\)/.test(comp) && /Share\.share\(\{ files: \[uri\], dialogTitle: 'Compartir' \}\)/.test(comp), 'se guarda en la caché de la app y se abre la hoja de Android con él');
rev(/navigator\.share\(\{ files: \[archivo\] \}\)/.test(comp), 'en el navegador (iPhone, Chrome), la hoja del navegador');
rev(!/share\(\{[^}]*\b(title|text|url):/.test(comp), 'sólo el ARCHIVO, sin título, texto ni liga (WhatsApp se quedaba con el texto)');
rev(/return entregar\(new File\(\[blob\]/.test(comp), 'las fotos y planos comparten igual (también en la app de Android)');
rev(/@capacitor\/filesystem@\^7 @capacitor\/share@\^7/.test(apps) && /grep -q '@capacitor\/share' android\/capacitor\.settings\.gradle/.test(apps), 'el armado de la app instala los dos plugins y lo revisa');
rev(/grep -q 'cache-path' android\/app\/src\/main\/res\/xml\/file_paths\.xml/.test(apps), 'y revisa que Android deje leer la caché a la otra app');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Compartir PDF/.test(js) && /Armando PDF/.test(js), 'está en el JavaScript publicado');
rev(readdirSync(dir).some((f) => /^jspdf/.test(f)) && readdirSync(dir).some((f) => /^html2canvas-pro/.test(f)), 'con las librerías en archivos aparte');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
