/* El requerimiento: un tipo de ítem que todavía no entra en producción.
 *
 * Mike, 22-sep-2026: «necesito el botón de agregar requerimiento (que es el
 * ítem que apenas se va a aprobar y a cotizar) dentro de quell. Es un nuevo
 * tipo de ítem. Y actualizar los tipos de ítem a: mueble, puerta, acabado,
 * servicio». Y aclarando: «el requerimiento es un tipo de ítem pero que aún
 * está en revisión. Sí aparece en mapa, sí aparece en ítems, pero está
 * pendiente de cotizarse y autorizarse para entrar en producción».
 *
 * POR QUÉ ESTO SE MIDE SOBRE LO ARMADO
 *
 * Aquí hay dos frases que tiran para lados contrarios, y lo que puede
 * romperse es que alguien junte una con la otra:
 *
 *   · Si a un requerimiento se le tratara como a un «no aprobado» —que en
 *     quell sólo sale si pides la vista de fuera de alcance—, desaparecería
 *     del plano. Se vería prolijo y Mike dejaría de ver lo que levantó.
 *   · Y al revés: si se pudiera palomear su avance, alguien marcaría
 *     «comprado» en una pieza que nadie cotizó ni autorizó. Eso no truena:
 *     gasta.
 *
 * La regla de producción vive en la API (contrato 0.43.0) y lo que se mide
 * aquí es que la pantalla NO ofrezca lo que la API va a rechazar, que es
 * distinto de decidirlo.
 *
 *   npm run build && node pruebas/requerimiento.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const api = readFileSync('web/src/api.js', 'utf8');
const codigos = readFileSync('web/src/codigos.js', 'utf8');
const proyecto = readFileSync('web/src/Project.jsx', 'utf8');
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

console.log('· los tipos que pidió Mike, y ninguno de menos');
for (const t of ['Mueble', 'Puerta', 'Acabado', 'Servicio', 'Requerimiento']) {
  rev(new RegExp(`clave: '${t}'`).test(api), `está «${t}»`);
}

console.log('· cada tipo propone su clave, y las dos copias dicen lo mismo');
/* `codigos.js` está duplicado a propósito —la propuesta se calcula sin red—,
 * y si las dos copias se separan, dos personas en modo avión proponen claves
 * distintas para la misma pieza. */
for (const [t, p] of [['Servicio', 'SV-'], ['Requerimiento', 'RQ-']]) {
  rev(new RegExp(`${t}: '${p}'`).test(codigos), `${t} → ${p}`);
}
rev(/OJO: este archivo es una COPIA/.test(codigos),
    'y el archivo avisa que es copia de la API, para que nadie toque sólo una');

console.log('· el botón está, y es un botón aparte');
rev(/\+ Requerimiento/.test(proyecto), 'hay «+ Requerimiento» junto a «+ Ítem»');
rev(/setTipoNuevo\('Requerimiento'\)/.test(proyecto), 'y arranca el alta ya con ese tipo');
rev(/tipoInicial/.test(proyecto), 'el formulario lo recibe y no lo adivina');

console.log('· se dice qué implica ANTES de guardarlo');
rev(/no entra a producción hasta que se cotice y se autorice/.test(proyecto),
    'el alta avisa que queda en revisión');
rev(/En revisión/.test(panel), 'y el panel del ítem lo repite con palabras');
rev(/cámbiale el tipo/i.test(panel), 'diciendo cómo se saca de ahí');

console.log('· NO se ofrece lo que la API va a rechazar');
/* Esto no es el permiso —lo decide el motor—: es no hacer picar en balde. */
rev(/onEntregar=\{enRevision\(e\.type\) \? null : entregar\}/.test(panel),
    'no se ofrece entregarlo');
rev(/!enRevision\(e\.type\) && \(\s*<BarraProceso/.test(panel.replace(/\n\s*/g, ' ')) || /&& !enRevision\(e\.type\) && \(/.test(panel),
    'ni palomear su avance');

console.log('· pero SÍ se ve: no se esconde como un «no aprobado»');
/* La mitad que se pierde si alguien lo trata como fuera de alcance. El filtro
 * de alcance es otra cosa y no debe mencionar el tipo. */
rev(!/enRevision/.test(proyecto.match(/const filtra[\s\S]{0,400}/)?.[0] || ''),
    'el filtro de la obra no esconde requerimientos');
rev(!/alcance/.test(api.match(/export const enRevision[\s\S]{0,200}/)?.[0] || ''),
    'y «en revisión» se pregunta por el TIPO, no por el alcance');

console.log('· la pregunta se hace igual que en la API, normalizando');
/* `type` es texto libre en la columna: un «requerimiento» en minúscula
 * guardado desde otra pantalla tiene que seguir contando. */
rev(/toLowerCase\(\) === 'requerimiento'/.test(api),
    'se compara en minúsculas y sin espacios, no con un === pelón');

console.log('· y todo eso llegó a lo armado');
rev(js.includes('Requerimiento'), 'el paquete trae el tipo');
rev(js.includes('RQ-') && js.includes('SV-'), 'y los prefijos nuevos');
rev(/\.revision\{/.test(css), 'y el aviso de «en revisión» se pinta');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
