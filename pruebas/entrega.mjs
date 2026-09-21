/* La fecha de entrega del ítem y cuántos días faltan.
 *
 * Mike, 21-sep-2026: «hay que agregar un campo en el ítem de fecha de entrega
 * y un contador de cuántos días quedan para la entrega».
 *
 * POR QUÉ ESTO SE MIDE SOBRE LO ARMADO
 *
 * Lo que puede romperse aquí no truena: miente. Si la cuenta de los días se
 * copiara a esta pantalla, seguiría pintando un número —sólo que sacado del
 * reloj del aparato, y un celular de obra con la fecha mal puesta diría que
 * hay margen cuando ya se venció—. Y si la fecha se guardara aquí en vez de
 * en el ítem, la pantalla se vería igual de bien mientras dash101 y el
 * portal del cliente enseñan otra.
 *
 *   npm run build && node pruebas/entrega.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

console.log('· la cuenta de los días NO se hace aquí');
/* Viene resuelta de la API, en `item_entrega_falta`. Si esta pantalla
 * volviera a contarla, heredaría el reloj del aparato. */
rev(/item_entrega_falta/.test(panel), 'el panel lee la cuenta que manda la API');
rev(!/86400000|1000 ?\* ?60 ?\* ?60 ?\* ?24/.test(panel),
    'y no hay una resta de días escrita a mano en el panel');
rev(!/new Date\(\s*e\.item_fecha_entrega/.test(panel),
    'ni se construye una fecha con la del aparato para compararla');

console.log('· la fecha se guarda en el ÍTEM, que es el mismo de dash y del portal');
rev(/\/elements\/\$\{e\.id\}\/entrega/.test(panel), 'se fija por la ruta de la obra');
rev(/cuerpo: \{ fecha: valor \}/.test(panel), 'mandando la fecha tal cual, sin adornos');

console.log('· sin fecha se ofrece ponerla, no se pinta una alarma');
rev(/Sin fecha de entrega/.test(panel), 'lo dice con letras');
rev(/Poner fecha/.test(panel), 'y ofrece el botón');
rev(/Quitar/.test(panel), 'y se puede volver a dejar sin fecha');

console.log('· quién la puede fijar');
rev(/\{staff && \(\s*<button className="btn sm" onClick=\{\(\) => setAbierto\(true\)\}/.test(panel)
    || /staff && \(/.test(panel.slice(panel.indexOf('function Entrega'), panel.indexOf('function Alcance'))),
    'el botón de cambiarla es del supervisor; el contratista sólo la lee');

console.log('· y todo eso llegó a lo armado');
rev(js.includes('item_entrega_falta'), 'el paquete trae la cuenta de la API');
rev(js.includes('Sin fecha de entrega'), 'y el texto de cuando no hay');
rev(/\.pill\.entrega\.tarde\{/.test(css), 'lo vencido se pinta distinto');
rev(/\.pill\.entrega\.cerca\{/.test(css), 'y lo que ya viene encima también');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
