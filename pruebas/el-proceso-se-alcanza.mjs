/* El proceso del ítem se alcanza en el celular.
 *
 * Mike, 28-sep-2026: «No puedo scrollear hacia abajo para poner “terminado”
 * en el proceso. Queda fuera de pantalla».
 *
 * POR QUÉ ESTO SE MIDE SOBRE LO ARMADO Y NO MIRANDO
 *
 * En la compu no pasa: el panel mide 400 de ancho y toda la pantalla de
 * alto, y el encabezado del ítem cabe con espacio. En un celular el
 * encabezado (contratistas, entrega, archivos, alcance, pestañas) se come más
 * de media pantalla, la bitácora se encoge a nada y lo de abajo —lo que se
 * escribe y el proceso abierto— se sale del panel, que no se desplazaba. La
 * app no truena ni avisa: la última etapa queda debajo de la barra de
 * navegación y no hay forma de llegar.
 *
 * Se mide que el CSS armado traiga, dentro de la regla del celular, las tres
 * cosas que lo resuelven: el panel se desplaza, la bitácora no se encoge, y
 * el proceso va pegado abajo con `sticky`.
 *
 *   npm run build && node pruebas/el-proceso-se-alcanza.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const dir = 'web/dist/assets';
const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

/* El minificador reescribe `(max-width:900px)` como `(width<=900px)`: se
 * aceptan las dos formas, que son la misma regla. */
const m = /@media \((?:max-width:900px|width<=900px)\)\{([^@]*)\}/.exec(css);
const celular = m ? m[1] : '';
rev(!!celular, 'hay una regla para el celular (hasta 900 de ancho)');

console.log('· el panel del ítem se desplaza entero');
rev(/\.panel\{[^}]*overflow:auto/.test(celular), 'el panel tiene `overflow:auto` en el celular');
rev(/\.panel \.body\{[^}]*flex:none/.test(celular), 'la bitácora mide lo que mide: `flex:none`');
rev(/\.panel \.body\{[^}]*overflow:visible/.test(celular), 'y ya no se desplaza por su cuenta');

console.log('· el proceso va pegado abajo, y abierto se alcanza hasta la última etapa');
rev(/\.barproc\{[^}]*position:sticky/.test(celular), 'la barra del proceso es `sticky`');
rev(/\.barproc\{[^}]*bottom:0/.test(celular), 'al fondo del panel');
rev(/\.barproc \.proc\{[^}]*max-height:min\(46vh,340px\)/.test(css), 'la lista abierta mide como mucho 46vh');
rev(/\.barproc \.proc\{[^}]*overflow:auto/.test(css), 'y se desplaza por dentro, así que la última etapa se alcanza');

console.log('· en la compu nada cambia');
const fuera = css.replace(m ? m[0] : '', '');
rev(/\.body\{[^}]*flex:1/.test(fuera) && /\.body\{[^}]*overflow:auto/.test(fuera), 'la bitácora sigue desplazándose sola fuera del celular');
rev(!/\.barproc\{[^}]*position:sticky/.test(fuera), 'y la barra no es sticky fuera del celular');

const jsx = readFileSync('web/src/ElementPanel.jsx', 'utf8');
rev(/lastElementChild\?\.scrollIntoView/.test(jsx), 'al abrir, lo más nuevo de la bitácora se trae a la vista también cuando desplaza el panel');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
