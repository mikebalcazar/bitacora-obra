// quell101 — el Worker: sirve la pantalla y reenvía todo a la suite.
//
// DESDE EL 19-SEP-2026 AQUÍ NO HAY BASE. Mike decidió que todo lo de una
// empresa viva en su base de la suite, y quell101 fue la primera app en
// mudarse: sus tablas están en la base por empresa de suite101-api (migración
// 0006, prefijo `quell_`) y su motor —el mismo código que corría aquí, con sus
// mismas reglas— corre dentro de la API, en `/orgs/{empresa}/quell/*`.
//
// Lo que queda en este Worker es el cascarón:
//   · la pantalla (web/dist) y los instaladores (/descargas/*, del bucket);
//   · /s101/*  → la suite, por el enlace de servicio, con X-App puesto aquí;
//   · /api/*   → la suite, a `/orgs/{empresa}/quell/…`, con la empresa resuelta
//                de la sesión (la suite dice quién es y de qué empresa);
//   · /files/* → los planos y las fotos, que la suite sirve de su bucket.
//
// Bindings: API (service binding a suite101-api), FILES (R2, sólo instaladores),
// ASSETS (el sitio). Vars: APP_NAME, ORG_ID (la empresa por omisión).

const JSON_H = { 'content-type': 'application/json; charset=utf-8' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSON_H, ...extra } });
const err = (msg, status = 400) => json({ error: msg }, status);
const now = () => new Date().toISOString();

// La puerta de la suite. quell101 le habla a `suite101-api` desde su mismo
// origen, por `/s101/*`, con un *service binding*: una llamada de Worker a
// Worker que nunca sale a internet. El Worker pone `X-App`; la interfaz no lo
// manda, y si lo manda se sobrescribe: la app no decide quién dice ser.
const PREFIJO_SUITE = '/s101';
const APP = 'quell101';
// Con la que la suite guarda la lista de apps de cada persona (`miembros.apps`
// lleva llaves cortas: `quell`, `dash`…). NO es el nombre de la app.
const LLAVE = 'quell';

// En las apps empaquetadas la cookie no viaja —otro origen— y una etiqueta de
// imagen no puede mandar encabezados, así que para los archivos el token
// también se acepta en la dirección. Solo para eso.
const tokenEnDireccion = (url) => (url.pathname.startsWith('/files/') ? url.searchParams.get('t') : null);

/** Las cabeceras con las que la suite sabe quién viene: la cookie del sitio o
 *  el token de una app empacada (también si viene en la dirección). */
function credenciales(req, url) {
  const h = new Headers({ 'X-App': APP });
  const galleta = req.headers.get('cookie');
  const llevada = req.headers.get('authorization') || (tokenEnDireccion(url) ? `Bearer ${tokenEnDireccion(url)}` : null);
  if (galleta) h.set('cookie', galleta);
  if (llevada) h.set('authorization', llevada);
  return h;
}

/** Le pregunta a la suite quién viene. Devuelve lo que contesta `/yo` o null. */
async function laSuiteDiceQuien(req, env, url) {
  if (!env.API) return null;
  const h = credenciales(req, url);
  if (!h.has('cookie') && !h.has('authorization')) return null;
  const r = await env.API.fetch(new Request('https://suite101-api/yo', { headers: h }));
  if (!r.ok) return null;
  const cuerpo = await r.json().catch(() => null);
  return cuerpo?.data || null;
}

/** ¿La suite le abre quell101 en esta empresa? Lista vacía = todas las apps. */
const abre = (o) => !o.apps?.length || o.apps.includes(LLAVE) || o.apps.includes(APP);

/** De qué empresa es la petición.
 *
 *  Un cliente del taller entra con su acceso de cliente, que dice de qué
 *  empresa es. Los demás son miembros: si están en la empresa por omisión
 *  (ORG_ID: la de este sitio), ésa; si no, la primera de las suyas que tenga
 *  quell101 prendido. El dueño de la suite es miembro de todas, así que para
 *  él manda ORG_ID. La suite vuelve a revisar todo esto del otro lado: aquí
 *  sólo se escoge a qué puerta tocar. */
export function empresaDe(yo, env) {
  if (!yo) return null;
  if (yo.acceso?.tipo === 'cliente') return yo.acceso.org_id || null;
  const mias = (yo.orgs || []).filter(abre);
  const porOmision = env.ORG_ID && mias.find((o) => o.id === env.ORG_ID);
  return (porOmision || mias[0])?.id || null;
}

