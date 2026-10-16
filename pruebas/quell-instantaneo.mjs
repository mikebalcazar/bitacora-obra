/* quell instantáneo (16-oct-2026).
 *
 * Mike: «que en pantalla sea suuuuper snappy y que en el background se vayan
 * subiendo esos cambios». Se midió en staging: cada toque (palomear un
 * pendiente) tardaba ~3 s, con señal buena o mala, porque la pantalla esperaba
 * al servidor dos veces —guardar y volver a leer— y cada viaje costaba ~1.4 s.
 * Con este cambio, medido de punta a punta con el navegador contra staging:
 * ~50 ms por toque y ~35 ms al volver a abrir un ítem.
 *
 * Lo que se mide aquí sin navegador: escribir encola, pinta y regresa sin
 * esperar al servidor; la fila se vacía por detrás y da otra vuelta si entró
 * algo mientras subía; leer enseña lo guardado y se pone al día por detrás, y
 * mientras haya algo por subir lo del teléfono manda; lo creado lleva el id de
 * la operación (API 0.103.0); las fotos por subir se pintan desde su archivo;
 * lo que el servidor rechaza se dice; y lo armado lo trae.
 *
 *   npm run build && node pruebas/quell-instantaneo.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const api = readFileSync('web/src/api.js', 'utf8');
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const obra = readFileSync('web/src/Project.jsx', 'utf8');
const fotos = readFileSync('web/src/Fotos.jsx', 'utf8');
const app = readFileSync('web/src/App.jsx', 'utf8');
const trozo = (s, a, b) => s.slice(s.indexOf(a), b ? s.indexOf(b, s.indexOf(a)) : undefined);
const escribe = trozo(api, 'export async function escribir(', 'let vaciando');
const lee = trozo(api, 'export async function leer(', '// Escribir.');
const vacia = trozo(api, 'export async function vaciaFila(', "if (typeof window !== 'undefined')");

console.log('· escribir no espera');
const sinEsperar = escribe.slice(escribe.indexOf('const op = {'));
rev(/await local\.encola\(op\);/.test(sinEsperar) && /await local\.parchea\(/.test(sinEsperar), 'encola y pinta en el teléfono');
rev(/if \(hayRed\(\)\) vaciaFila\(\);/.test(sinEsperar) && !/await vaciaFila/.test(sinEsperar) && !/await call\(/.test(sinEsperar), 'y la fila sube por detrás: no se espera al servidor');
rev(/parche\.fn\(d, \{ id: idOp, archivos: archivos \|\| \[\] \}\)/.test(sinEsperar), 'el parche recibe el id de la operación y los archivos');
rev(/sinSenal: !hayRed\(\)/.test(sinEsperar), 'y avisa si no hay señal, para decirlo en pantalla');
rev(/if \(esperar && hayRed\(\)\)/.test(escribe), 'sólo `esperar` espera al servidor, y sólo con señal');

console.log('· la fila');
rev(/if \(vaciando\) \{ otraVuelta = true;/.test(vacia) && /\} while \(otraVuelta && hayRed\(\)\);/.test(vacia), 'si algo entra mientras sube, da otra vuelta');
rev(/avisa\(\{ ultimoError, subidas, rechazadas \}\)/.test(vacia), 'al terminar dice cuántas subieron y cuántas rechazó el servidor');

console.log('· leer');
rev(/if \(guardado && \(soloCache \|\| porSubir > 0 \|\| alRefrescar\)\)/.test(lee), 'con algo por subir, o con `alRefrescar`, sale lo guardado');
rev(/if \(alRefrescar && !soloCache && !porSubir && hayRed\(\)\) refrescar\(/.test(lee), 'y se pone al día por detrás sólo si no hay nada por subir');
rev(/if \(await local\.cuantosFaltan\(\)\) return;/.test(trozo(api, 'async function refrescar(', 'export async function leer(')), 'una lectura que llega tarde no pisa lo que se hizo mientras');

console.log('· el ítem y la obra');
rev(/leer\(`\/elements\/\$\{id\}`, \{ alRefrescar: pon \}\)/.test(panel) && /if \(vigente\.current === id\) setD\(x\);/.test(panel), 'el ítem sale de lo guardado y no se cruza con otro abierto después');
rev(/leer\(`\/projects\/\$\{id\}`, \{ alRefrescar: pon \}\)/.test(obra), 'la obra también');
rev(/id: op\.id, title: f\.title\.trim\(\)/.test(panel) && /id: op\.id, text: txt\.trim\(\)/.test(panel), 'el pendiente y la nota nuevos llevan el id de la operación (API 0.103.0)');
rev(!/'local-' \+ Date\.now\(\)/.test(panel + obra), 'ya no hay ids «local-» que el servidor no conoce');
for (const [que, re] of [
  ['borrar un pendiente', /metodo: 'DELETE', ruta: `\/punch\/\$\{k\.id\}`, parche:/],
  ['quitar una foto', /metodo: 'DELETE', ruta: `\/photos\/\$\{p\.id\}`, parche:/],
  ['agregar fotos a un pendiente', /ruta: `\/punch\/\$\{k\.id\}\/photos`, campos: \{\}, archivos,/],
]) rev(re.test(panel), `${que} va por la fila, con parche`);
rev(!/api\.(del|form)\(`\/(punch|photos)\//.test(panel), 'ninguno se queda esperando al servidor');

console.log('· fotos y avisos');
rev(/if \(!p\.blob\) return fileUrl\(p\.r2_key\);/.test(fotos) && /URL\.createObjectURL\(p\.blob\)/.test(fotos), 'la foto por subir se pinta desde su archivo');
rev(/if \(n\.rechazadas > 0 && n\.ultimoError\) setToast\(`No se guardó un cambio: \$\{n\.ultimoError\}`\);/.test(app), 'lo que el servidor rechaza se dice');
rev(/setTimeout\(\(\) => setTarda\(true\), 4000\)/.test(app) && /red\.faltan > 0 && tarda/.test(app), '«Subiendo…» sale sólo si tarda más de 4 s, no en cada toque');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/No se guardó un cambio/.test(js) && /alRefrescar/.test(js), 'está en el JavaScript publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
