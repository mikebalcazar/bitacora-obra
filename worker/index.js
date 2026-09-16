// quell101 — Cloudflare Worker (API + assets)
// Bindings: DB (D1), FILES (R2), ASSETS (static). Vars: MAIL_FROM, APP_NAME, DEV. Secrets: RESEND_API_KEY

const JSON_H = { 'content-type': 'application/json; charset=utf-8' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSON_H, ...extra } });
const err = (msg, status = 400) => json({ error: msg }, status);
const now = () => new Date().toISOString();
const plusMin = (m) => new Date(Date.now() + m * 60000).toISOString();
const uid = () => crypto.randomUUID();
const COOKIE = 'bo_session';

// La puerta de la suite. quell101 le habla a `suite101-api` desde su mismo
// origen, por `/s101/*`, con un *service binding*: una llamada de Worker a
// Worker que nunca sale a internet. El Worker pone `X-App`; la interfaz no lo
// manda, y si lo manda se sobrescribe: la app no decide quién dice ser.
const PREFIJO_SUITE = '/s101';
const APP = 'quell101';
// Con la que la suite guarda la lista de apps de cada persona. NO es el nombre
// de la app: `miembros.apps` lleva llaves cortas (`quell`, `dash`, `roster`…),
// que es lo que escribe workshop101 y lo que compara la propia API
// (`LLAVE_APP` en schema/tipos.ts).
const LLAVE = 'quell';

// ---------- auth helpers ----------
function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
// En las apps empaquetadas la cookie no viaja —otro origen— y una etiqueta de
// imagen no puede mandar encabezados, así que para los archivos el token
// también se acepta en la dirección. Solo para eso: queda escrito en registros
// y en el historial, y por eso no se usa para el resto.
const tokenEnDireccion = (req) =>
  new URL(req.url).pathname.startsWith('/files/') ? new URL(req.url).searchParams.get('t') : null;

/** Le pregunta a la suite quién viene. Devuelve lo que contesta `/yo` o null.
 *
 *  Se le pasa tal cual lo que trajo la petición: la cookie `s101` si es el
 *  sitio, o `Authorization: Bearer` si es una app empacada. La suite decide;
 *  aquí no se abre ninguna sesión ni se guarda nada. */
async function laSuiteDiceQuien(req, env) {
  if (!env.API) return null;
  const galleta = req.headers.get('cookie');
  const llevada = req.headers.get('authorization') || (tokenEnDireccion(req) ? `Bearer ${tokenEnDireccion(req)}` : null);
  if (!galleta && !llevada) return null;
  const h = new Headers({ 'X-App': APP });
  if (galleta) h.set('cookie', galleta);
  if (llevada) h.set('authorization', llevada);
  const r = await env.API.fetch(new Request('https://suite101-api/yo', { headers: h }));
  if (!r.ok) return null;
  const cuerpo = await r.json().catch(() => null);
  return cuerpo?.data || null;
}

/** ¿La suite le abre quell101 a esta persona?
 *
 *  El dueño de la suite entra a todo. A los demás se lo dice su membresía: la
 *  lista de apps que le puso el administrador de su empresa en workshop101.
 *  Vacía quiere decir todas, que es como la deja workshop101 cuando se marcan
 *  todas las casillas.
 *
 *  Se acepta la llave corta, que es la que se guarda, y también el nombre
 *  largo: cuesta nada y evita que una lista escrita a mano deje a alguien
 *  fuera sin que se entienda por qué. */
const abre = (o) => !o.apps?.length || o.apps.includes(LLAVE) || o.apps.includes(APP);
const laSuiteLeAbre = (yo) =>
  !!yo && (yo.superadmin === true || (yo.orgs || []).some(abre));

async function getUser(req, env) {
  // Primero la suite, que es la puerta buena. Quien entra por ahí se casa con
  // su renglón de `users` por el correo: la suite dice quién es, y esta base
  // dice qué hace aquí —dueño, supervisor o contratista— y en qué obras.
  const yo = await laSuiteDiceQuien(req, env);
  if (yo) {
    if (!laSuiteLeAbre(yo)) return null;
    const row = await env.DB.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`)
      .bind(String(yo.usuario?.correo || '').toLowerCase()).first();
    if (row) return row;
    // Entra a la suite pero nadie le ha dado de alta aquí: no se le inventa un
    // renglón. Dar de alta es decidir un rol, y eso lo hace una persona.
    return null;
  }

  // La puerta vieja, mientras dure la mudanza. El APK y la app de Windows que
  // ya están instaladas llevan adentro la copia anterior del sitio y entran
  // por aquí; el día que se rearmen entrarán por la suite como el sitio.
  const token = getCookie(req, COOKIE) || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || tokenEnDireccion(req);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`
  ).bind(token, now()).first();
  return row || null;
}
// Tres roles y nada más:
//   admin ("dueño")  manda: todo lo del supervisor, más dar de alta gente.
//   int   supervisor crea y edita proyectos, planos, elementos y pendientes, y
//                    es el único que cierra un pendiente: quien lo pidió es
//                    quien dice si quedó bien.
//   con   contratista lee lo que trae su nombre, sube la evidencia de que lo
//                    arregló y lo marca terminado. No edita nada, ni ve lo que
//                    no le toca.
const isStaff = (u) => u && (u.role === 'admin' || u.role === 'int');
const esDueno = (u) => u && u.role === 'admin';