/** /api/* y /files/* → la suite, a /orgs/{empresa}/quell/… */
async function aLaSuite(req, env, url, ruta, prefijo = '/quell') {
  if (!env.API) return err('La puerta de la suite no está conectada.', 503);
  const yo = await laSuiteDiceQuien(req, env, url);
  if (!yo) return err('no autorizado', 401);
  const empresa = empresaDe(yo, env);
  if (!empresa) return err('no autorizado', 401);
  const destino = new URL(`https://suite101-api/orgs/${encodeURIComponent(empresa)}${prefijo}${ruta}`);
  destino.search = url.search;
  destino.searchParams.delete('t');
  const h = credenciales(req, url);
  for (const nombre of ['content-type', 'content-length', 'if-none-match']) {
    const v = req.headers.get(nombre);
    if (v) h.set(nombre, v);
  }
  // Para las ligas de los correos que manda el motor (invitaciones, avisos).
  h.set('X-Sitio', url.origin);
  // El cuerpo se lee entero antes de reenviarlo (un plano son unos MB; cabe):
  // así el enlace de servicio no se queda con un flujo a medias si la suite
  // contesta antes de leerlo todo.
  const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? null : await req.arrayBuffer();
  return env.API.fetch(new Request(destino.toString(), { method: req.method, headers: h, body: cuerpo }));
}

// ---------- CORS ----------
// Las apps empacadas (Android, Windows) viven en otro origen y hablan con
// este Worker por internet. Sólo esos orígenes reciben permiso.
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
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
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
      else if (path.startsWith('/files/')) r = await aLaSuite(req, env, url, `/files/${path.slice(7)}`);
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
// Es lo único que queda en el bucket de quell101: los planos y las fotos ya
// viven en el de la suite.
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

async function api(req, env, url, path) {
  const m = req.method;
  const seg = path.slice(5).split('/').filter(Boolean); // después de /api/

  // Señal de vida, sin sesión: la usa el despliegue para comprobar que el
  // Worker quedó arriba antes de dar por buena la publicación.
  if (seg[0] === 'salud' && m === 'GET') return json({ ok: true, app: env.APP_NAME || 'quell101', hora: now(), datos: 'suite' });

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

  /* La puerta vieja se cerró el 16-sep (Mike): el APK y la app de Windows ya
   * instaladas llevan adentro la pantalla anterior y entraban por aquí. Se
   * contesta 410 y no 404 a propósito: «existía y se fue», con el texto que
   * dice a dónde ir. Un 404 es lo que contestaría un servidor roto. */
  if (seg[0] === 'auth') {
    return json({
      error: 'esta_puerta_se_cerro',
      mensaje: 'La bitácora ya no tiene entrada propia: se entra con la cuenta de la suite 101, '
             + 'desde el sitio. Si estás usando la aplicación instalada de Android o de Windows, '
             + 'abre la bitácora en el navegador mientras se rearman.',
      donde: new URL('/', url).toString(),
    }, 410);
  }

  /* Los «ítems sin ubicar» NO son del motor de obra.
   *
   * Mike, 20-sep: «cuando se genera un nuevo proyecto con su cantidad de
   * ítems, en quell […] deben de aparecer en una lista de "ítems sin ubicar".
   * Para ir seleccionando y ubicando cada ítem en su lugar.»
   *
   * Eso son los ítems VENDIDOS del proyecto de dash101 ligado a esta obra, y
   * los cuenta la suite en `/orgs/:o/obras/:id/sin-ubicar` (contrato 0.24.0):
   * cantidad menos las piezas que ya tienen pin en un plano. La cuenta la
   * hace allá a propósito —dos personas ubicando a la vez, cada una con su
   * cuenta, acaban con 21 puertas de un ítem de 20—.
   *
   * Se expone aquí bajo `projects` para que la pantalla siga hablando como
   * habla, y va sin el prefijo `/quell` porque la ruta es de la empresa, no
   * del motor. Contesta envuelto —`{ok, data}`, como toda la suite—, a
   * diferencia del motor, que contesta pelón. */
  if (seg[0] === 'projects' && seg[1] && seg[2] === 'sin-ubicar' && !seg[3] && m === 'GET') {
    return aLaSuite(req, env, url, `/obras/${encodeURIComponent(seg[1])}/sin-ubicar`, '');
  }

  // Todo lo demás es del motor, que vive en la suite.
  return aLaSuite(req, env, url, `/${seg.join('/')}`);
}
