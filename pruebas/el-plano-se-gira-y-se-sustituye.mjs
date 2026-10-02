/* El plano se gira al subirlo y se sustituye por versiones (OrgDB 0029).
 *
 * Mike, 2-oct-2026: «Cuando subo un plano en un proyecto de quell, quiero
 * poder rotarlo porque a veces el PDF viene vertical. Y también quiero poder
 * actualizar el plano. Subir y sustituir el que está para actualizar
 * versiones.»
 *
 * POR QUÉ ESTO SE MIDE SOBRE LA FUENTE Y LO ARMADO
 *
 * Lo que se puede romper aquí no truena: se degrada. Si el giro se aplicara a
 * la imagen y no al PDF de la capa nítida, el plano se vería bien hasta que
 * alguien se acercara, y entonces saldría cruzado. Si «Sustituir» creara otro
 * plano en vez de reemplazar éste, los pines se perderían sin aviso.
 *
 *   npm run build && node pruebas/el-plano-se-gira-y-se-sustituye.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const api = readFileSync('web/src/api.js', 'utf8');
const proyecto = readFileSync('web/src/Project.jsx', 'utf8');
const lienzo = readFileSync('web/src/PlanCanvas.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

console.log('· el giro se aplica al rasterizar, con el mismo número para PDF e imagen');
rev(/export async function rasterizePlan\(file, giro = 0\)/.test(api), 'rasterizePlan recibe el giro');
rev(/getViewport\(\{ scale: 1, rotation \}\)/.test(api) && /getViewport\(\{ scale: escala, rotation \}\)/.test(api),
    'un PDF se gira con el viewport de pdf.js, al medir y al dibujar');
rev(/ctx\.rotate\(\(rotation \* Math\.PI\) \/ 180\)/.test(api), 'una imagen se gira en el lienzo');
rev(/ultimo = \{ blob, width: w, height: h, rotation \}/.test(api), 'y el resultado dice con qué giro salió');

console.log('· la capa nítida gira igual que la imagen');
rev(/const rotation = \[90, 180, 270\]\.includes\(Number\(plan\.rotation\)\)/.test(lienzo), 'PlanCanvas lee el giro del plano');
rev(/pg\.getViewport\(\{ scale: 1, rotation \}\)/.test(lienzo) && /pg\.getViewport\(\{ scale: escala, rotation \}\)/.test(lienzo),
    'y se lo pasa a pdf.js en las dos cuentas');
rev(!/getViewport\(\{ scale: escala \}\)/.test(lienzo), 'ya no queda un viewport sin giro');

console.log('· subir pasa por la vista previa, y ahí se gira');
rev(/export function SubirPlanoModal/.test(proyecto), 'hay una vista previa antes de subir');
rev(/rotate\(\$\{giro\}deg\)/.test(proyecto), 'la vista previa se gira con CSS, barato');
rev(/↺ Girar/.test(proyecto) && /↻ Girar/.test(proyecto), 'con los dos botones de giro');
rev(/rasterizePlan\(file, giro\)/.test(proyecto), 'y el giro de verdad se hace al confirmar');
rev(/fd\.append\('rotation', String\(rotation\)\)/.test(proyecto), 'el giro viaja a la suite con el plano');
rev(!/const \{ blob, width, height \} = await rasterizePlan\(file\);/.test(proyecto), 'ya nada sube sin pasar por la vista previa');

console.log('· sustituir es el mismo plano con otra hoja');
rev(/api\.form\(`\/plans\/\$\{sustituir\}\/sustituir`, fd\)/.test(proyecto), 'se pide a la suite sobre el plano que está');
rev(/data-sustituir-plano=\{plan\.id\}/.test(proyecto), 'desde «Renombrar / borrar plano»');
rev(/Sustituir el plano por una versión nueva/.test(proyecto), 'con el botón que lo dice');
rev(/Versiones anteriores/.test(proyecto) && /fileUrl\(v\.source_key\)/.test(proyecto), 'y las versiones anteriores se enlistan y se pueden bajar');
rev(/los ítems se quedan donde están/.test(proyecto), 'la pantalla dice que los ítems no se mueven');

console.log('· y todo eso llegó a lo armado');
rev(js.includes('Sustituir el plano') && js.includes('Girar'), 'el paquete trae la vista previa con giro y sustituir');
rev(/\.subir-plano \.vista-plano\{/.test(css) && /\.versiones-plano\{/.test(css), 'con sus estilos');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
