/* El contratista entra a la obra desde el ítem.
 *
 * Mike, 30-sep-2026, en la obra de Holcim, con captura: «en este ítem no me
 * deja agregar a un contratista al ítem». El menú «+ asignar…» sólo ofrecía a
 * los contratistas que YA entraban a esa obra, y en Holcim no había ninguno;
 * el letrero lo mandaba a «Usuarios y accesos» y de regreso. Escogió que el
 * ítem lo haga en un paso: el menú trae a todos los contratistas de la
 * empresa (los de la obra primero, los demás en su grupo) y al escoger uno
 * de fuera la API lo mete a la obra ahí mismo (contrato 0.54.1) y se le
 * dice con un aviso.
 *
 * Se mide sobre el fuente de la pantalla del ítem, porque la lista viene de
 * una ruta nueva de la API y aquí no hay API: lo que se puede comprobar sin
 * red es que la pantalla la pide, que ofrece a los de fuera en su propio
 * grupo, que avisa cuando alguien entró a la obra, y que el letrero que
 * bloqueaba ya no está.
 *
 *   node pruebas/el-contratista-desde-el-item.mjs
 */
import { readFileSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const src = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const ini = src.indexOf('function Contratistas(');
const fin = src.indexOf('\nfunction ', ini + 10);
const bloque = src.slice(ini, fin > 0 ? fin : undefined);
console.log('· el menú del ítem ofrece a todos los contratistas de la empresa');
rev(ini > 0, 'existe el bloque Contratistas del ítem');
rev(/api\.get\('\/contratistas'\)/.test(bloque), 'pide la lista de contratistas de la empresa a la API (GET /contratistas)');
rev(/data-contratistas="asignar"/.test(bloque), 'el menú «+ asignar…» está marcado para medirse');
rev(/<optgroup label="Ya entran a esta obra">/.test(bloque), 'los que ya entran a la obra van en su grupo, primero');
rev(/<optgroup label="Otros contratistas de la empresa \(entran a la obra al asignarlos\)">/.test(bloque), 'los demás van en el suyo, y el nombre del grupo dice lo que va a pasar');
rev(/!members\.some\(\(m\) => m\.id === c\.id\)/.test(bloque), 'un contratista de la obra no se repite en el grupo de fuera');
console.log('· al escoger uno de fuera se dice que entró a la obra');
rev(/hecho\.subido \? hecho\.r : null/.test(bloque), 'lee la respuesta de la API de donde `escribir` la deja (`.r`, sólo si subió)');
rev(/entraron_a_la_obra/.test(bloque), 'lee `entraron_a_la_obra` de la respuesta (contrato 0.54.1)');
rev(/ya entra a la obra y quedó en el ítem/.test(bloque), 'y lo dice con un aviso');
rev(/pero el correo no salió/.test(bloque), 'si el correo de acceso no salió, también lo dice');
console.log('· lo que ya no está');
rev(!/Primero dale acceso a la obra a un contratista/.test(src), 'el letrero que mandaba a «Usuarios y accesos» ya no está');
rev(/No hay contratistas dados de alta/.test(bloque), 'y sólo cuando la empresa no tiene ningún contratista se manda a darlo de alta');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
