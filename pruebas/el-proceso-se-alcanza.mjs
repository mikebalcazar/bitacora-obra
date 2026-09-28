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
 * Se mide que el CSS armado traiga, para todos los tamaños —en la compu
 * pasaba igual con una laptop de 768 de alto—, las tres cosas que lo
 * resuelven: el panel se desplaza, la bitácora no se encoge, y el proceso
 * va pegado abajo con `sticky`.
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

/* Las reglas van FUERA de la del celular: en la compu pasa lo mismo (Mike,
 * 28-sep, segunda vuelta: «en PC sigue sin verse el proceso»). Se mira el
 * CSS con la regla del celular quitada, para que no cuente lo de adentro. */
const m = /@media \((?:max-width:900px|width<=900px)\)\{([^@]*)\}/.exec(css);
const general = css.replace(m ? m[0] : '', '');

console.log('· el panel del ítem se desplaza entero, en el celular y en la compu');
rev(/\.panel\{[^}]*overflow:auto/.test(general), 'el panel tiene `overflow:auto`');
rev(/\.body\{[^}]*flex:none/.test(general), 'la bitácora mide lo que mide: `flex:none`');
rev(/\.body\{[^}]*overflow:visible/.test(general), 'y ya no se desplaza por su cuenta');
rev(!/\.body\{[^}]*flex:1/.test(general), 'no queda ningún `flex:1` que la encoja a cero');

console.log('· el proceso va pegado abajo, y abierto se alcanza hasta la última etapa');
rev(/\.barproc\{[^}]*position:sticky/.test(general), 'la barra del proceso es `sticky`');
rev(/\.barproc\{[^}]*bottom:0/.test(general), 'al fondo del panel');
rev(/\.barproc \.proc\{[^}]*max-height:min\(46vh,340px\)/.test(css), 'la lista abierta mide como mucho 46vh');
rev(/\.barproc \.proc\{[^}]*overflow:auto/.test(css), 'y se desplaza por dentro, así que la última etapa se alcanza');

const jsx = readFileSync('web/src/ElementPanel.jsx', 'utf8');
rev(/lastElementChild\?\.scrollIntoView/.test(jsx), 'al abrir, lo más nuevo de la bitácora se trae a la vista');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
