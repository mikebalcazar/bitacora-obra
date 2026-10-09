/* El pendiente del punchlist se edita después de creado (9-oct-2026).
 *
 * Mike: «en quell, una vez creado el ítem de punchlist no puedo editar a
 * quien se le asigna». Ahora cada pendiente trae «Editar» (sólo quien
 * dirige): a quién le toca —o «Sin asignar»—, qué es y para cuándo. Va por
 * PATCH /punch/:id por la fila (sin señal se ve cambiado y sube solo). Que
 * «Sin asignar» lo quite de verdad lo hace la API 0.90.2.
 *
 *   npm run build && node pruebas/el-pendiente-se-reasigna.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const edita = panel.slice(panel.indexOf('function EditaPunch('), panel.indexOf('function EditElement('));

console.log('· el botón');
rev(/\{staff && <button className="btn sm" data-editar-punch onClick=\{\(\) => setEditando\(k\.id\)\}>Editar<\/button>\}/.test(panel), '«Editar» en cada pendiente, sólo para quien dirige');
rev(/editando === k\.id \? \(\s*<EditaPunch k=\{k\} e=\{e\} contratistas=\{contratistas\}/.test(panel), 'abre el formulario en el mismo pendiente');

console.log('· el formulario');
rev(/useState\(\{ title: k\.title \|\| '', assignee_id: k\.assignee_id \|\| '', resp: k\.resp \|\| '', due_date: k\.due_date \|\| '' \}\)/.test(edita), 'trae lo que ya tiene: título, asignado, responsable y fecha');
rev(/<option value="">Sin asignar<\/option>/.test(edita), 'se puede dejar «Sin asignar»');
rev(/\{opciones\.map\(\(c\) => <option key=\{c\.id\} value=\{c\.id\}>/.test(edita), 'y escoger a cualquier contratista de la obra');
rev(/k\.assignee_id && !contratistas\.some\(\(c\) => c\.id === k\.assignee_id\)/.test(edita), 'quien lo tenía y ya no está en la obra no se cambia sin querer');
rev(/: <input value=\{f\.resp\}/.test(edita), 'sin contratistas en la obra, el responsable es texto');
rev(/<input type="date" value=\{f\.due_date\}/.test(edita), 'la fecha límite');

console.log('· al guardar');
rev(/metodo: 'PATCH', ruta: `\/punch\/\$\{k\.id\}`, cuerpo,/.test(edita), 'va a PATCH /punch/:id por la fila');
rev(/\.\.\.\(opciones\.length \? \{ assignee_id: f\.assignee_id \} : \{ resp: f\.resp \}\)/.test(edita), 'manda el asignado (vacío = sin asignar) o el responsable');
rev(/assignee_name: quien\?\.name \|\| null/.test(edita), 'sin señal, el nombre nuevo se ve enseguida');

console.log('· las fechas en la Ciudad de México');
const apiJs = readFileSync('web/src/api.js', 'utf8');
process.env.TZ = 'America/Mexico_City';
const { fmtD, todayISO } = await import('../web/src/api.js');
rev(fmtD('2026-10-12') === new Date(2026, 9, 12).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }), 'el límite AAAA-MM-DD sale el mismo día, no el anterior', fmtD('2026-10-12'));
rev(/\{ const d = new Date\(\); d\.setDate\(d\.getDate\(\) \+ offsetDays\); const p = /.test(apiJs) && !/todayISO[^\n]*toISOString/.test(apiJs), '«hoy» es el de aquí, no el de Greenwich');
const h = new Date(); const p2 = (n) => String(n).padStart(2, '0');
rev(todayISO() === `${h.getFullYear()}-${p2(h.getMonth() + 1)}-${p2(h.getDate())}`, 'y todayISO() da la fecha local', todayISO());

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Sin señal: el cambio se sube solo cuando vuelva\./.test(js) && /data-editar-punch/.test(js), 'está en el JavaScript publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