// El correo de invitación. Dar de alta a alguien y no avisarle no es invitar:
// la persona no sabe que existe la aplicación, ni que su correo ya es su
// llave. Aquí se le dice a qué obra entró, qué va a poder hacer, y el único
// camino para entrar la primera vez: su correo, un código de seis dígitos, y
// el PIN que se pone ahí mismo.
//
// La dirección del sitio sale de la propia petición y no de una variable de
// configuración: el Worker ya sabe dónde vive, y una variable más es una
// variable que algún día va a quedar apuntando a otro lado.
async function invita(env, req, quien, obra, rol) {
  const sitio = new URL(req.url).origin;
  const app = env.APP_NAME || 'quell101';
  const puede = rol === 'tra'
    ? 'Vas a poder ver la obra completa —planos, ítems, bitácora y punchlist— y levantar dudas para el supervisor. No vas a poder editar nada.'
    : 'Vas a ver los pendientes que traigan tu nombre, subir la evidencia de que quedaron y levantar dudas para el supervisor.';
  const html = `
    <p>Hola${quien.name ? ' ' + quien.name : ''},</p>
    <p>Te dieron acceso a la obra <b>${obra.name}</b>${obra.client ? ` (${obra.client})` : ''} en <b>${app}</b>.</p>
    <p>${puede}</p>
    <p><b>Para entrar la primera vez:</b></p>
    <ol>
      <li>Abre <a href="${sitio}">${sitio}</a></li>
      <li>Escribe este correo: <b>${quien.email}</b></li>
      <li>Te llega un código de 6 dígitos y con él creas tu PIN.</li>
    </ol>
    <p>De ahí en adelante entras con tu correo y tu PIN, sin esperar ningún código.
       Es el mismo correo y el mismo PIN de las demás aplicaciones de la suite 101.</p>
    <p>Si al escribir tu correo te dice que no tiene acceso, es que todavía no te
       han dado de alta en la suite: avísale a quien administra tu empresa.</p>`;
  // Que no se caiga el alta por un correo que no salió: la persona ya quedó
  // agregada, y el correo se le puede volver a mandar.
  try { await sendMail(env, quien.email, `Te dieron acceso a ${obra.name} en ${app}`, html); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

// Qué es esta persona en esta obra. Quien la dirige lo es en todas; a los demás
// se lo dice su membresía, obra por obra: la misma persona es contratista en
// una —donde solo le tocan sus pendientes— y trabajador en otra —donde anda
// todo el día y necesita ver el proyecto completo sin moverle nada—.
const ROLES_OBRA = ['con', 'tra'];
async function rolEnObra(env, user, pid) {
  if (isStaff(user)) return user.role;
  const r = await env.DB.prepare(`SELECT rol FROM project_members WHERE project_id = ? AND user_id = ?`).bind(pid, user.id).first();
  return r ? r.rol : null;
}
// El contratista es el único que ve un pedazo de la obra en vez de la obra.
const soloLoSuyo = (rol) => rol === 'con';

// ¿Este pendiente trae su nombre?
async function leToca(env, user, punchId) {
  if (isStaff(user)) return true;
  const r = await env.DB.prepare(`SELECT 1 FROM punch_items WHERE id = ? AND assignee_id = ?`).bind(punchId, user.id).first();
  return !!r;
}
// ¿Tiene algo asignado en este elemento? Si no, para él el elemento no existe.
async function tieneAlgoEn(env, user, elementId, mio = true) {
  if (!mio) return true;
  const r = await env.DB.prepare(`SELECT 1 FROM punch_items WHERE element_id = ? AND assignee_id = ? LIMIT 1`).bind(elementId, user.id).first();
  return !!r;
}

async function canAccessProject(env, user, projectId) {
  if (isStaff(user)) return true;
  const r = await env.DB.prepare(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`).bind(projectId, user.id).first();
  return !!r;
}
async function projectOfPlan(env, planId) {
  const r = await env.DB.prepare(`SELECT project_id FROM plans WHERE id = ?`).bind(planId).first();
  return r ? r.project_id : null;
}
async function projectOfElement(env, elementId) {
  const r = await env.DB.prepare(`SELECT p.project_id FROM elements e JOIN plans p ON p.id = e.plan_id WHERE e.id = ?`).bind(elementId).first();
  return r ? r.project_id : null;
}
async function projectOfPunch(env, punchId) {
  const r = await env.DB.prepare(`SELECT p.project_id FROM punch_items k JOIN elements e ON e.id = k.element_id JOIN plans p ON p.id = e.plan_id WHERE k.id = ?`).bind(punchId).first();
  return r ? r.project_id : null;
}

// ---------- etapas ----------
// El camino que recorre un ítem antes de entregarse. La lista vive en la base y
// no aquí porque todavía no está decidida: agregar una etapa es un INSERT.
async function catalogoEtapas(env) {
  const { results } = await env.DB.prepare(`SELECT clave, nombre, orden, abre_punchlist FROM etapas WHERE activa = 1 ORDER BY orden`).all();
  return results;
}

// Marcar una etapa marca también todas las anteriores, y desmarcarla desmarca
// todas las que siguen. El avance de un ítem es un número —tres de cuatro— y
// eso sólo se sostiene si el camino no tiene huecos: nadie fleta lo que no ha
// comprado, y si resulta que no se había comprado, tampoco había salido.
async function marcaEtapa(env, user, eid, clave, hecha) {
  const etapas = await catalogoEtapas(env);
  const i = etapas.findIndex((x) => x.clave === clave);
  if (i < 0) return { error: 'etapa desconocida' };
  const tocadas = hecha ? etapas.slice(0, i + 1) : etapas.slice(i);
  const q = hecha
    ? etapas.slice(0, i + 1).map((x) =>
        env.DB.prepare(`INSERT OR IGNORE INTO element_etapas (element_id, etapa, hecha_en, hecha_por) VALUES (?,?,?,?)`).bind(eid, x.clave, now(), user.id))
    : etapas.slice(i).map((x) =>
        env.DB.prepare(`DELETE FROM element_etapas WHERE element_id = ? AND etapa = ?`).bind(eid, x.clave));
  if (q.length) await env.DB.batch(q);

  // La etapa que abre el punchlist es la bisagra del ítem: al cruzarla cambia
  // de fase, y queda escrito quién la cruzó y cuándo.
  const bisagra = tocadas.find((x) => x.abre_punchlist);
  if (bisagra) {
    if (hecha) await env.DB.prepare(`UPDATE elements SET fase = 'punchlist', entregado_en = ?, entregado_por = ? WHERE id = ?`).bind(now(), user.id, eid).run();
    // Volver atrás no borra los pendientes que ya se levantaron: se quedan
    // guardados y vuelven a la vista en cuanto se entregue otra vez.
    else await env.DB.prepare(`UPDATE elements SET fase = 'produccion', entregado_en = NULL, entregado_por = NULL WHERE id = ?`).bind(eid).run();
  }
  return { ok: true };
}

// Las etapas cumplidas de un puñado de ítems, en una sola consulta.
async function etapasDe(env, ids) {
  if (!ids.length) return {};
  const marcas = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT ee.element_id, ee.etapa, ee.hecha_en, u.name AS hecha_por_nombre
       FROM element_etapas ee JOIN etapas t ON t.clave = ee.etapa AND t.activa = 1
       LEFT JOIN users u ON u.id = ee.hecha_por
      WHERE ee.element_id IN (${marcas}) ORDER BY t.orden`).bind(...ids).all();
  const out = {};
  for (const r of results) (out[r.element_id] = out[r.element_id] || []).push(r);
  return out;
}

// ---------- PIN ----------
// Seis dígitos son un millón de combinaciones: se guardan derivados, nunca en
// claro, y probar a ciegas se castiga con esperas que crecen. Las vueltas de
// PBKDF2 hacen que cada intento cueste, aquí y para quien quisiera probar el
// millón con la base robada en la mano.
//
// Cien mil es el techo: Cloudflare no ejecuta PBKDF2 con más y responde
// "iteration counts above 100000 are not supported". Lo que de verdad frena a
// quien prueba a ciegas contra el servidor no son las vueltas, son los bloqueos
// que crecen; las vueltas son para el día que alguien se lleve la base.
const VUELTAS = 100000;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function derivaPin(pin, salt) {
  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: VUELTAS },
    clave, 256
  );
  return b64(bits);
}
const pinValido = (p) => /^[0-9]{6}$/.test(String(p || ''));
// Un PIN que se adivina de una no protege nada: 123456, 000000, 111111, y las
// escaleras. No es una lista larga a propósito; es quitar lo obvio.
function pinFlojo(p) {
  const s = String(p);
  if (/^(\d)\1{5}$/.test(s)) return 'Ese PIN es un solo número repetido.';
  if ('0123456789'.includes(s) || '9876543210'.includes(s)) return 'Ese PIN es una escalera de números.';
  if (['123456', '654321', '111111', '000000', '121212', '112233'].includes(s)) return 'Ese PIN es de los primeros que alguien probaría.';
  return null;
}

// Las esperas, iguales para el usuario y para la dirección de internet.
const CASTIGOS_PIN = [15 * 60, 60 * 60, 4 * 3600, 24 * 3600];
const FALLOS_PIN = 5;
function esperaLegible(seg) {
  const min = Math.ceil(seg / 60);
  if (min <= 1) return 'un minuto';
  if (min < 90) return `${min} minutos`;
  const h = Math.round(min / 60);
  return h === 1 ? 'una hora' : `${h} horas`;
}
function quienIntenta(req) {
  return req.headers.get('CF-Connecting-IP') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocido';
}
const bloqueado = (hasta) => !!hasta && hasta > now();

