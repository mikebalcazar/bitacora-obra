/* Archivar y borrar un proyecto desde el inicio, y ver el archivo.
 *
 * Mike, 29-sep-2026: «En home de quell, necesito opción para borrar un
 * proyecto y para archivar un proyecto. Borrar elimina la info completa.
 * Archivar lo quita de la pantalla home pero se queda guardada la info, es
 * para cuando un proyecto se termina. Y debe haber un botón para ver todo el
 * archivo (proyectos archivados)».
 *
 * POR QUÉ ESTO SE MIDE SOBRE LO ARMADO
 *
 * Lo peligroso aquí no es que no funcione: es que funcione de más. Un botón
 * de borrar que no pida el nombre borra semanas de obra con un dedo que se
 * resbala; un «archivar» que en realidad borre se ve idéntico hasta que
 * alguien busca la obra terminada. Se mide que:
 *
 *   · archivar sea un PATCH de estado (la información se queda), nunca un
 *     DELETE;
 *   · borrar pida teclear el nombre y sólo se le enseñe al dueño;
 *   · el inicio no pinte lo archivado, y el archivo sí, con su botón;
 *   · lo archivado se pueda desarchivar.
 *
 *   npm run build && node pruebas/el-archivo.mjs
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

console.log('· archivar guarda, no borra');
rev(/api\.patch\(`\/projects\/\$\{p\.id\}`, \{ status: si \? 'cerrado' : 'activo' \}\)/.test(home), 'archivar es un PATCH de estado a `cerrado`, y desarchivar lo regresa a `activo`');
rev(/data-accion="archivar"/.test(home) && /data-accion="desarchivar"/.test(home), 'hay botón de archivar y de desarchivar');
rev(/const activas = \(projects \|\| \[\]\)\.filter\(\(p\) => p\.status !== 'cerrado'\)/.test(home), 'el inicio pinta sólo lo no archivado');
rev(/const archivadas = \(projects \|\| \[\]\)\.filter\(\(p\) => p\.status === 'cerrado'\)/.test(home), 'y el archivo, sólo lo archivado');
rev(/Ver el archivo \(\$\{archivadas\.length\}\)/.test(home), 'con un botón «Ver el archivo (n)»');
rev(/data-archivo=\{verArchivo \? 'abierto' : 'cerrado'\}/.test(home), 'que abre y cierra');

console.log('· borrar es del dueño y pide el nombre');
rev(/\{dueno && <button className="btn sm danger" data-accion="borrar"/.test(home), 'el botón de borrar sólo se le enseña al dueño');
rev(/const coincide = nombre\.trim\(\) === p\.name\.trim\(\)/.test(home), 'se teclea el nombre de la obra');
rev(/disabled=\{!coincide \|\| busy\}/.test(home), 'y sin el nombre exacto el botón está apagado');
rev(/api\.del\(`\/projects\/\$\{p\.id\}`\)/.test(home), 'borrar es el DELETE de la obra, que se lleva todo');
rev(/No hay papelera/.test(home), 'y lo dice antes de que se decida');

console.log('· la tarjeta ya no es un botón con botones adentro');
rev(!/<button key=\{p\.id\} className="card"/.test(home), 'la tarjeta dejó de ser <button>');
rev(/role="button" tabIndex=\{0\}/.test(home), 'pero se sigue picando y se llega con el teclado');
rev(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(home), 'y picar archivar o borrar no abre la obra');

console.log('· lo armado lo trae');
rev(/Ver el archivo/.test(js) && /Borrar para siempre/.test(js) && /Desarchivar/.test(js), 'los tres textos están en el JavaScript publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
