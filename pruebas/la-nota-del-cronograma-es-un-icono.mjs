/* La explicación del cronograma es un ícono de info (6-oct-2026).
 *
 * Mike, con una captura del cronograma: «elimina toda esa leyenda y redúcelo
 * a un iconito de info ahí donde te indico con la flecha» (la esquina de
 * arriba a la derecha del recuadro con «Arranca el» y «Costo de las fases»).
 *
 * Lo que se mide sin navegador: que la leyenda ya no esté suelta debajo del
 * recuadro, que el ícono viva DENTRO del recuadro con su nombre para el
 * lector de pantalla, que abra y cierre (con el ícono, Escape o picando
 * fuera), que el texto siga completo dentro, y que lo armado lo traiga.
 *
 *   npm run build && node pruebas/la-nota-del-cronograma-es-un-icono.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const crono = readFileSync('web/src/Cronograma.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');

console.log('· la leyenda');
rev(!/className="crono-nota/.test(crono), 'ya no hay leyenda suelta debajo del recuadro');
rev(!/\.crono-nota\{/.test(css), 'ni su estilo');

console.log('· el ícono');
const cab = crono.slice(crono.indexOf('<div className="crono-cab">'), crono.indexOf('<div className="campo">'));
rev(/<InfoDelCronograma /.test(cab), 'el ícono es lo primero dentro del recuadro de arriba');
rev(/data-crono-info/.test(crono) && /aria-label="Cómo funciona el cronograma"/.test(crono) && /aria-expanded=\{abierto\}/.test(crono), 'es un botón con nombre y dice si está abierto');
rev(/<svg viewBox="0 0 24 24"[^>]*aria-hidden="true"><circle/.test(crono), 'el dibujo es una «i» en un círculo');
rev(/\.crono-cab\{position:relative/.test(css) && /\.crono-info\{position:absolute;top:8px;right:8px/.test(css), 'va en la esquina de arriba a la derecha');

console.log('· abre y cierra');
rev(/onClick=\{\(\) => setAbierto\(\(a\) => !a\)\}/.test(crono), 'el ícono abre y cierra');
rev(/e\.key === 'Escape'/.test(crono) && /addEventListener\('mousedown', fuera\)/.test(crono), 'Escape o picar fuera la cierra');
rev(/removeEventListener\('mousedown', fuera\)/.test(crono) && /removeEventListener\('keydown', tecla\)/.test(crono), 'y suelta los escuchas al cerrarse');

console.log('· el texto sigue completo, adentro');
const ayuda = crono.slice(crono.indexOf('function InfoDelCronograma'), crono.indexOf('const tarea = ('));
for (const [re, que] of [
  [/material 10 días, fabricación 24 e instalación 12/, 'las fases default'],
  [/muebles 30 % materiales y 30 % mano de obra; puertas 35 y 35; servicios 5 y 55; acabados 40 y 20/, 'los porcentajes por tipo'],
  [/precio de cada pieza: el del ítem entre su cantidad/, 'sobre qué precio'],
  [/Los días se cuentan de lunes a sábado/, 'cómo se cuentan los días'],
  [/anticipo .* diseño definido/, 'los dos candados'],
  [/Arrastra una barra sobre otra/, 'cómo se encadena en la gráfica'],
  [/\{conTiempo\} de \{total\} piezas con tiempo/, 'cuántas piezas tienen tiempo'],
]) rev(re.test(ayuda), que);

console.log('· lo armado');
let js = '';
try { js = readdirSync('web/dist/assets').filter((f) => f.endsWith('.js')).map((f) => readFileSync('web/dist/assets/' + f, 'utf8')).join('\n'); } catch { /* sin armar */ }
rev(js.includes('Cómo funciona el cronograma') && !js.includes('crono-nota'), 'el bundle trae el ícono y no la leyenda', js ? '' : 'falta npm run build');

console.log(`\n${revisadas - fallas}/${revisadas} en verde`);
process.exit(fallas ? 1 : 0);