async function castigaIp(env, ip) {
  const r = await env.DB.prepare(`SELECT * FROM pin_intentos WHERE ip = ?`).bind(ip).first();
  const fails = (r?.fails || 0) + 1;
  if (fails >= FALLOS_PIN) {
    const castigos = Math.min((r?.castigos || 0) + 1, CASTIGOS_PIN.length);
    const seg = CASTIGOS_PIN[castigos - 1];
    await env.DB.prepare(
      `INSERT INTO pin_intentos (ip, fails, castigos, locked_until, visto_en) VALUES (?,0,?,?,?)
       ON CONFLICT(ip) DO UPDATE SET fails=0, castigos=excluded.castigos, locked_until=excluded.locked_until, visto_en=excluded.visto_en`
    ).bind(ip, castigos, new Date(Date.now() + seg * 1000).toISOString(), now()).run();
    return seg;
  }
  await env.DB.prepare(
    `INSERT INTO pin_intentos (ip, fails, castigos, locked_until, visto_en) VALUES (?,?,0,NULL,?)
     ON CONFLICT(ip) DO UPDATE SET fails=excluded.fails, visto_en=excluded.visto_en`
  ).bind(ip, fails, now()).run();
  return 0;
}

async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return { dev: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'quell101 <onboarding@resend.dev>', to: [to], subject, html }),
  });
  if (!r.ok) throw new Error('mail: ' + (await r.text()));
  return { ok: true };
}

// ---------- operaciones repetidas ----------
// Lo que se escribió sin señal llega con un identificador hecho en el
// dispositivo. Si la señal se cayó justo al terminar de subir, nadie supo si
// llegó, y al reintentar llega otra vez con el mismo identificador: se reconoce
// y no se repite. Sin esto, una foto subida con mala señal aparecería tres
// veces en la bitácora.
/* El código de un ítem es único dentro de su obra, y quien lo impide es un
 * índice de la base (migración 0010), no una revisión de este código: el
 * `MW-07` repetido de Sanje CC 37 entró porque no había ninguna cerradura, y
 * una ruta nueva que se olvide de preguntar vuelve a abrir la puerta.
 *
 * Lo que sí toca aquí es traducir el choque. Sin esto, el supervisor que teclea
 * un código que ya existe ve un «error interno» y no sabe qué hizo mal. */
const esCodigoRepetido = (e) => /UNIQUE constraint failed: elements\.project_id, elements\.code/i.test(String(e?.message || e));

async function conCodigoUnico(hacer, codigo) {
  try {
    return await hacer();
  } catch (e) {
    if (!esCodigoRepetido(e)) throw e;
    return err(`En esta obra ya hay un ítem con el código ${codigo}. Los códigos no se repiten dentro de una misma obra: escoge otro.`, 409);
  }
}

async function yaHecha(env, opId) {
  if (!opId) return false;
  const r = await env.DB.prepare(`SELECT 1 FROM operaciones WHERE id = ?`).bind(opId).first();
  return !!r;
}
async function apunta(env, opId) {
  if (!opId) return;
  await env.DB.prepare(`INSERT OR IGNORE INTO operaciones (id, cuando) VALUES (?,?)`).bind(opId, now()).run();
}

