/* Ítems y contratistas por ítem, contra una base SQLite DE VERDAD.
 *
 * `pruebas/puerta.mjs` prueba la puerta con una base de mentiras. Aquí no: las
 * migraciones se aplican en orden sobre SQLite en memoria (el mismo motor que
 * D1) y el Worker corre entero, con un adaptador que le da la forma de D1
 * (prepare · bind · first · all · run · batch). Lo que se prueba es lo que el
 * encargo de quell101 del 18-sep pidió comprobar (A.5 y D.6), y sobre todo
 * lo que NO debe pasar: un contratista que recibe un pendiente ajeno.
 *
 *   node pruebas/obra.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { siguienteCodigo, PREFIJOS } from '../web/src/codigos.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

/* ─────────────── D1 sobre SQLite ─────────────── */
function d1(db) {
  const arma = (sql, args) => ({
    async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : r; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    _sql: sql, _args: args,
  });
  return {
    prepare(sql) { const sin = arma(sql, []); return { ...sin, bind: (...args) => arma(sql, args) }; },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
}
const MIGRACIONES = new URL('../migrations/', import.meta.url).pathname;
function baseNueva() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of readdirSync(MIGRACIONES).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(MIGRACIONES + f, 'utf8'));
  return db;
}

/* ─────────────── la gente y las obras ─────────────── */
const GENTE = {
  duena: { id: 'u-duena', email: 'duena@ejemplo.mx', name: 'Dueña', role: 'admin', company: 'Taller' },
  goyo: { id: 'u-goyo', email: 'goyo@ejemplo.mx', name: 'Goyo', role: 'con', company: 'Carpintería Goyo' },
  berna: { id: 'u-berna', email: 'berna@ejemplo.mx', name: 'Berna', role: 'con', company: 'Vidrios Berna' },
  tema: { id: 'u-tema', email: 'tema@ejemplo.mx', name: 'Tema', role: 'con', company: 'Herrería Tema' },
};
const SUITE = Object.fromEntries(Object.entries(GENTE).map(([g, u]) => [g, { usuario: { id: u.id, correo: u.email }, superadmin: false, orgs: [{ id: 'prueba', apps: ['quell'] }] }]));

function mundo(db) {
  return {
    APP_NAME: 'quell101',
    API: { async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname !== '/yo') return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
      const galleta = /(?:^|;\s*)s101=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
      const quien = SUITE[galleta ?? ''] ?? null;
      return quien ? new Response(JSON.stringify({ ok: true, data: quien }), { status: 200 }) : new Response(JSON.stringify({ ok: false, error: 'sin_sesion' }), { status: 401 });
    } },
    DB: d1(db),
    FILES: { async get() { return null; }, async head() { return null; }, async put() { return {}; }, async delete() {} },
    ASSETS: { async fetch() { return new Response('el sitio', { status: 200 }); } },
  };
}

function siembra(db) {
  for (const u of Object.values(GENTE)) db.prepare(`INSERT INTO users (id, email, name, role, company, active) VALUES (?,?,?,?,?,1)`).run(u.id, u.email, u.name, u.role, u.company);
  db.prepare(`INSERT INTO projects (id, name, client) VALUES ('obra-a', 'Obra de prueba A', 'Cliente inventado')`).run();
  db.prepare(`INSERT INTO projects (id, name, client) VALUES ('obra-b', 'Obra de prueba B', 'Otro cliente inventado')`).run();
  db.prepare(`INSERT INTO plans (id, project_id, name, file_name, image_key, width, height, sort) VALUES ('pa', 'obra-a', 'Planta baja', 'pb.png', 'k1', 1000, 800, 1)`).run();
  db.prepare(`INSERT INTO plans (id, project_id, name, file_name, image_key, width, height, sort) VALUES ('pb', 'obra-b', 'Planta', 'p.png', 'k2', 1000, 800, 1)`).run();
  for (const g of ['goyo', 'berna', 'tema']) db.prepare(`INSERT INTO project_members (project_id, user_id, rol) VALUES ('obra-a', ?, 'con')`).run(GENTE[g].id);
}

