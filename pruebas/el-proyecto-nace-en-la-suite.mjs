/* El proyecto de quell101 nace también en la suite, y el requerimiento trae
 * su descripción (6-oct-2026).
 *
 * Mike: «Cree un nuevo proyecto en Quell, con un cliente nuevo. Pero no me
 * aparece ni el cliente ni el proyecto ni en quote ni en dash.» Y: «agregar
 * un campo de descripción en la ventana de Nuevo requerimiento, donde se
 * escribe lo que aparecerá como descripción en quote (…) En caso de que no
 * se llene en quell, se puede llenar en quote.»
 *
 * Lo que la API hace con eso se mide en suite101-api
 * (pruebas/obra-en-la-suite.spec.ts). Aquí, sin navegador: que «+ Proyecto»
 * pida el alta en la suite y ofrezca los clientes de la suite, que diga antes
 * de crear qué va a pasar con el cliente, que «Nuevo requerimiento» traiga la
 * descripción y la mande, y que lo armado lo traiga.
 *
 *   npm run build && node pruebas/el-proyecto-nace-en-la-suite.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const home = readFileSync('web/src/Home.jsx', 'utf8');
const proy = readFileSync('web/src/Project.jsx', 'utf8');

console.log('· «+ Proyecto» da de alta cliente y proyecto en la suite');
rev(/api\.post\('\/projects', \{[^}]*suite: true/.test(home), 'pide el alta en la suite (`suite: true`)');
rev(/cliente_id: ya\.id/.test(home), 'si el cliente ya existe, manda su id y no un nombre suelto');
rev(/api\.get\('\/clientes-suite'\)/.test(home), 'trae los clientes de la suite');
rev(/<input list="clientes-suite"/.test(home) && /<datalist id="clientes-suite">/.test(home), 'y los ofrece para escoger, dejando escribir uno nuevo');
rev(/data-aviso-cliente="existe"/.test(home) && /data-aviso-cliente="nuevo"/.test(home) && /data-aviso-cliente="vacio"/.test(home), 'dice antes de crear: el que ya existe, uno nuevo, o sin cliente');
rev(/Se parece a/.test(home), 'y avisa si el nuevo se parece a uno que ya existe');
rev(/normalize\('NFD'\)/.test(home) && /toLowerCase\(\)/.test(home), 'compara como la suite: sin acentos ni mayúsculas');

console.log('· «Nuevo requerimiento» trae la descripción');
rev(/descripcion: '' \}\);/.test(proy), 'el formulario arranca con la descripción vacía');
const campo = proy.match(/\{enRevision\(f\.type\) && \(\s*<div className="field"><label>Descripción[\s\S]*?<\/div>\s*\)\}/);
rev(!!campo, 'el campo sale sólo en un requerimiento');
rev(!!campo && /<textarea data-campo="descripcion"/.test(campo[0]), 'es un texto de varias líneas');
rev(!!campo && /quote101/.test(campo[0]) && /vacía, se llena allá/.test(campo[0]), 'dice que es la de quote101 y que vacía se llena allá');
rev(/provisional: la definitiva se escoge en quote101 según el tipo de trabajo/.test(proy), 'la clave de un requerimiento se dice provisional');
rev(/const punto = \{ \.\.\.f,/.test(proy), 'lo del formulario (descripción incluida) va completo a la API');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(js.includes('/clientes-suite') && /suite:\s*!0/.test(js), 'el alta en la suite está en el JavaScript publicado');
rev(js.includes('data-campo') && js.includes('descripcion'), 'y el campo de descripción');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
