/* El plano no se voltea cuando el PDF trae su propio giro adentro.
 *
 * Mike, 19-oct-2026: «Cuando abro ese proyecto en el app de Android abre el
 * plano bien y luego lo Voltea.»
 *
 * POR QUÉ ESTO SE MIDE Y NO SE RAZONA
 *
 * Todo el enredo cuelga de una pregunta sobre pdf.js que no se puede contestar
 * leyendo el código de aquí: cuando a un viewport se le pide `rotation`, ¿se
 * suma al `/Rotate` que el PDF trae adentro, o lo reemplaza? De la respuesta
 * depende cuál de las dos capas del plano queda cruzada. Así que aquí se le
 * pregunta a pdf.js, con un PDF armado a mano con `/Rotate 90`, y se miden las
 * cuentas de `giroDeHoja` con los casos de verdad: el plano viejo (imagen
 * rasterizada respetando el `/Rotate`) y el nuevo (rasterizada con el giro con
 * que se subió).
 *
 *   npm run build && node pruebas/el-plano-no-se-voltea.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { giroDeHoja } from '../web/src/plano.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

/* Un PDF de una página, sin comprimir, con el `/Rotate` que se le pida. Se
 * arma aquí para no cargar un archivo binario al repositorio por una medición
 * de dos líneas, y para que se vea qué tiene adentro. */
