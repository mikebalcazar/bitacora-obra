/* El PDF del ítem se lee: píxeles de verdad y acercamiento.
 *
 * Mike, 28-sep-2026: «En quell, cuando abro el archivo del ítem (un pdf) se
 * ve muy baja resolución y no sirve de nada, no se puede leer».
 *
 * POR QUÉ ESTO SE MIDE CON NÚMEROS Y NO MIRANDO
 *
 * La falla no se ve en la compu de quien programa: ahí la pantalla pone un
 * píxel por punto y el plano sale aceptable. Se ve en el celular de Mike,
 * donde son tres por punto y el mismo lienzo queda estirado al triple. Así
 * que aquí se calcula, con la densidad del celular, cuántos píxeles lleva la
 * hoja; y se comprueba que los dos topes del navegador del teléfono se
 * respeten, porque pasarse de ellos no truena: deja la hoja en blanco.
 *
 *   npm run build && node pruebas/el-pdf-se-lee.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { medidasDeHoja, LADO_MAX, AREA_MAX } from '../web/src/nitidez.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const carta = { width: 792, height: 612 };      // un PDF carta apaisado, en puntos
const a0 = { width: 3370, height: 2384 };       // un plano A0

console.log('· en el celular de Mike (390 puntos, 3 píxeles por punto)');
let m = medidasDeHoja({ anchoCss: 390, dpr: 3, base: carta });
rev(m.ancho === 1170, 'a lo ancho, el lienzo lleva los píxeles de la pantalla, no los puntos', `${m.ancho}`);
rev(m.anchoCss === 390, 'y se muestra a lo ancho de la caja', `${m.anchoCss}`);
rev(Math.abs(m.ancho / m.alto - carta.width / carta.height) < 0.01, 'sin deformar la hoja');

m = medidasDeHoja({ anchoCss: 390, dpr: 3, zoom: 3, base: carta });
rev(m.ancho === 3510 && m.anchoCss === 1170, 'acercado al triple, el lienzo va al triple y la lámina también', `${m.ancho} / ${m.anchoCss}`);

console.log('· en la compu (1 píxel por punto) sigue igual que antes');
m = medidasDeHoja({ anchoCss: 800, dpr: 1, base: carta });
rev(m.ancho === 800, 'a lo ancho de la caja', `${m.ancho}`);

console.log('· los topes del navegador del teléfono');
m = medidasDeHoja({ anchoCss: 430, dpr: 3, zoom: 4, base: a0 });
rev(m.ancho <= LADO_MAX && m.alto <= LADO_MAX, 'ningún lado pasa del tope', `${m.ancho}×${m.alto}`);
rev(m.ancho * m.alto <= AREA_MAX, 'ni el total de píxeles', `${m.ancho * m.alto}`);
rev(m.ancho >= 3500, 'y aun así se acercó de verdad, no se quedó chico', `${m.ancho}`);
m = medidasDeHoja({ anchoCss: 1600, dpr: 4, zoom: 4, base: { width: 4000, height: 4000 } });
rev(m.ancho * m.alto <= AREA_MAX && m.ancho <= LADO_MAX, 'una hoja cuadrada enorme tampoco se pasa', `${m.ancho}×${m.alto}`);
m = medidasDeHoja({ anchoCss: 0, dpr: 0, zoom: 0, base: carta });
rev(m.ancho > 0 && m.alto > 0 && m.anchoCss > 0, 'sin medidas todavía, no sale un lienzo de cero');

console.log('· la pantalla usa esa cuenta, y ofrece acercar');
const docs = readFileSync('web/src/DocsItem.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');
rev(/medidasDeHoja\(\{[^}]*dpr: window\.devicePixelRatio/s.test(docs), 'la hoja pasa la densidad de la pantalla');
rev(/c\.width = m\.ancho; c\.height = m\.alto/.test(docs), 'y el lienzo toma los píxeles de la cuenta');
rev(/title="Acercar"/.test(docs) && /title="Alejar"/.test(docs), 'hay botones de acercar y alejar');
rev(/\[doc\.id, pagina, imagen, zoom\]/.test(docs), 'y al acercar se vuelve a pintar el PDF, no se estira el de antes');
rev(/\.docs-hoja\.acercada>\.lamina\{max-width:none\}/.test(css), 'acercada, la lámina puede medir más que la caja');
rev(/\.docs-hoja\.acercada[^{]*canvas\{[^}]*width:100%/.test(css), 'y el lienzo llena la lámina, con sus píxeles aparte');

const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/devicePixelRatio/.test(js) && /Acercar/.test(js), 'lo armado lo trae');

console.log(`\n${revisadas} revisadas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