const URL_BASE = 'https://bitacora-obra.mike-929.workers.dev/api';
function pide(env, quien, ruta, { metodo = 'GET', cuerpo = null } = {}) {
  return worker.fetch(new Request(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: { Cookie: `s101=${quien}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }), env);
}
const lee = async (p) => { const r = await p; return { estado: r.status, cuerpo: await r.json().catch(() => ({})) }; };

/* ─────────────── A · el código del ítem ─────────────── */
console.log('\n== A · la propuesta de código, función pura ==');
{
  rev(PREFIJOS.Mueble === 'MW-' && PREFIJOS.Puerta === 'PT-' && PREFIJOS.Acabado === 'FX-', 'los tres prefijos: MW-, PT-, FX-');
  rev(siguienteCodigo([], 'Mueble') === 'MW-01', 'en una obra vacía propone MW-01', siguienteCodigo([], 'Mueble'));
  rev(siguienteCodigo([{ code: 'MW-01' }], 'Mueble') === 'MW-02', 'con MW-01 propone MW-02');
  rev(siguienteCodigo([{ code: 'MW-01' }, { code: 'MW-02' }], 'Puerta') === 'PT-01', 'la puerta arranca en PT-01, no en PT-03');
  const desorden = [{ code: 'PTM-02' }, { code: 'PTX-08' }, { code: 'PTX08' }, { code: 'P-01' }, { code: 'PT-04' }, { code: 'CAR-3' }, { code: 'E-07' }];
  rev(siguienteCodigo(desorden, 'Puerta') === 'PT-05', 'los prefijos viejos (PTM-, PTX-, P-) no cuentan: con PT-04 va PT-05', siguienteCodigo(desorden, 'Puerta'));
  rev(siguienteCodigo(desorden, 'Mueble') === 'MW-01', 'y CAR- y E- tampoco cuentan para los muebles', siguienteCodigo(desorden, 'Mueble'));
  rev(siguienteCodigo([{ code: 'MW-08' }, { code: 'MW-11' }], 'Mueble') === 'MW-12', 'no rellena huecos: falta MW-09 y el mayor es MW-11 → MW-12');
  rev(siguienteCodigo([{ code: 'mw-03' }], 'Mueble') === 'MW-04', 'lee el prefijo sin importar mayúsculas');
  rev(siguienteCodigo([{ code: 'MW-99' }], 'Mueble') === 'MW-100', 'pasa de dos dígitos sin romperse');
  rev(siguienteCodigo([{ code: 'MW-01' }], 'Otro') === '', '«Otro» no lleva prefijo: propone vacío');
}

console.log('\n== A · el Worker contra SQLite de verdad ==');
const db = baseNueva();
siembra(db);
const env = mundo(db);
let m1 = null, m2 = null, m3 = null;
{
  const alta = (plano, cuerpo) => lee(pide(env, 'duena', `/plans/${plano}/elements`, { metodo: 'POST', cuerpo }));
  const a = await alta('pa', { name: 'Isla', type: 'Mueble', x: 0.1, y: 0.1, op_id: crypto.randomUUID() });
  rev(a.estado === 200 && a.cuerpo.code === 'MW-01', 'sin código, el servidor propone MW-01', `${a.estado} ${a.cuerpo.code}`);
  m1 = a.cuerpo.id;
  const b = await alta('pa', { name: 'Barra', type: 'Mueble', x: 0.2, y: 0.2, op_id: crypto.randomUUID() });
  rev(b.cuerpo.code === 'MW-02', 'el siguiente mueble es MW-02', b.cuerpo.code);
  m2 = b.cuerpo.id;
  const p = await alta('pa', { name: 'Puerta principal', type: 'Puerta', x: 0.3, y: 0.3, op_id: crypto.randomUUID() });
  rev(p.cuerpo.code === 'PT-01', 'la primera puerta de la obra es PT-01, no PT-03', p.cuerpo.code);
  const otra = await alta('pb', { name: 'Mueble en otra obra', type: 'Mueble', x: 0.5, y: 0.5, op_id: crypto.randomUUID() });
  rev(otra.cuerpo.code === 'MW-01', 'en OTRA obra el conteo arranca en 01', otra.cuerpo.code);
  const fila = db.prepare(`SELECT project_id FROM elements WHERE id = ?`).get(m1);
  rev(fila?.project_id === 'obra-a', 'el ítem nace con su obra puesta (no en nulo)', String(fila?.project_id));

  const choque = await alta('pa', { name: 'Repetido a mano', type: 'Mueble', code: 'MW-01', x: 0.4, y: 0.4, op_id: crypto.randomUUID() });
  rev(choque.estado === 409 && /MW-01/.test(choque.cuerpo.error), 'guardar a mano un código que ya existe en la obra se rechaza diciendo cuál', `${choque.estado} ${choque.cuerpo.error}`);
  const enOtra = await alta('pb', { name: 'Mismo código, otra obra', type: 'Mueble', code: 'MW-02', x: 0.4, y: 0.4, op_id: crypto.randomUUID() });
  rev(enOtra.estado === 200, 'el mismo código en OTRA obra se acepta', String(enOtra.estado));
  const fx = await alta('pa', { name: 'Barniz', type: 'Acabado', x: 0.6, y: 0.6, op_id: crypto.randomUUID() });
  rev(fx.cuerpo.code === 'FX-01', 'el tipo Acabado existe y propone FX-01', fx.cuerpo.code);
  m3 = fx.cuerpo.id;

  // Reubicar: por la fila, con constancia.
  const op = crypto.randomUUID();
  const mov = await lee(pide(env, 'duena', `/elements/${m1}`, { metodo: 'PATCH', cuerpo: { x: 0.77, y: 0.88, reubicar: true, op_id: op } }));
  const pos = db.prepare(`SELECT x, y FROM elements WHERE id = ?`).get(m1);
  rev(mov.estado === 200 && pos.x === 0.77 && pos.y === 0.88, 'reubicar cambia sólo x y y', `${pos.x}, ${pos.y}`);
  const renglon = db.prepare(`SELECT user_id, kind, text FROM log_entries WHERE element_id = ?`).all(m1);
  rev(renglon.length === 1 && renglon[0].user_id === GENTE.duena.id && /Reubicado/.test(renglon[0].text), 'y deja un renglón en la bitácora con quién lo movió', JSON.stringify(renglon[0]));
  const otraVez = await lee(pide(env, 'duena', `/elements/${m1}`, { metodo: 'PATCH', cuerpo: { x: 0.77, y: 0.88, reubicar: true, op_id: op } }));
  rev(otraVez.cuerpo.repetida === true && db.prepare(`SELECT COUNT(*) AS n FROM log_entries WHERE element_id = ?`).get(m1).n === 1, 'la misma operación repetida (mala señal) no duplica el renglón');
  const sinMover = await lee(pide(env, 'duena', `/elements/${m1}`, { metodo: 'PATCH', cuerpo: { name: 'Isla central', op_id: crypto.randomUUID() } }));
  rev(sinMover.estado === 200 && db.prepare(`SELECT COUNT(*) AS n FROM log_entries WHERE element_id = ?`).get(m1).n === 1, 'editar sin reubicar no escribe en la bitácora');
  const con = await lee(pide(env, 'goyo', `/elements/${m1}`, { metodo: 'PATCH', cuerpo: { x: 0.1, y: 0.1, reubicar: true, op_id: crypto.randomUUID() } }));
  rev(con.estado === 403, 'el contratista no reubica', String(con.estado));
}

/* ─────────────── D · contratistas por ítem ─────────────── */
console.log('\n== D · contratistas por ítem ==');
{
  // M1: goyo y berna en la lista. M2: sin lista, pero un pendiente de tema.
  // M3: nadie. Tres contratistas, un mueble con dos de ellos (D.6).
  db.prepare(`UPDATE elements SET resp = 'taller101' WHERE id IN (?, ?, ?)`).run(m1, m2, m3);
  const puesta = await lee(pide(env, 'duena', `/elements/${m1}/contratistas`, { metodo: 'PUT', cuerpo: { user_ids: [GENTE.goyo.id, GENTE.berna.id], op_id: crypto.randomUUID() } }));
  rev(puesta.estado === 200 && puesta.cuerpo.contratistas.length === 2, 'quien dirige pone dos contratistas en el mueble', `${puesta.estado} ${puesta.cuerpo.contratistas?.map((c) => c.name).join(', ')}`);
  const dosVeces = await lee(pide(env, 'duena', `/elements/${m1}/contratistas`, { metodo: 'PUT', cuerpo: { user_ids: [GENTE.goyo.id, GENTE.berna.id, GENTE.goyo.id], op_id: crypto.randomUUID() } }));
  rev(dosVeces.estado === 200 && db.prepare(`SELECT COUNT(*) AS n FROM element_contratistas WHERE element_id = ?`).get(m1).n === 2, 'asignar dos veces al mismo no duplica');
  const quien = db.prepare(`SELECT asignado_por FROM element_contratistas WHERE element_id = ? AND user_id = ?`).get(m1, GENTE.goyo.id);
  rev(quien?.asignado_por === GENTE.duena.id, 'queda quién asignó');
  const noCon = await lee(pide(env, 'duena', `/elements/${m1}/contratistas`, { metodo: 'PUT', cuerpo: { user_ids: [GENTE.duena.id], op_id: crypto.randomUUID() } }));
  rev(noCon.estado === 400, 'alguien que no es contratista no se asigna', `${noCon.estado} ${noCon.cuerpo.error}`);
  db.prepare(`INSERT INTO users (id, email, name, role, company, active) VALUES ('u-fuera', 'fuera@ejemplo.mx', 'Fuera', 'con', '', 1)`).run();
  const fuera = await lee(pide(env, 'duena', `/elements/${m1}/contratistas`, { metodo: 'PUT', cuerpo: { user_ids: [GENTE.goyo.id, 'u-fuera'], op_id: crypto.randomUUID() } }));
  rev(fuera.estado === 400 && /acceso a la obra/.test(fuera.cuerpo.error), 'un contratista sin acceso a la obra no se asigna: primero la obra', fuera.cuerpo.error);
  const goyoPone = await lee(pide(env, 'goyo', `/elements/${m1}/contratistas`, { metodo: 'PUT', cuerpo: { user_ids: [GENTE.goyo.id], op_id: crypto.randomUUID() } }));
  rev(goyoPone.estado === 403, 'el contratista no se asigna solo', String(goyoPone.estado));

  // Pendientes: en M1 uno para berna; en M2 uno para tema. Los ítems se
  // entregan primero (los pendientes se levantan en punchlist).
  db.prepare(`UPDATE elements SET fase = 'punchlist' WHERE id IN (?, ?)`).run(m1, m2);
  db.prepare(`INSERT INTO punch_items (id, element_id, title, status, assignee_id, created_by) VALUES ('k-berna', ?, 'Vidrio del frente', 'pend', ?, ?)`).run(m1, GENTE.berna.id, GENTE.duena.id);
  db.prepare(`INSERT INTO punch_items (id, element_id, title, status, assignee_id, created_by) VALUES ('k-tema', ?, 'Herraje flojo', 'pend', ?, ?)`).run(m2, GENTE.tema.id, GENTE.duena.id);
  db.prepare(`INSERT INTO log_entries (id, element_id, user_id, kind, text) VALUES ('l-m2', ?, ?, 'acuerdo', 'Trato interno sobre M2')`).run(m2, GENTE.duena.id);

  // Goyo ve el plano completo, con los suyos resaltados.
  const obra = await lee(pide(env, 'goyo', '/projects/obra-a'));
  const ids = obra.cuerpo.elements.map((e) => e.id);
  rev(obra.estado === 200 && ids.includes(m1) && ids.includes(m2) && ids.includes(m3), 'el contratista ve TODOS los ítems del plano', `${obra.cuerpo.elements.length} ítems`);
  rev(JSON.stringify(obra.cuerpo.mios) === JSON.stringify([m1]), 'y la lista de los suyos trae sólo el mueble donde está', JSON.stringify(obra.cuerpo.mios));
  const ajeno = obra.cuerpo.elements.find((e) => e.id === m2);
  const llavesAjeno = Object.keys(ajeno).filter((k) => ajeno[k] !== 0 && ajeno[k] !== null && ajeno[k] !== undefined).sort();
  rev(ajeno.ajeno === true && !('resp' in ajeno) && !('fase' in ajeno) && !('created_by' in ajeno), 'de un ítem ajeno sólo salen código, nombre, tipo y posición', llavesAjeno.join(', '));
  rev(ajeno.n_total === 0 && ajeno.n_pend === 0, 'y los conteos del ajeno van en cero, aunque tenga pendientes');
  const suyo = obra.cuerpo.elements.find((e) => e.id === m1);
  rev(suyo.n_total === 1 && suyo.resp === 'taller101' && suyo.fase === 'punchlist', 'el suyo va completo, con los pendientes de todos los contratistas del mueble', `n_total ${suyo.n_total}`);

  // Un ítem ajeno pedido a mano: nombre, código y posición, y nada más.
  const m2Goyo = await lee(pide(env, 'goyo', `/elements/${m2}`));
  rev(m2Goyo.estado === 200 && m2Goyo.cuerpo.recorte === true, 'pide a mano un ítem ajeno: llega recortado', `${m2Goyo.estado} recorte=${m2Goyo.cuerpo.recorte}`);
  rev(m2Goyo.cuerpo.punch.length === 0 && m2Goyo.cuerpo.log.length === 0 && !('resp' in m2Goyo.cuerpo.element) && !('fase' in m2Goyo.cuerpo.element),
    'ni un pendiente, ni un renglón de bitácora, ni la fase: revisado en la respuesta del servidor', `${m2Goyo.cuerpo.punch.length} pend · ${m2Goyo.cuerpo.log.length} bitácora`);
  rev(m2Goyo.cuerpo.element.code === 'MW-02' && typeof m2Goyo.cuerpo.element.x === 'number', 'pero sí el código y la posición para ubicarse', m2Goyo.cuerpo.element.code);

  // Un ítem suyo donde también está otro contratista: ve los pendientes del otro.
  const m1Goyo = await lee(pide(env, 'goyo', `/elements/${m1}`));
  rev(m1Goyo.cuerpo.recorte !== true && m1Goyo.cuerpo.punch.some((k) => k.id === 'k-berna'), 'en un ítem suyo ve el pendiente de Berna (el vidrio va atrasado)', `${m1Goyo.cuerpo.punch.length} pend`);
  rev(m1Goyo.cuerpo.log.length === 1, 'y la bitácora del ítem suyo', `${m1Goyo.cuerpo.log.length} renglón`);

  // Tema: un pendiente asignado en un ítem donde no está en la lista.
  const m2Tema = await lee(pide(env, 'tema', `/elements/${m2}`));
  rev(m2Tema.cuerpo.recorte !== true && m2Tema.cuerpo.punch.some((k) => k.id === 'k-tema'), 'un pendiente a su nombre lo hace dueño del ítem aunque no esté en la lista: sigue viéndolo, como hoy');
  const obraTema = await lee(pide(env, 'tema', '/projects/obra-a'));
  rev(JSON.stringify(obraTema.cuerpo.mios) === JSON.stringify([m2]), 'y en el plano de Tema el suyo es M2', JSON.stringify(obraTema.cuerpo.mios));
  const m1Tema = await lee(pide(env, 'tema', `/elements/${m1}`));
  rev(m1Tema.cuerpo.recorte === true && m1Tema.cuerpo.punch.length === 0, 'el tercer contratista, que no está en M1 ni tiene pendientes ahí, lo ve sólo para ubicarse');

  // Quien dirige ve la lista de contratistas del ítem.
  const m1Duena = await lee(pide(env, 'duena', `/elements/${m1}`));
  rev(m1Duena.cuerpo.contratistas?.map((c) => c.name).sort().join(',') === 'Berna,Goyo', 'quien dirige ve la lista de contratistas del ítem', m1Duena.cuerpo.contratistas?.map((c) => c.name).join(', '));

  // elements.resp no se toca.
  const resp = db.prepare(`SELECT resp FROM elements WHERE id IN (?, ?, ?)`).all(m1, m2, m3).map((r) => r.resp);
  rev(resp.every((r) => r === 'taller101'), 'elements.resp sigue diciendo lo mismo: no se migra ni se escribe', resp.join('|'));

  // Desactivar un usuario no se lleva el ítem ni la asignación por delante
  // (a la gente se le da de baja con active = 0; borrarla la impiden las
  // llaves foráneas de pendientes y bitácora, y así debe ser).
  db.prepare(`UPDATE users SET active = 0 WHERE id = ?`).run(GENTE.berna.id);
  rev(db.prepare(`SELECT COUNT(*) AS n FROM elements WHERE id = ?`).get(m1).n === 1 && db.prepare(`SELECT COUNT(*) AS n FROM element_contratistas WHERE element_id = ?`).get(m1).n === 2,
    'desactivar un usuario: el ítem y las asignaciones se quedan');
  const bernaFuera = await lee(pide(env, 'berna', `/elements/${m1}`));
  rev(bernaFuera.estado === 401, 'y el desactivado ya no entra', String(bernaFuera.estado));
  const borrado = await lee(pide(env, 'duena', `/elements/${m1}`, { metodo: 'DELETE' }));
  rev(borrado.estado === 200 && db.prepare(`SELECT COUNT(*) AS n FROM element_contratistas WHERE element_id = ?`).get(m1).n === 0, 'borrar un ítem se lleva sus asignaciones');
}

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
