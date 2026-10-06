/* Abrir un ítem desde otra vista no saca de esa vista (6-oct-2026).
 *
 * Mike, con una captura del panel con la ruedita girando: «No está cargando
 * la barra de detalles del ítem de quell (…) no carga cuando le doy click
 * desde otra ubicación y me regresa al plano. Cuando dé click en el ítem
 * desde otra ubicación no quiero que me regrese a la pantalla de plano,
 * quiero sólo que me abra la barra lateral con la info del ítem, sin que la
 * ventana central se salga de lo que estoy trabajando».
 *
 * Dos defectos: el cronograma mandaba la pieza con `e.id`, que sus renglones
 * no traen (traen `element_id`), y la dirección del ítem era sólo
 * «…/e/ITEM», que es el plano. Lo de navegador (abrir, cambiar de vista,
 * cerrar) se mide en Chromium; aquí, que el código diga lo que debe.
 *
 *   node pruebas/el-item-sin-salir-de-la-vista.mjs
 */
import { readFileSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto) => { revisadas++; if (!ok) fallas++; console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}`); };
const proy = readFileSync('web/src/Project.jsx', 'utf8');

console.log('· el cronograma manda la pieza correcta');
rev(/const eid = e\.element_id \|\| e\.id;/.test(proy), 'usa `element_id` (antes `e.id`: abría «undefined» y el panel no cargaba)');
rev(/planId: e\.plan_id \|\| \(data\.elements \|\| \[\]\)\.find\(\(x\) => x\.id === eid\)\?\.plan_id/.test(proy), 'y busca su plano entre las piezas de la obra');

console.log('· la dirección guarda la vista');
rev(/irA\(`\$\{base\}\/e\/\$\{eid\}`, HONDURA\.item\)/.test(proy) && /const v = opts\.vista \|\| vista;/.test(proy), 'abrir un ítem va a «…/VISTA/e/ITEM», no al plano');
rev(/const setVista = \(v\) => \(sel \? irA\(`\$\{rutaDe\(v\)\}\/e\/\$\{sel\}`, HONDURA\.item\) : irSeccion\(v\)\);/.test(proy), 'cambiar de vista con un ítem abierto lo deja abierto');
rev(/history\.state\.base === rutaDe\(vista\)/.test(proy) && /history\.replaceState\(\{ hondura: vista !== 'plan'/.test(proy), 'cerrarlo deja la vista de ahora, no la de antes');
rev(/if \(vista !== 'plan'\) \{[^}]*irA\(`\/p\/\$\{id\}\/e\/\$\{e\.id\}`, HONDURA\.item\); \}/.test(proy), '«Reubicar en plano» sí pasa al plano, con el ítem abierto');

console.log(`\n${revisadas - fallas}/${revisadas} en verde`);
process.exit(fallas ? 1 : 0);
