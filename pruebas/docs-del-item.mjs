/* Los archivos del ítem: el principal que se anota y los de soporte.
 *
 * Mike, 21-sep-2026: «necesito en quell un apartado por ítem de
 * documentación (…). Y después poder actualizar ese PDF a una versión nueva,
 * sin borrar la anterior, pero archivarla (…). Y una opción para ver
 * versiones anteriores por si hay dudas». Y: «hay un archivo base que es el
 * plano o imagen sobre la que están las anotaciones del ítem, sería como el
 * principal, y los demás archivos son de soporte. Sólo en el principal se
 * hacen anotaciones».
 *
 * POR QUÉ ESTO SE MIDE SOBRE LO ARMADO
 *
 * Nada de lo que puede romperse aquí truena: se degrada en silencio y con
 * buena cara.
 *
 *   · Si las marcas se guardaran en píxeles, la pantalla seguiría pintando
 *     notas —sólo que en otro lado en el celular que en la compu—. Y quien
 *     anota nunca ve las dos pantallas a la vez, así que el error lo
 *     descubre el de taller cuando corta la pieza mal.
 *   · Si esta pantalla decidiera quién puede anotar, el contratista vería un
 *     botón que la API le va a rechazar; y el día que la regla cambie,
 *     habría dos versiones de ella.
 *   · Si «archivar» se pintara como «borrar», Mike pediría dos veces la
 *     misma cosa: pidió expresamente que la anterior NO se borre.
 *
 *   npm run build && node pruebas/docs-del-item.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const docs = readFileSync('web/src/DocsItem.jsx', 'utf8');
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const puerta = readFileSync('worker/index.js', 'utf8');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

console.log('· el botón está en el encabezado del ítem, donde lo pidió Mike');
rev(/import Docs from '\.\/DocsItem\.jsx'/.test(panel), 'el panel del ítem trae el apartado');
rev(/<Docs e=\{e\} staff=\{staff\} \/>/.test(panel), 'y lo pinta en el encabezado, no en una pestaña aparte');
rev(/Archivos del ítem/.test(docs), 'el botón se llama «Archivos del ítem»');

console.log('· la pantalla principal es la hoja, y lo demás va en una barra al lado');
rev(/visor-hoja/.test(docs) && /visor-lado/.test(docs), 'hay hoja grande y barra lateral');
rev(/\.visor-cuerpo\{[^}]*flex-direction:row-reverse/.test(css),
    'la barra va al lado de la hoja, no encima de ella');
/* El minificador reescribe `(max-width:760px)` como `(width<=760px)`: se
 * aceptan las dos formas, que son la misma regla. */
rev(/@media \((?:max-width:760px|width<=760px)\)\{[^@]*\.visor-cuerpo\{flex-direction:column\}/.test(css),
    'y en el celular se apila, porque una columna de 280 dejaría el plano en nada');

console.log('· hay UN principal y los demás son de soporte');
rev(/El principal/.test(docs) && /De soporte/.test(docs), 'la barra los separa con su nombre');
rev(/Aquí van las anotaciones/.test(docs), 'y dice cuál es el que se anota');

console.log('· sólo se anota el principal VIVO, y eso no lo decide esta pantalla');
/* La condición de aquí es para no pintar un botón que la API va a rechazar.
 * La regla vive en el motor; esto es cortesía, no permiso. */
rev(/const anotable = [^;]*activo\.id === principal\.id && staff/.test(docs),
    'el modo «anotar» sólo aparece sobre el principal y a quien escribe');
rev(/if \(!anotable\) setModo\(null\)/.test(docs),
    'y se apaga solo al cambiar a un archivo que no se anota');

console.log('· las marcas van RELATIVAS, de 0 a 1, no en píxeles');
/* Lo que de verdad protege esto: `rel()` divide entre el tamaño de la hoja
 * pintada. Si alguien devolviera clientX pelón, la marca se pintaría bien en
 * la pantalla donde se hizo y en ninguna otra. */
rev(/\(ev\.clientX - r\.left\) \/ r\.width/.test(docs) && /\(ev\.clientY - r\.top\) \/ r\.height/.test(docs),
    'el toque se divide entre el ancho y el alto de la hoja');
rev(/Math\.min\(1, Math\.max\(0,/.test(docs), 'y se recorta a 0–1 antes de mandarlo');
rev(/viewBox="0 0 1 1"/.test(docs), 'la capa de marcas usa el mismo sistema de 0 a 1');
rev(/vectorEffect="non-scaling-stroke"/.test(docs),
    'y el grosor del trazo no se estira con el viewBox');

console.log('· las dos maneras de anotar que escogió Mike con botones');
rev(/tipo: 'nota'/.test(docs), 'notas ancladas');
rev(/tipo: 'trazo'/.test(docs), 'y rayar encima');
rev(/polyline/.test(docs), 'el trazo se pinta como línea, no como una imagen aplanada');

console.log('· la versión nueva ARCHIVA la anterior; no la borra');
rev(/\/version`/.test(docs), 'se sube por la ruta de versión, no como principal nuevo');
rev(/no se borra/.test(docs) && /queda archivada/.test(docs),
    'y la pantalla lo dice con esas palabras antes de subir');
rev(/Ver versiones anteriores/.test(docs), 'hay opción para consultar las anteriores');
rev(/Se consulta, no se anota/.test(docs),
    'y al abrir una archivada se avisa que es de consulta');

console.log('· copiar las marcas es una decisión, y se dice qué implica ANTES');
rev(/Empezar limpio/.test(docs) && /Traer las marcas/.test(docs), 'son dos botones, no una casilla');
rev(/van a quedar señalando a otro lado/.test(docs), 'y cada uno dice su consecuencia');

console.log('· la puerta reenvía docs y marcas al motor sin inventarse nada');
/* No hay ruta especial: el cascarón manda todo lo que no conoce al motor.
 * Si alguien agregara aquí un caso para `docs`, sería una segunda regla. */
rev(/return aLaSuite\(req, env, url, `\/\$\{seg\.join\('\/'\)\}`\);/.test(puerta),
    'el catch-all del Worker se las lleva a /orgs/:o/quell/…');
rev(!/'docs'/.test(puerta) && !/'marcas'/.test(puerta),
    'y la puerta no tiene un caso propio para docs ni para marcas');

console.log('· y todo eso llegó a lo armado');
rev(js.includes('Archivos del ítem'), 'el paquete trae el botón');
rev(js.includes('copiar_marcas'), 'y la decisión de copiar marcas');
rev(/\.chinche\{/.test(css), 'y la chinche de las notas se pinta');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