// ---------- photos ----------
async function savePhotos(env, user, ownerType, ownerId, files) {
  const out = [];
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    const id = uid();
    const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const key = `photos/${ownerType}/${ownerId}/${id}.${ext}`;
    await env.FILES.put(key, f.stream(), { httpMetadata: { contentType: f.type || 'image/jpeg' } });
    await env.DB.prepare(
      `INSERT INTO photos (id, owner_type, owner_id, r2_key, file_name, size, user_id) VALUES (?,?,?,?,?,?,?)`
    ).bind(id, ownerType, ownerId, key, f.name || '', f.size, user.id).run();
    out.push({ id, r2_key: key, file_name: f.name || '', size: f.size, user_id: user.id, created_at: now() });
  }
  return out;
}
async function photosFor(env, ownerType, ids) {
  if (!ids.length) return {};
  const q = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.name AS user_name FROM photos p LEFT JOIN users u ON u.id = p.user_id WHERE p.owner_type = ? AND p.owner_id IN (${q}) ORDER BY p.created_at`
  ).bind(ownerType, ...ids).all();
  const map = {};
  for (const p of results) (map[p.owner_id] ||= []).push(p);
  return map;
}

// ---------- router ----------
// La app de Android y la de Windows llevan su propia copia del sitio adentro, así
// que no comparten origen con el servidor: sus peticiones son de otro origen y
// el navegador las bloquea si no se dicen bienvenidas. Se nombran una por una;
// abrirlo a cualquiera sería regalar la puerta.
const ORIGENES = new Set([
  'capacitor://localhost',   // Android
  'http://localhost',        // Android, y desarrollo
  'https://localhost',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'app://bitacora',          // Windows, envoltorio de Electron
  // El nombre interno de la app de Windows se queda como está aunque la
  // aplicación se llame de otro modo: es una dirección entre el programa y el
  // servidor, y cambiarla dejaría fuera a quien ya la tenga instalada.
  'https://app.t101pano',
]);
function permiso(req) {
  const o = req.headers.get('origin');
  if (!o || !ORIGENES.has(o)) return null;
  return {
    'access-control-allow-origin': o,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const cors = permiso(req);
    try {
      if (req.method === 'OPTIONS' && cors) return new Response(null, { status: 204, headers: cors });
      let r;
      if (path === PREFIJO_SUITE || path.startsWith(PREFIJO_SUITE + '/')) {
        // `/s101/auth/codigo` → `/auth/codigo`. Un `/s101` pelón va a la raíz.
        const u = new URL(req.url);
        u.pathname = u.pathname.slice(PREFIJO_SUITE.length) || '/';
        const p = new Request(u, req);
        p.headers.set('X-App', APP);
        r = await env.API.fetch(p);
      }
      else if (path.startsWith('/api/')) r = await api(req, env, url, path);
      else if (path.startsWith('/descargas/')) r = await entregaApp(env, path.slice(11));
      else if (path.startsWith('/files/')) r = await serveFile(req, env, path.slice(7));
      else return env.ASSETS.fetch(req);
      if (cors) { r = new Response(r.body, r); for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); }
      return r;
    } catch (e) {
      console.error(e);
      const r = err(e.message || 'error interno', 500);
      if (cors) for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    }
  },
};

// Las apps se bajan sin haber entrado: quien va a instalarlas todavía no tiene
// sesión, y muchas veces es alguien de obra al que le pasaron la liga. Son los
// mismos archivos que arma GitHub, guardados en R2 al terminar de armarlos.
const APPS = {
  'android.apk': { llave: 'apps/android.apk', tipo: 'application/vnd.android.package-archive', nombre: 'quell101.apk' },
  'windows.exe': { llave: 'apps/windows.exe', tipo: 'application/vnd.microsoft.portable-executable', nombre: 'quell101.exe' },
  'windows-nativo.exe': { llave: 'apps/windows-nativo.exe', tipo: 'application/vnd.microsoft.portable-executable', nombre: 'quell101 (nativo).exe' },
  'piloto.zip': { llave: 'apps/piloto.zip', tipo: 'application/zip', nombre: 'quell101 piloto nativo.zip' },
};

async function entregaApp(env, cual) {
  const app = APPS[cual];
  if (!app) return err('no encontrado', 404);
  const obj = await env.FILES.get(app.llave);
  if (!obj) return err('Todavía no se ha armado esta app.', 404);
  const h = new Headers();
  h.set('content-type', app.tipo);
  h.set('content-disposition', `attachment; filename="${app.nombre}"`);
  h.set('content-length', String(obj.size));
  // Sin caché larga: la liga es siempre la misma y detrás cambia la versión.
  h.set('cache-control', 'public, max-age=300');
  return new Response(obj.body, { headers: h });
}

async function serveFile(req, env, key) {
  const user = await getUser(req, env);
  if (!user) return err('no autorizado', 401);
  const obj = await env.FILES.get(key);
  if (!obj) return err('no encontrado', 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('cache-control', 'private, max-age=31536000, immutable');
  return new Response(obj.body, { headers: h });
}

async function api(req, env, url, path) {
  const m = req.method;
  const seg = path.slice(5).split('/').filter(Boolean); // after /api/

  // Señal de vida, sin sesión: la usa el despliegue para comprobar que el
  // Worker quedó arriba antes de dar por buena la publicación.
  // Qué apps están disponibles y de cuándo son. Sin sesión: se pregunta desde la
  // pantalla de entrada, antes de que nadie haya entrado.
  if (seg[0] === 'apps' && m === 'GET') {
    const salida = {};
    for (const [cual, app] of Object.entries(APPS)) {
      const obj = await env.FILES.head(app.llave).catch(() => null);
      if (obj) salida[cual] = { tamano: obj.size, cuando: obj.uploaded };
    }
    return json({ apps: salida });
  }

  if (seg[0] === 'salud' && m === 'GET') return json({ ok: true, app: env.APP_NAME || 'quell101', hora: now() });

  // ----- auth -----
  // Abre sesión y la devuelve firmada en cookie, y también como token suelto:
  // la app de Android y la de Windows no comparten origen con el sitio, así que
  // para ellas la cookie no sirve y llevan el token a mano.
  async function abreSesion(u) {
    const token = uid() + uid().replace(/-/g, '');
    await env.DB.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)`).bind(token, u.id, plusMin(60 * 24 * 90)).run();
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return json({ ok: true, user: pubUser(u), token, tiene_pin: !!u.pin_hash }, 200, {
      'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure}`,
    });
  }

  if (seg[0] === 'auth') {
    // Entrar con el PIN de siempre: sin esperar correo, que en obra es lo que
    // hace que la gente deje de abrir la app.
    if (seg[1] === 'pin' && !seg[2] && m === 'POST') {
      const { email, pin } = await req.json();
      const e = String(email || '').trim().toLowerCase();
      const ip = quienIntenta(req);

      const freno = await env.DB.prepare(`SELECT * FROM pin_intentos WHERE ip = ?`).bind(ip).first();
      if (bloqueado(freno?.locked_until)) {
        return err('Demasiados intentos desde aquí. Espera un rato o entra con un código a tu correo.', 429);
      }

      const u = await env.DB.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`).bind(e).first();
      // Sin usuario, sin PIN puesto o con PIN malo se contesta lo mismo: quien
      // esté probando no aprende de aquí quién existe y quién no.
      const malo = async () => {
        const seg2 = await castigaIp(env, ip);
        return err(seg2 ? `Demasiados intentos. Espera ${esperaLegible(seg2)} o entra con un código a tu correo.` : 'Correo o PIN incorrecto.', 401);
      };
      if (!u || !u.pin_hash || !pinValido(pin)) return await malo();

      if (bloqueado(u.pin_locked_until)) {
        return err('Este usuario está bloqueado un rato por intentos fallidos. Entra con un código a tu correo.', 429);
      }

      const hash = await derivaPin(pin, u.pin_salt);
      if (hash !== u.pin_hash) {
        const fails = (u.pin_fails || 0) + 1;
        if (fails >= FALLOS_PIN) {
          const castigos = Math.min((u.pin_castigos || 0) + 1, CASTIGOS_PIN.length);
          const segs = CASTIGOS_PIN[castigos - 1];
          await env.DB.prepare(`UPDATE users SET pin_fails = 0, pin_castigos = ?, pin_locked_until = ? WHERE id = ?`)
            .bind(castigos, new Date(Date.now() + segs * 1000).toISOString(), u.id).run();
        } else {
          await env.DB.prepare(`UPDATE users SET pin_fails = ? WHERE id = ?`).bind(fails, u.id).run();
        }
        return await malo();
      }

      await env.DB.batch([
        env.DB.prepare(`UPDATE users SET pin_fails = 0, pin_castigos = 0, pin_locked_until = NULL WHERE id = ?`).bind(u.id),
        env.DB.prepare(`DELETE FROM pin_intentos WHERE ip = ?`).bind(ip),
      ]);
      return await abreSesion(u);
    }

    if (seg[1] === 'request' && m === 'POST') {
      const { email } = await req.json();
      const e = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return err('correo inválido');
      let user = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(e).first();
      if (!user) {
        const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
        if (count.n === 0) {
          // primer usuario = admin
          await env.DB.prepare(`INSERT INTO users (id, email, name, role, company) VALUES (?,?,?,?,?)`).bind(uid(), e, e.split('@')[0], 'admin', '').run();
          user = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(e).first();
        } else return err('Este correo no tiene acceso. Pide al administrador que te dé de alta.', 403);
      }
      if (!user.active) return err('Usuario inactivo', 403);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await env.DB.prepare(`INSERT OR REPLACE INTO login_codes (email, code, expires_at, attempts) VALUES (?,?,?,0)`).bind(e, code, plusMin(10)).run();
      const mail = await sendMail(env, e, `${code} — tu código de acceso`, `<p>Tu código para entrar a <b>${env.APP_NAME || 'quell101'}</b>:</p><p style="font-size:28px;letter-spacing:6px"><b>${code}</b></p><p>Vence en 10 minutos.</p>`);
      return json({ ok: true, ...(mail.dev && env.DEV ? { dev_code: code } : {}) });
    }
    if (seg[1] === 'verify' && m === 'POST') {
      const { email, code } = await req.json();
      const e = String(email || '').trim().toLowerCase();
      const row = await env.DB.prepare(`SELECT * FROM login_codes WHERE email = ?`).bind(e).first();
      if (!row || row.expires_at < now()) return err('Código vencido. Pide uno nuevo.', 401);
      if (row.attempts >= 5) return err('Demasiados intentos. Pide otro código.', 429);
      if (row.code !== String(code || '').trim()) {
        await env.DB.prepare(`UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?`).bind(e).run();
        return err('Código incorrecto', 401);
      }
      const user = await env.DB.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`).bind(e).first();
      if (!user) return err('Usuario no encontrado', 404);
      // Entrar por correo también levanta el castigo: quien probó su PIN de más
      // pero sí es quien dice ser, no se queda fuera cuatro horas.
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM login_codes WHERE email = ?`).bind(e),
        env.DB.prepare(`UPDATE users SET pin_fails = 0, pin_castigos = 0, pin_locked_until = NULL WHERE id = ?`).bind(user.id),
        env.DB.prepare(`DELETE FROM pin_intentos WHERE ip = ?`).bind(quienIntenta(req)),
      ]);
      return await abreSesion(user);
    }
    if (seg[1] === 'logout' && m === 'POST') {
      const token = getCookie(req, COOKIE);
      if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
      return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` });
    }
    return err('ruta no encontrada', 404);
  }

  const user = await getUser(req, env);
  if (!user) return err('no autorizado', 401);

  if (seg[0] === 'me' && m === 'GET') return json({ user: pubUser(user) });

  // Poner o cambiar el PIN. Se pide tener sesión: o se acaba de entrar con el
  // código del correo —la primera vez, o porque lo olvidó— o ya estaba dentro.
  if (seg[0] === 'pin' && m === 'POST') {
    const { pin } = await req.json();
    if (!pinValido(pin)) return err('El PIN son seis dígitos.');
    const flojo = pinFlojo(pin);
    if (flojo) return err(flojo);
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derivaPin(pin, salt);
    await env.DB.prepare(
      `UPDATE users SET pin_hash = ?, pin_salt = ?, pin_set_at = ?, pin_fails = 0, pin_castigos = 0, pin_locked_until = NULL WHERE id = ?`
    ).bind(hash, salt, now(), user.id).run();
    return json({ ok: true });
  }

  // ----- users (admin) -----
  if (seg[0] === 'users') {
    if (user.role !== 'admin') return err('sólo administrador', 403);
    if (m === 'GET') {
      const { results } = await env.DB.prepare(`SELECT id, email, name, role, company, active, created_at FROM users ORDER BY role, name`).all();
      return json({ users: results });
    }
    if (m === 'POST') {
      const b = await req.json();
      const e = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return err('correo inválido');
      const ya = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(e).first();
      if (ya) return err('Ese correo ya está dado de alta.', 409);
      const id = uid();
      await env.DB.prepare(`INSERT INTO users (id, email, name, role, company) VALUES (?,?,?,?,?)`)
        .bind(id, e, b.name || e.split('@')[0], ['admin', 'int', 'con'].includes(b.role) ? b.role : 'con', b.company || '').run();
      return json({ ok: true, id });
    }
    if (m === 'PATCH' && seg[1]) {
      const b = await req.json();
      // Nadie se quita a sí mismo el mando ni se desactiva: si el dueño se
      // baja de rol por error, se queda sin quién dé de alta a nadie y hay que
      // entrar a la base a mano.
      if (seg[1] === user.id && ((b.role && b.role !== user.role) || b.active === false)) {
        return err('No puedes cambiarte el rol ni desactivarte a ti mismo. Que lo haga otro dueño.', 400);
      }
      if (b.role && !['admin', 'int', 'con'].includes(b.role)) return err('rol desconocido');
      await env.DB.prepare(`UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), company = COALESCE(?, company), active = COALESCE(?, active) WHERE id = ?`)
        .bind(b.name ?? null, b.role ?? null, b.company ?? null, b.active === undefined ? null : (b.active ? 1 : 0), seg[1]).run();
      return json({ ok: true });
    }
  }

  // ----- projects -----
  if (seg[0] === 'projects') {
    if (!seg[1]) {
      if (m === 'GET') {
        // Quien no dirige la obra ve nada más las obras donde está metido. Y el
        // número que trae cada tarjeta depende de qué sea ahí: al contratista
        // se le cuentan sus pendientes, no los de todos —si le aparece 40 y
        // suyos son 3, el tablero le miente—; al trabajador, que ve la obra
        // completa, se le cuentan todos.
        const sql = isStaff(user)
          ? `SELECT p.*, (SELECT COUNT(*) FROM punch_items k JOIN elements e ON e.id=k.element_id JOIN plans pl ON pl.id=e.plan_id WHERE pl.project_id=p.id AND k.status!='ok') AS open_count FROM projects p ORDER BY p.status, p.name`
          : `SELECT p.*, pm.rol AS mi_rol,
               (SELECT COUNT(*) FROM punch_items k JOIN elements e ON e.id=k.element_id JOIN plans pl ON pl.id=e.plan_id
                 WHERE pl.project_id=p.id AND k.status!='ok' AND (pm.rol <> 'con' OR k.assignee_id=?)) AS open_count
             FROM projects p JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=? ORDER BY p.status, p.name`;
        const stmt = isStaff(user) ? env.DB.prepare(sql) : env.DB.prepare(sql).bind(user.id, user.id);
        const { results } = await stmt.all();
        return json({ projects: results });
      }
      if (m === 'POST') {
        if (!isStaff(user)) return err('sin permiso', 403);
        const b = await req.json();
        if (!b.name) return err('nombre requerido');
        const id = uid();
        await env.DB.prepare(`INSERT INTO projects (id, name, client, created_by) VALUES (?,?,?,?)`).bind(id, b.name, b.client || '', user.id).run();
        return json({ ok: true, id });
      }
    }
    const pid = seg[1];
    if (!(await canAccessProject(env, user, pid))) return err('sin acceso al proyecto', 403);

    if (!seg[2] && m === 'GET') {
      const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(pid).first();
      if (!project) return err('no encontrado', 404);
      const { results: plans } = await env.DB.prepare(`SELECT * FROM plans WHERE project_id = ? ORDER BY sort, created_at`).bind(pid).all();
      // Al contratista solo le salen en el plano los elementos donde tiene algo
      // asignado, y los números de cada pin cuentan lo suyo. Lo demás no es
      // asunto suyo y de paso no se pierde entre cien pines que no le tocan.
      const mio = soloLoSuyo(await rolEnObra(env, user, pid));
      const { results: elements } = mio
        ? await env.DB.prepare(
            `SELECT e.*,
               (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id AND k.assignee_id=? AND k.status='pend') AS n_pend,
               (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id AND k.assignee_id=? AND k.status='proc') AS n_proc,
               (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id AND k.assignee_id=?) AS n_total,
               (SELECT COUNT(*) FROM element_etapas ee JOIN etapas t ON t.clave=ee.etapa AND t.activa=1 WHERE ee.element_id=e.id) AS n_etapas,
               0 AS n_log
             FROM elements e JOIN plans p ON p.id = e.plan_id
             WHERE p.project_id = ? AND EXISTS (SELECT 1 FROM punch_items k WHERE k.element_id=e.id AND k.assignee_id=?)
             ORDER BY e.code`
          ).bind(user.id, user.id, user.id, pid, user.id).all()
        : await env.DB.prepare(
            `SELECT e.*,
               (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id AND k.status='pend') AS n_pend,
               (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id AND k.status='proc') AS n_proc,
               (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id) AS n_total,
               (SELECT COUNT(*) FROM element_etapas ee JOIN etapas t ON t.clave=ee.etapa AND t.activa=1 WHERE ee.element_id=e.id) AS n_etapas,
               (SELECT COUNT(*) FROM log_entries l WHERE l.element_id=e.id) AS n_log
             FROM elements e JOIN plans p ON p.id = e.plan_id WHERE p.project_id = ? ORDER BY e.code`
          ).bind(pid).all();
      // Quién más anda en la obra es cosa de quien la dirige.
      const { results: members } = mio
        ? { results: [] }
        : await env.DB.prepare(`SELECT u.id, u.name, u.email, u.role, u.company, pm.rol AS rol_obra FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?`).bind(pid).all();
      // Cuántas dudas están esperando respuesta: quien dirige ve las de todos,
      // quien pregunta ve las suyas. Va aquí y no en otra llamada porque es un
      // número que se pinta junto al resto de la pantalla.
      const qd = env.DB.prepare(`SELECT COUNT(*) AS n FROM dudas WHERE project_id = ? AND estado = 'abierta' ${isStaff(user) ? '' : 'AND user_id = ?'}`);
      const abiertas = await (isStaff(user) ? qd.bind(pid) : qd.bind(pid, user.id)).first();
      return json({ project, plans, elements, members, mi_rol: await rolEnObra(env, user, pid),
                    dudas_abiertas: abiertas ? abiertas.n : 0, etapas: await catalogoEtapas(env) });
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      await env.DB.prepare(`UPDATE projects SET name = COALESCE(?, name), client = COALESCE(?, client), status = COALESCE(?, status) WHERE id = ?`).bind(b.name ?? null, b.client ?? null, b.status ?? null, pid).run();
      return json({ ok: true });
    }
    if (seg[2] === 'members' && m === 'POST') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      const rol = ROLES_OBRA.includes(b.rol) ? b.rol : 'con';
      // Si ya estaba, esto es cambiarle el rol y no invitarlo: el correo sale
      // una sola vez, la primera. Si no, cada ajuste sería un correo más.
      const yaEstaba = await env.DB.prepare(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`).bind(pid, b.user_id).first();
      await env.DB.prepare(
        `INSERT INTO project_members (project_id, user_id, rol) VALUES (?,?,?)
         ON CONFLICT (project_id, user_id) DO UPDATE SET rol = excluded.rol`).bind(pid, b.user_id, rol).run();
      let aviso = null;
      if (!yaEstaba) {
        const quien = await env.DB.prepare(`SELECT id, email, name FROM users WHERE id = ?`).bind(b.user_id).first();
        const obra = await env.DB.prepare(`SELECT name, client FROM projects WHERE id = ?`).bind(pid).first();
        if (quien && obra) { const r = await invita(env, req, quien, obra, rol); if (!r.ok) aviso = r.error; }
      }
      return json({ ok: true, rol, invitado: !yaEstaba, aviso });
    }
    if (seg[2] === 'members' && m === 'DELETE' && seg[3]) {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`).bind(pid, seg[3]).run();
      return json({ ok: true });
    }
    if (seg[2] === 'plans' && m === 'POST') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const fd = await req.formData();
      const image = fd.get('image');
      if (!(image instanceof File)) return err('imagen del plano requerida');
      const id = uid();
      const imageKey = `plans/${pid}/${id}.png`;
      await env.FILES.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type || 'image/png' } });
      let sourceKey = null;
      const source = fd.get('source');
      if (source instanceof File && source.size) {
        sourceKey = `plans/${pid}/${id}-src.${(source.name.split('.').pop() || 'pdf').toLowerCase()}`;
        await env.FILES.put(sourceKey, source.stream(), { httpMetadata: { contentType: source.type || 'application/pdf' } });
      }
      const sort = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS s FROM plans WHERE project_id = ?`).bind(pid).first();
      await env.DB.prepare(`INSERT INTO plans (id, project_id, name, file_name, image_key, source_key, width, height, sort) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, pid, fd.get('name') || 'Plano', fd.get('file_name') || '', imageKey, sourceKey, +fd.get('width') || 0, +fd.get('height') || 0, sort.s).run();
      return json({ ok: true, id, image_key: imageKey });
    }
    // ----- dudas -----
    // La cola del supervisor: preguntas de obra, la más vieja primero, y se van
    // cerrando. Quien pregunta ve nada más las suyas; quien dirige, todas.
    if (seg[2] === 'dudas' && m === 'GET') {
      const todas = isStaff(user);
      const q = env.DB.prepare(
        `SELECT d.*, u.name AS quien, u.company AS quien_empresa, e.code AS element_code, e.name AS element_name, e.plan_id,
                r.name AS resuelta_por_nombre
           FROM dudas d JOIN users u ON u.id = d.user_id
           LEFT JOIN elements e ON e.id = d.element_id
           LEFT JOIN users r ON r.id = d.resuelta_por
          WHERE d.project_id = ? ${todas ? '' : 'AND d.user_id = ?'}
          ORDER BY CASE d.estado WHEN 'abierta' THEN 0 ELSE 1 END, d.created_at`);
      const { results: dudas } = await (todas ? q.bind(pid) : q.bind(pid, user.id)).all();
      // Las respuestas de todas, en una consulta: son pocas y se leen juntas.
      const ids = dudas.map((d) => d.id);
      let porDuda = {};
      if (ids.length) {
        const { results } = await env.DB.prepare(
          `SELECT r.*, u.name AS quien, u.role AS quien_rol FROM duda_respuestas r JOIN users u ON u.id = r.user_id
            WHERE r.duda_id IN (${ids.map(() => '?').join(',')}) ORDER BY r.created_at`).bind(...ids).all();
        for (const r of results) (porDuda[r.duda_id] = porDuda[r.duda_id] || []).push(r);
      }
      dudas.forEach((d) => (d.respuestas = porDuda[d.id] || []));
      const fd = await photosFor(env, 'duda', ids);
      const fr = await photosFor(env, 'duda_resp', Object.values(porDuda).flat().map((r) => r.id));
      dudas.forEach((d) => {
        d.photos = fd[d.id] || [];
        d.respuestas.forEach((r) => (r.photos = fr[r.id] || []));
      });
      return json({ dudas });
    }
    // Preguntar puede cualquiera que esté en la obra, incluido quien la dirige.
    if (seg[2] === 'dudas' && m === 'POST') {
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const texto = String(fd.get('texto') || '').trim();
      const files = fd.getAll('photos');
      if (!texto && !files.length) return err('Escribe la duda o manda una foto.');
      // Si la duda viene colgada de un ítem, que sea un ítem de esta obra: si no,
      // se podría preguntar sobre lo que hay en la obra de al lado.
      let eid = fd.get('element_id') || null;
      if (eid && (await projectOfElement(env, eid)) !== pid) eid = null;
      const id = uid();
      await env.DB.prepare(`INSERT INTO dudas (id, project_id, element_id, user_id, texto) VALUES (?,?,?,?,?)`)
        .bind(id, pid, eid, user.id, texto).run();
      const photos = await savePhotos(env, user, 'duda', id, files);
      await apunta(env, op);
      return json({ ok: true, id, photos });
    }

    if (seg[2] === 'punch' && m === 'GET') {
      const open = url.searchParams.get('status') !== 'all';
      const solo = soloLoSuyo(await rolEnObra(env, user, pid)) ? 'AND k.assignee_id = ?' : '';
      const q = env.DB.prepare(
        `SELECT k.*, e.code AS element_code, e.name AS element_name, e.plan_id, pl.name AS plan_name
         FROM punch_items k JOIN elements e ON e.id = k.element_id JOIN plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ${open ? "AND k.status != 'ok'" : ''} ${solo}
         ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`
      );
      const { results } = await (solo ? q.bind(pid, user.id) : q.bind(pid)).all();
      return json({ items: results });
    }
    // reporte: todo lo del proyecto (bitácora + punchlist + fotos) para armar el PDF en el cliente
    if (seg[2] === 'report' && m === 'GET') {
      // El reporte es la foto completa de la obra: bitácora, pendientes de
      // todos y fotos de todos. No es del contratista.
      if (!isStaff(user)) return err('El reporte lo saca el supervisor.', 403);
      const { results: logs } = await env.DB.prepare(
        `SELECT l.*, u.name AS user_name, u.role AS user_role, e.code AS element_code, e.name AS element_name, e.type AS element_type, e.resp AS element_resp, e.x, e.y, e.plan_id, pl.name AS plan_name, pl.file_name AS plan_file, pl.image_key, pl.width AS plan_w, pl.height AS plan_h
         FROM log_entries l JOIN users u ON u.id = l.user_id JOIN elements e ON e.id = l.element_id JOIN plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ORDER BY l.created_at`
      ).bind(pid).all();
      const { results: punch } = await env.DB.prepare(
        `SELECT k.*, e.code AS element_code, e.name AS element_name, e.type AS element_type, e.x, e.y, e.plan_id, pl.name AS plan_name, pl.file_name AS plan_file, pl.image_key, pl.width AS plan_w, pl.height AS plan_h
         FROM punch_items k JOIN elements e ON e.id = k.element_id JOIN plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`
      ).bind(pid).all();
      const lp = await photosFor(env, 'log', logs.map((l) => l.id));
      const kp = await photosFor(env, 'punch', punch.map((k) => k.id));
      logs.forEach((l) => (l.photos = lp[l.id] || []));
      punch.forEach((k) => (k.photos = kp[k.id] || []));
      return json({ logs, punch });
    }
  }

  // ----- plans -----
  if (seg[0] === 'plans' && seg[1]) {
    const pid = await projectOfPlan(env, seg[1]);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (seg[2] === 'elements' && m === 'POST') {
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      if (!isStaff(user)) return err('Los elementos los levanta el supervisor.', 403);
      if (!b.name) return err('nombre requerido');
      const id = b.op_id && /^[0-9a-f-]{36}$/i.test(b.op_id) ? b.op_id : uid();
      // La obra se guarda en el ítem, no se deduce pasando por el plano en cada
      // consulta. Y es lo que hace que la cerradura del código sirva: sin obra,
      // SQLite trata los nulos como distintos y el ítem nuevo se le escaparía.
      const codigo = String(b.code || '').trim();
      // Nace en producción: todavía no hay nada entregado que corregir.
      const alta = await conCodigoUnico(async () => {
        await env.DB.prepare(`INSERT INTO elements (id, plan_id, project_id, code, type, name, resp, x, y, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, seg[1], pid, codigo, b.type || 'Otro', b.name, b.resp || '', +b.x, +b.y, user.id).run();
        await apunta(env, b.op_id);
        return json({ ok: true, id });
      }, codigo);
      return alta;
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      await env.DB.prepare(`UPDATE plans SET name = COALESCE(?, name), sort = COALESCE(?, sort) WHERE id = ?`).bind(b.name ?? null, b.sort ?? null, seg[1]).run();
      return json({ ok: true });
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM plans WHERE id = ?`).bind(seg[1]).run();
      return json({ ok: true });
    }
  }

  // ----- elements -----
  if (seg[0] === 'elements' && seg[1]) {
    const eid = seg[1];
    const pid = await projectOfElement(env, eid);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (!seg[2] && m === 'GET') {
      const mio = soloLoSuyo(await rolEnObra(env, user, pid));
      if (!(await tieneAlgoEn(env, user, eid, mio))) return err('Este elemento no tiene nada asignado a ti.', 403);
      const element = await env.DB.prepare(`SELECT e.*, pl.name AS plan_name FROM elements e JOIN plans pl ON pl.id = e.plan_id WHERE e.id = ?`).bind(eid).first();
      // La bitácora es de quien dirige la obra: ahí se acuerdan cosas y se
      // anotan tratos. El contratista trabaja sobre sus pendientes, no ahí.
      const { results: log } = mio ? { results: [] } : await env.DB.prepare(`SELECT l.*, u.name AS user_name, u.role AS user_role FROM log_entries l JOIN users u ON u.id = l.user_id WHERE l.element_id = ? ORDER BY l.created_at`).bind(eid).all();
      const qp = env.DB.prepare(`SELECT k.*, u.name AS created_by_name, a.name AS assignee_name, a.company AS assignee_company
         FROM punch_items k LEFT JOIN users u ON u.id = k.created_by LEFT JOIN users a ON a.id = k.assignee_id
         WHERE k.element_id = ? ${mio ? 'AND k.assignee_id = ?' : ''}
         ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`);
      const { results: punch } = await (mio ? qp.bind(eid, user.id) : qp.bind(eid)).all();
      const lp = await photosFor(env, 'log', log.map((l) => l.id));
      const kp = await photosFor(env, 'punch', punch.map((k) => k.id));
      log.forEach((l) => (l.photos = lp[l.id] || []));
      punch.forEach((k) => (k.photos = kp[k.id] || []));
      const etapas = await catalogoEtapas(env);
      return json({ element, log, punch, etapas, hechas: (await etapasDe(env, [eid]))[eid] || [] });
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('El contratista no edita elementos.', 403);
      const b = await req.json();
      const codigo = b.code === undefined || b.code === null ? null : String(b.code).trim();
      return await conCodigoUnico(async () => {
        await env.DB.prepare(`UPDATE elements SET code = COALESCE(?, code), type = COALESCE(?, type), name = COALESCE(?, name), resp = COALESCE(?, resp), x = COALESCE(?, x), y = COALESCE(?, y) WHERE id = ?`)
          .bind(codigo, b.type ?? null, b.name ?? null, b.resp ?? null, b.x ?? null, b.y ?? null, eid).run();
        return json({ ok: true });
      }, codigo);
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM elements WHERE id = ?`).bind(eid).run();
      return json({ ok: true });
    }
    // Palomear o despalomear una etapa del proceso del ítem.
    if (seg[2] === 'etapas' && m === 'POST') {
      if (!isStaff(user)) return err('El avance del ítem lo lleva el supervisor.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const r = await marcaEtapa(env, user, eid, String(b.clave || ''), !!b.hecha);
      if (r.error) return err(r.error, 400);
      await apunta(env, b.op_id);
      return json({ ok: true });
    }
    // Entregar el ítem, o devolverlo a producción si se entregó por error. Es
    // la etapa que abre el punchlist, así que pasa por el mismo camino que las
    // demás: entregar da por cumplidas las anteriores —lo entregado se compró,
    // se fletó y se instaló— y devolverlo a producción las deja como estaban.
    if (seg[2] === 'fase' && m === 'POST') {
      if (!isStaff(user)) return err('Entregar un ítem es del supervisor.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const fase = b.fase === 'punchlist' ? 'punchlist' : 'produccion';
      const bisagra = (await catalogoEtapas(env)).find((x) => x.abre_punchlist);
      if (!bisagra) return err('no hay etapa de entrega configurada', 500);
      const r = await marcaEtapa(env, user, eid, bisagra.clave, fase === 'punchlist');
      if (r.error) return err(r.error, 400);
      await apunta(env, b.op_id);
      return json({ ok: true, fase });
    }
    if (seg[2] === 'log' && m === 'POST') {
      if (!isStaff(user)) return err('El contratista sube su evidencia en el pendiente que le toca, no en la bitácora.', 403);
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const text = String(fd.get('text') || '').trim();
      const files = fd.getAll('photos');
      if (!text && !files.length) return err('texto o foto requerido');
      const id = uid();
      const kind = ['trabajo', 'arreglo', 'acuerdo'].includes(fd.get('kind')) ? fd.get('kind') : 'trabajo';
      await env.DB.prepare(`INSERT INTO log_entries (id, element_id, user_id, kind, text) VALUES (?,?,?,?,?)`).bind(id, eid, user.id, kind, text).run();
      const photos = await savePhotos(env, user, 'log', id, files);
      await apunta(env, op);
      return json({ ok: true, id, photos });
    }
    if (seg[2] === 'punch' && m === 'POST') {
      if (!isStaff(user)) return err('Los pendientes los levanta el supervisor.', 403);
      const el = await env.DB.prepare(`SELECT fase FROM elements WHERE id = ?`).bind(eid).first();
      if (el && el.fase !== 'punchlist') {
        return err('Este ítem sigue en producción. Entrégalo y entonces se le levantan pendientes.', 409, { falta_entregar: true });
      }
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const title = String(fd.get('title') || '').trim();
      if (!title) return err('título requerido');
      // A quién le toca. Tiene que ser alguien que ya esté en esta obra: si no,
      // el pendiente le aparecería a alguien que no puede ni abrir el proyecto.
      let asignado = String(fd.get('assignee_id') || '') || null;
      if (asignado) {
        const ok = await env.DB.prepare(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`).bind(pid, asignado).first();
        if (!ok) return err('Esa persona no está dada de alta en esta obra.', 400);
      }
      const id = uid();
      await env.DB.prepare(`INSERT INTO punch_items (id, element_id, title, description, resp, due_date, created_by, assignee_id) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(id, eid, title, fd.get('description') || '', fd.get('resp') || '', fd.get('due_date') || null, user.id, asignado).run();
      const photos = await savePhotos(env, user, 'punch', id, fd.getAll('photos'));
      await apunta(env, op);
      return json({ ok: true, id, photos });
    }
  }

  // ----- dudas -----
  if (seg[0] === 'dudas' && seg[1]) {
    const d = await env.DB.prepare(`SELECT * FROM dudas WHERE id = ?`).bind(seg[1]).first();
    if (!d || !(await canAccessProject(env, user, d.project_id))) return err('sin acceso', 403);
    // Contesta quien dirige la obra, y también quien preguntó: media respuesta
    // casi siempre necesita una aclaración de vuelta.
    if (seg[2] === 'respuestas' && m === 'POST') {
      if (!isStaff(user) && d.user_id !== user.id) return err('Esta duda no es tuya.', 403);
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const texto = String(fd.get('texto') || '').trim();
      const files = fd.getAll('photos');
      if (!texto && !files.length) return err('Escribe la respuesta o manda una foto.');
      const id = uid();
      await env.DB.prepare(`INSERT INTO duda_respuestas (id, duda_id, user_id, texto) VALUES (?,?,?,?)`).bind(id, seg[1], user.id, texto).run();
      const photos = await savePhotos(env, user, 'duda_resp', id, files);
      await apunta(env, op);
      return json({ ok: true, id, photos });
    }
    // Dar por resuelta es del supervisor: quien pregunta no decide que ya le
    // contestaron bien, igual que en el punchlist cierra quien lo levantó.
    if (seg[2] === 'estado' && m === 'POST') {
      if (!isStaff(user)) return err('Cerrar una duda es del supervisor.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      if (b.estado === 'abierta') {
        await env.DB.prepare(`UPDATE dudas SET estado = 'abierta', resuelta_en = NULL, resuelta_por = NULL WHERE id = ?`).bind(seg[1]).run();
      } else {
        await env.DB.prepare(`UPDATE dudas SET estado = 'resuelta', resuelta_en = ?, resuelta_por = ? WHERE id = ?`).bind(now(), user.id, seg[1]).run();
      }
      await apunta(env, b.op_id);
      return json({ ok: true });
    }
  }

  // ----- punch items -----
  if (seg[0] === 'punch' && seg[1]) {
    const kid = seg[1];
    const pid = await projectOfPunch(env, kid);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (!seg[2] && m === 'PATCH') {
      // Editar el pendiente —título, fecha, a quién le toca— y darlo por
      // cerrado es del supervisor: quien pidió el arreglo es quien dice si
      // quedó bien. El contratista tiene su propia puerta, la de evidencia.
      if (!isStaff(user)) return err('Sube tu evidencia y márcalo terminado; cerrarlo lo hace el supervisor.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const st = ['pend', 'proc', 'ok'].includes(b.status) ? b.status : null;
      if (b.assignee_id !== undefined && b.assignee_id) {
        const ok = await env.DB.prepare(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`).bind(pid, b.assignee_id).first();
        if (!ok) return err('Esa persona no está dada de alta en esta obra.', 400);
      }
      await env.DB.prepare(
        `UPDATE punch_items SET title = COALESCE(?, title), description = COALESCE(?, description), resp = COALESCE(?, resp), due_date = COALESCE(?, due_date),
          assignee_id = COALESCE(?, assignee_id),
          status = COALESCE(?, status), done_at = CASE WHEN ? = 'ok' THEN ? WHEN ? IS NOT NULL THEN NULL ELSE done_at END, done_by = CASE WHEN ? = 'ok' THEN ? ELSE done_by END WHERE id = ?`
      ).bind(b.title ?? null, b.description ?? null, b.resp ?? null, b.due_date ?? null, b.assignee_id ?? null, st, st, now(), st, st, user.id, kid).run();
      await apunta(env, b.op_id);
      return json({ ok: true });
    }
    if (seg[2] === 'photos' && m === 'POST') {
      if (!(await leToca(env, user, kid))) return err('Este pendiente no trae tu nombre.', 403);
      const fd = await req.formData();
      const photos = await savePhotos(env, user, 'punch', kid, fd.getAll('photos'));
      return json({ ok: true, photos });
    }
    // Evidencia: lo único que el contratista puede empujar. Sube las fotos de
    // que ya lo arregló, deja su nota, y el pendiente pasa a "en proceso" para
    // que el supervisor lo revise. Cerrarlo no lo cierra él.
    if (seg[2] === 'evidencia' && m === 'POST') {
      if (!(await leToca(env, user, kid))) return err('Este pendiente no trae tu nombre.', 403);
      const k = await env.DB.prepare(`SELECT * FROM punch_items WHERE id = ?`).bind(kid).first();
      if (!k) return err('no encontrado', 404);
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const nota = String(fd.get('nota') || '').trim();
      const fotos = fd.getAll('photos').filter((f) => f instanceof File && f.size);
      if (!nota && !fotos.length) return err('Sube al menos una foto o escribe qué hiciste.');
      const photos = await savePhotos(env, user, 'punch', kid, fotos);
      // Queda escrito en la bitácora del elemento: quién, cuándo y qué dijo.
      // Así el supervisor lo ve sin tener que abrir pendiente por pendiente.
      await env.DB.prepare(`INSERT INTO log_entries (id, element_id, user_id, kind, text) VALUES (?,?,?,?,?)`)
        .bind(uid(), k.element_id, user.id, 'arreglo', `Terminado: ${k.title}${nota ? ` — ${nota}` : ''}`).run();
      if (k.status === 'pend') {
        await env.DB.prepare(`UPDATE punch_items SET status = 'proc' WHERE id = ?`).bind(kid).run();
      }
      await apunta(env, op);
      return json({ ok: true, photos, status: k.status === 'ok' ? 'ok' : 'proc' });
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM punch_items WHERE id = ?`).bind(kid).run();
      return json({ ok: true });
    }
  }

  // ----- photos -----
  if (seg[0] === 'photos' && seg[1] && m === 'DELETE') {
    const p = await env.DB.prepare(`SELECT * FROM photos WHERE id = ?`).bind(seg[1]).first();
    if (!p) return err('no encontrada', 404);
    if (!isStaff(user) && p.user_id !== user.id) return err('sin permiso', 403);
    await env.FILES.delete(p.r2_key);
    await env.DB.prepare(`DELETE FROM photos WHERE id = ?`).bind(seg[1]).run();
    return json({ ok: true });
  }

  return err('ruta no encontrada', 404);
}

function pubUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, company: u.company, tiene_pin: !!u.pin_hash };
}