function pdfDeUnaPagina({ rotate = 0, ancho = 595, alto = 842 }) {
  const trazo = `1 0 0 RG 4 w 40 40 m ${ancho - 40} ${alto - 40} l S`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Rotate ${rotate} /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${trazo.length} >>\nstream\n${trazo}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const donde = [];
  objs.forEach((o, i) => { donde.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const d of donde) pdf += `${String(d).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array([...pdf].map((c) => c.charCodeAt(0)));
}

console.log('· qué hace de verdad `rotation` en el viewport de pdf.js');
// El mismo build que se lleva la app: el legacy, por los Android viejos.
const lib = await import('../web/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const pagina = async (opts) => (await lib.getDocument({ data: pdfDeUnaPagina(opts), disableWorker: true }).promise).getPage(1);
const forma = (vp) => `${Math.round(vp.width)}x${Math.round(vp.height)}`;

const pg90 = await pagina({ rotate: 90 });
const sinPedir = pg90.getViewport({ scale: 1 });
const pidiendo0 = pg90.getViewport({ scale: 1, rotation: 0 });
rev(pg90.rotate === 90, 'el PDF armado trae /Rotate 90', `page.rotate=${pg90.rotate}`);
rev(forma(sinPedir) === '842x595', 'sin pedir giro, la hoja sale de lado: pdf.js respeta el /Rotate', forma(sinPedir));
rev(forma(pidiendo0) === '595x842', 'pidiendo rotation: 0, sale vertical: el giro pedido REEMPLAZA al /Rotate', forma(pidiendo0));
rev(forma(pg90.getViewport({ scale: 1, rotation: 90 })) === '842x595', 'y pidiendo 90 vuelve a salir de lado', '842x595');
const pg0 = await pagina({ rotate: 0 });
rev(forma(pg0.getViewport({ scale: 1 })) === forma(pg0.getViewport({ scale: 1, rotation: 0 })), 'en un PDF sin /Rotate da igual pedirlo o no');

console.log('· con qué giro se le pide la página (giroDeHoja)');
// Un PDF normal, subido girado a mano: manda el giro guardado, sin adivinar.
let r = giroDeHoja({ rotatePagina: 0, anchoPagina: 595, altoPagina: 842, giroGuardado: 90, anchoPlano: 3600, altoPlano: 2543 });
rev(r.giro === 90 && r.cuadra && !r.relativo, 'PDF sin /Rotate: se usa el giro con que se subió', `${r.giro}°`);

// El caso de Mike: plano subido ANTES del 1-oct (su imagen respeta el /Rotate,
// salió apaisada) y el PDF trae /Rotate 90. Pedir 0 lo pondría vertical encima.
r = giroDeHoja({ rotatePagina: 90, anchoPagina: 595, altoPagina: 842, giroGuardado: 0, anchoPlano: 3600, altoPlano: 2543 });
rev(r.giro === 90 && r.cuadra && r.relativo, 'plano viejo con /Rotate 90: la capa nítida se gira igual que la imagen', `${r.giro}°`);

// El mismo PDF subido hoy sin girarlo: su imagen SÍ salió vertical, y así se pide.
r = giroDeHoja({ rotatePagina: 90, anchoPagina: 595, altoPagina: 842, giroGuardado: 0, anchoPlano: 2543, altoPlano: 3600 });
rev(r.giro === 0 && r.cuadra && !r.relativo, 'plano nuevo con /Rotate 90: se respeta el giro guardado', `${r.giro}°`);

// Sin medidas de la imagen no hay con qué comparar: se queda el guardado.
r = giroDeHoja({ rotatePagina: 90, anchoPagina: 595, altoPagina: 842, giroGuardado: 180, anchoPlano: 0, altoPlano: 0 });
rev(r.giro === 180 && r.cuadra, 'sin medidas del plano no se adivina nada', `${r.giro}°`);

// Hoja cuadrada: las dos opciones se ven igual, y el empate lo gana el guardado.
r = giroDeHoja({ rotatePagina: 90, anchoPagina: 600, altoPagina: 600, giroGuardado: 0, anchoPlano: 2000, altoPlano: 2000 });
rev(r.giro === 0 && r.cuadra && !r.relativo, 'hoja cuadrada: empate, manda el guardado');

// Ni girada ni derecha cuadra con la imagen: la capa nítida no se dibuja.
r = giroDeHoja({ rotatePagina: 90, anchoPagina: 595, altoPagina: 842, giroGuardado: 0, anchoPlano: 2000, altoPlano: 2000 });
rev(!r.cuadra, 'si no cuadra con ninguno de los dos, lo dice, para no tapar el plano');

// Basura en el giro guardado (un texto, un número que no es múltiplo de 90).
r = giroDeHoja({ rotatePagina: 90, anchoPagina: 595, altoPagina: 842, giroGuardado: 'x', anchoPlano: 3600, altoPlano: 2543 });
rev(r.giro === 90, 'un giro guardado que no sirve se lee como 0', `${r.giro}°`);
r = giroDeHoja({ rotatePagina: 270, anchoPagina: 595, altoPagina: 842, giroGuardado: 180, anchoPlano: 3600, altoPlano: 2543 });
rev(r.giro === 90, '/Rotate 270 + 180 guardados dan la vuelta completa y paran en 90', `${r.giro}°`);

console.log('· y la pantalla del plano lo usa así');
const lienzo = readFileSync('web/src/PlanCanvas.jsx', 'utf8');
rev(/giroDeHoja\(\{/.test(lienzo) && /rotatePagina: pg\.rotate/.test(lienzo), 'PlanCanvas le pasa el /Rotate de la página');
rev(/giroGuardado: plan\.rotation/.test(lienzo) && /anchoPlano: plan\.width/.test(lienzo), 'con el giro guardado y las medidas de la imagen');
rev(/getViewport\(\{ scale: 1, rotation: 0 \}\)/.test(lienzo), 'y mide la hoja natural pidiendo rotation: 0, que es la medida sin /Rotate');
rev(/if \(!cuadra\) \{ setFalla\(true\); return; \}/.test(lienzo), 'si no cuadra, se apaga la capa nítida en vez de dibujarla cruzada');
rev(!/const rotation = \[90, 180, 270\]\.includes/.test(lienzo), 'ya no se usa el giro guardado a secas');

const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(js.includes('rotatePagina'), 'y eso llegó a lo armado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
