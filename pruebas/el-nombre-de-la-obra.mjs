/* El nombre de la obra se corrige desde el inicio, dejándola presionada.
 *
 * Mike, 19-oct-2026: «También quiero poder editar el nombre del proyecto desde
 * la pantalla principal de quell. A lo mejor dejando presionado sobre el
 * proyecto y que pregunte "editar?"».
 *
 * POR QUÉ ESTO SE MIDE SOBRE LA FUENTE Y LO ARMADO
 *
 * Una pulsación larga encima de algo que ya se pica es fácil de romper sin que
 * truene nada: si al soltar no se cancela el toque, se abre la obra con la
 * pregunta encima; si el movimiento del dedo no cancela, deslizar la lista
 * saca la pregunta sola; y si el gesto no está sólo para el taller, se le
 * enseña a un contratista una pantalla que la API le va a rechazar con 403.
 * Nada de eso se ve en una captura: se revisa renglón por renglón.
 *
 *   npm run build && node pruebas/el-nombre-de-la-obra.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const home = readFileSync('web/src/Home.jsx', 'utf8');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

console.log('· dejar la obra presionada saca la pregunta');
rev(/onPointerDown=\{\(e\) => presionaObra\(p, e\)\}/.test(home), 'la tarjeta de la obra escucha la pulsación');
rev(/const PRESION_MS = 500/.test(home), 'medio segundo, que es lo que el celular entiende por «dejar presionado»');
rev(/setTimeout\(\(\) => \{[\s\S]{0,200}setRenombrando\(p\)/.test(home), 'y al cumplirse, sale la pregunta de esa obra');
rev(/if \(!staff \|\| \(ev\.pointerType === 'mouse' && ev\.button !== 0\)\)/.test(home), 'sólo para el taller, y con el botón izquierdo: la API lo exige (isStaff)');

console.log('· y no estorba lo que la tarjeta ya hacía');
rev(/onPointerUp=\{sueltaPresion\} onPointerCancel=\{sueltaPresion\}/.test(home), 'al soltar se cancela lo que no alcanzó a cumplirse');
rev(/if \(Math\.abs\(ev\.clientX - presion\.current\.x\) > 10/.test(home), 'si el dedo se movió, estaba deslizando la lista');
rev(/presion\.current\.saltar = true/.test(home) && /if \(presion\.current\.saltar\) \{ presion\.current\.saltar = false; return; \}/.test(home),
    'y después de la pregunta, el toque no abre también la obra');
rev(/onClick=\{\(\) => abreObra\(p\)\}/.test(home), 'picar la obra sigue abriéndola');
rev(/e\.key === 'F2'/.test(home), 'con teclado, que no tiene pulsación larga, renombra F2');
rev(/WebkitTouchCallout: 'none'/.test(home) && /userSelect: 'none'/.test(home), 'el teléfono no saca su propio menú encima de la pregunta');

console.log('· la pregunta pregunta, y guarda nada más el nombre');
rev(/function RenombrarObra\(\{ p, onClose, onHecho \}\)/.test(home), 'hay una pantalla para eso');
rev(/¿Editar «\{p\.name\}»\?/.test(home), 'que pregunta «¿Editar «la obra»?», como lo pidió Mike');
rev(/onFocus=\{\(e\) => e\.target\.select\(\)\}/.test(home), 'con el nombre viejo escrito y seleccionado, listo para corregir');
rev(/api\.patch\(`\/projects\/\$\{p\.id\}`, \{ name: limpio \}\)/.test(home), 'y guarda sólo el nombre (el cliente amarra a dash101 y quote101)');
rev(/if \(limpio === String\(p\.name\)\.trim\(\)\) \{ onClose\(\); return; \}/.test(home), 'si no se cambió nada, no se molesta al servidor');
rev(/onHecho=\{\(\) => \{ setRenombrando\(null\); load\(\); \}\}/.test(home), 'y la lista se vuelve a leer con el nombre nuevo');

console.log('· y todo eso llegó a lo armado');
rev(js.includes('¿Editar «'), 'el paquete trae la pregunta');
rev(js.includes('Déjalo presionado para cambiarle el nombre'), 'y el aviso de cómo se llega a ella');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
