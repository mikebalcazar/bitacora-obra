/* El buzón de dudas como historial, con color por estado.
 *
 * Mike, 1-oct-2026: «en el buzón de dudas, las dudas sin responderse deben
 * tener un ligero tinte naranja/rojizo. las dudas ya respondidas deben tener
 * un ligero tinte verde. Pero todas deben verse (como historial ordenadas
 * por tiempo) y se puede apagar o prender la vista de las ya respondidas».
 *
 * Se mide sobre el fuente, como las demás de esta carpeta: que la lista sea
 * una sola ordenada por tiempo, que el interruptor exista y filtre, que cada
 * tarjeta diga su estado, y que el CSS pinte los dos tintes.
 *
 *   node pruebas/las-dudas-de-colores.mjs
 */
import { readFileSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`${ok ? 'ok' : 'FALLA'} - ${texto}${extra ? ` (${extra})` : ''}`);
};
const dudas = readFileSync(new URL('../web/src/Dudas.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');

rev(/const \[verRespondidas, setVerRespondidas\] = useState\(true\)/.test(dudas), 'las respondidas se ven de entrada; el interruptor empieza prendido');
rev(/const historial = \[\.\.\.dudas\]\s*\.sort\(\(a, b\) => String\(b\.created_at\)\.localeCompare\(String\(a\.created_at\)\)\)/.test(dudas), 'una sola lista, por tiempo, la más nueva arriba');
rev(/\.filter\(\(d\) => verRespondidas \|\| d\.estado === 'abierta'\)/.test(dudas), 'apagado, quedan sólo las que esperan');
rev(/\{historial\.map\(\(d\) => <Duda/.test(dudas), 'se pinta el historial, no abiertas y cerradas por separado');
rev(!/verCerradas/.test(dudas), 'el botón viejo de «ver resueltas» ya no existe');
rev(/data-respondidas=\{verRespondidas \? 'visibles' : 'ocultas'\}/.test(dudas), 'el interruptor dice en qué está');
rev(/\{verRespondidas \? 'Ocultar' : 'Mostrar'\} \{cerradas\.length\}/.test(dudas), 'y cuántas apaga o prende');
rev(/className=\{'duda ' \+ \(cerrada \? 'cerrada' : 'abierta'\)\} data-estado=\{cerrada \? 'respondida' : 'esperando'\}/.test(dudas), 'cada tarjeta lleva su estado en la clase y en el dato');
rev(/\.duda\.abierta\{background:#fff6f1;border-color:#f2c9b8\}/.test(css), 'la que espera va rojiza');
rev(/\.duda\.cerrada\{background:#f0f9f2;border-color:#bfe3c8\}/.test(css), 'la respondida va verde');
rev(!/\.duda\.cerrada\{opacity:\.72\}/.test(css), 'y ya no va apagada');

console.log(`\n${revisadas - fallas}/${revisadas} en verde`);
process.exit(fallas ? 1 : 0);
