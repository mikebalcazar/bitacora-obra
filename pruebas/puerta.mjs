/* La puerta de quell101, probada en una mesa de trabajo.
 *
 * Desde el 19-sep este Worker no tiene base ni motor: es el cascarón que
 * sirve la pantalla y reenvía todo a la suite. Lo que se prueba aquí es lo
 * único que decide él: a QUÉ empresa le toca cada petición, qué le manda a la
 * suite y qué contesta sin preguntarle a nadie. Y sobre todo lo que NO debe
 * pasar: una petición sin sesión no viaja a ningún lado.
 *
 *   node pruebas/puerta.mjs
 */

import worker, { empresaDe } from '../worker/index.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

/* ─────────────── el mundo de mentiras ─────────────── */

// Quién es cada galleta para la suite. `null` = la suite dice que no.
const SUITE = {
  'duena': { usuario: { id: 'u1', correo: 'mike@forespot.com' }, superadmin: true, orgs: [{ id: 'otra', apps: [] }, { id: 'forespot', apps: [] }] },
  'supervisora': { usuario: { id: 'u2', correo: 'fer@forespot.com' }, superadmin: false, orgs: [{ id: 'forespot', rol: 'staff', apps: ['quell', 'peek'] }] },
  'todas-las-apps': { usuario: { id: 'u3', correo: 'goyo@ejemplo.mx' }, superadmin: false, orgs: [{ id: 'forespot', rol: 'staff', apps: [] }] },
  'de-otra-empresa': { usuario: { id: 'u6', correo: 'ajena@ejemplo.mx' }, superadmin: false, orgs: [{ id: 'muebles-lopez', rol: 'staff', apps: ['quell101'] }] },
  'dos-empresas': { usuario: { id: 'u8', correo: 'dos@ejemplo.mx' }, superadmin: false, orgs: [{ id: 'muebles-lopez', rol: 'staff', apps: ['quell'] }, { id: 'forespot', rol: 'staff', apps: ['quell'] }] },
  'sin-quell': { usuario: { id: 'u4', correo: 'solo-dash@ejemplo.mx' }, superadmin: false, orgs: [{ id: 'forespot', rol: 'socio', apps: ['dash'] }] },
  'cliente': { usuario: { id: 'u9', correo: 'cliente@ejemplo.mx' }, superadmin: false, orgs: [], acceso: { tipo: 'cliente', org_id: 'forespot', ref_id: 'c1' } },
};

let pedidas = [];
function mundo() {
  pedidas = [];
  return {
    APP_NAME: 'quell101',
    ORG_ID: 'forespot',
    API: {
      async fetch(req) {
        const u = new URL(req.url);
        pedidas.push({ ruta: u.pathname + u.search, app: req.headers.get('X-App'), metodo: req.method, sitio: req.headers.get('X-Sitio'), auth: req.headers.get('authorization') });
        if (u.pathname === '/yo') {
          const galleta = /(?:^|;\s*)s101=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
          const bearer = /^Bearer (.+)$/.exec(req.headers.get('authorization') || '')?.[1];
          const quien = SUITE[galleta ?? bearer ?? ''] ?? null;
          return quien
            ? new Response(JSON.stringify({ ok: true, data: quien }), { status: 200 })
            : new Response(JSON.stringify({ ok: false, error: 'sin_sesion' }), { status: 401 });
        }
        // El motor, del otro lado: contesta con la ruta que le llegó.
        return new Response(JSON.stringify({ eco: u.pathname, metodo: req.method, cuerpo: req.method === 'POST' ? await req.text() : null }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
    FILES: { async head() { return null; }, async get() { return null; } },
    ASSETS: { async fetch() { return new Response('el sitio', { status: 200 }); } },
  };
}
const pide = (env, quien, ruta, { metodo = 'GET', cuerpo = null, cabeceras = {} } = {}) =>
  worker.fetch(new Request(`https://bitacora-obra.mike-929.workers.dev${ruta}`, {
    method: metodo,
    headers: { ...(quien ? { Cookie: `s101=${quien}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...cabeceras },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }), env);
const lee = async (p) => { const r = await p; return { estado: r.status, cuerpo: await r.json().catch(() => ({})) }; };

/* ─────────────── a qué empresa le toca ─────────────── */
console.log('\n== de qué empresa es cada quien ==');
{
  const env = mundo();
  rev(empresaDe(SUITE.duena, env) === 'forespot', 'el dueño de la suite (miembro de todas) cae en la empresa de este sitio (ORG_ID)');
  rev(empresaDe(SUITE.supervisora, env) === 'forespot', 'una miembro con quell en su lista: su empresa');
  rev(empresaDe(SUITE['todas-las-apps'], env) === 'forespot', 'lista vacía quiere decir todas las apps');
  rev(empresaDe(SUITE['de-otra-empresa'], env) === 'muebles-lopez', 'alguien de otra empresa entra a la suya, aunque este sitio sea de forespot');
  rev(empresaDe(SUITE['dos-empresas'], env) === 'forespot', 'con dos empresas manda la de este sitio');
  rev(empresaDe(SUITE['sin-quell'], env) === null, 'sin quell en la lista no hay empresa a la que tocar');
  rev(empresaDe(SUITE.cliente, env) === 'forespot', 'el cliente va a la empresa de su acceso');
  rev(empresaDe(null, env) === null, 'sin sesión no hay empresa');
}

/* ─────────────── lo que viaja y lo que no ─────────────── */
console.log('\n== la puerta ==');
{
  let env = mundo();
  const sin = await lee(pide(env, null, '/api/me'));
  rev(sin.estado === 401, 'sin sesión, /api/me contesta 401', String(sin.estado));
  rev(pedidas.length === 0, 'y no le pregunta nada a la suite (sin galleta ni token no hay a quién)');

  env = mundo();
  const nadie = await lee(pide(env, 'inventada', '/api/me'));
  rev(nadie.estado === 401 && pedidas.length === 1 && pedidas[0].ruta === '/yo', 'con una galleta que la suite no reconoce: 401, y sólo se preguntó /yo');

  env = mundo();
  const fer = await lee(pide(env, 'supervisora', '/api/projects/abc?x=1'));
  rev(fer.estado === 200 && fer.cuerpo.eco === '/orgs/forespot/quell/projects/abc', 'una miembro: /api/… viaja a /orgs/forespot/quell/…', fer.cuerpo.eco);
  rev(pedidas[1]?.ruta === '/orgs/forespot/quell/projects/abc?x=1' && pedidas[1].app === 'quell101', 'con la consulta intacta y X-App puesto por el Worker', pedidas[1]?.ruta);
  rev(pedidas[1]?.sitio === 'https://bitacora-obra.mike-929.workers.dev', 'y le dice al motor dónde vive el sitio, para las ligas de los correos', pedidas[1]?.sitio);

  env = mundo();
  const post = await lee(pide(env, 'supervisora', '/api/projects', { metodo: 'POST', cuerpo: { name: 'Obra' } }));
  rev(post.cuerpo.metodo === 'POST' && post.cuerpo.cuerpo === '{"name":"Obra"}', 'un POST viaja con su método y su cuerpo');

  env = mundo();
  const ajena = await lee(pide(env, 'de-otra-empresa', '/api/me'));
  rev(ajena.cuerpo.eco === '/orgs/muebles-lopez/quell/me', 'alguien de otra empresa toca la puerta de SU empresa', ajena.cuerpo.eco);

  env = mundo();
  const sinQuell = await lee(pide(env, 'sin-quell', '/api/me'));
  rev(sinQuell.estado === 401 && pedidas.length === 1, 'sin quell en su lista: 401 aquí mismo, sin molestar al motor');

  env = mundo();
  const cli = await lee(pide(env, 'cliente', '/api/projects'));
  rev(cli.cuerpo.eco === '/orgs/forespot/quell/projects', 'el cliente va a la empresa de su acceso', cli.cuerpo.eco);

  env = mundo();
  const foto = await lee(pide(env, null, '/files/orgs/forespot/quell/plans/p/x.png?t=todas-las-apps'));
  rev(foto.cuerpo.eco === '/orgs/forespot/quell/files/orgs/forespot/quell/plans/p/x.png', 'un archivo con el token en la dirección (app empacada) viaja a /files de la suite', foto.cuerpo.eco);
  rev(pedidas[1]?.auth === 'Bearer todas-las-apps' && !pedidas[1].ruta.includes('t='), 'el token va como Authorization y no se queda en la dirección');

  env = mundo();
  const fotoSin = await lee(pide(env, null, '/files/loquesea?t=inventado'));
  rev(fotoSin.estado === 401, 'un archivo con un token inventado: 401', String(fotoSin.estado));

  env = mundo();
  const salud = await lee(pide(env, null, '/api/salud'));
  rev(salud.estado === 200 && salud.cuerpo.app === 'quell101' && salud.cuerpo.datos === 'suite' && pedidas.length === 0, '/api/salud contesta aquí, sin sesión y sin tocar la suite');
  const apps = await lee(pide(env, null, '/api/apps'));
  rev(apps.estado === 200 && pedidas.length === 0, '/api/apps también');
  const vieja = await lee(pide(env, null, '/api/auth/pin', { metodo: 'POST', cuerpo: { email: 'x', pin: '1' } }));
  rev(vieja.estado === 410 && vieja.cuerpo.error === 'esta_puerta_se_cerro', 'la puerta vieja sigue diciendo 410 con palabras');

  env = mundo();
  const suite = await lee(pide(env, null, '/s101/salud'));
  rev(pedidas[0]?.ruta === '/salud' && pedidas[0].app === 'quell101', '/s101/* se reenvía tal cual a la suite con X-App', pedidas[0]?.ruta);

  /* Los «ítems sin ubicar» son de la empresa, no del motor de obra: la cuenta
   * la hace la suite en /orgs/:o/obras/:id/sin-ubicar (contrato 0.24.0). Lo
   * que este Worker decide es a dónde va, y eso es lo que se mide: que NO
   * lleve el prefijo `/quell` —si lo llevara, la suite contestaría 404 y la
   * pantalla se quedaría siempre sin lista, en silencio—. */
  env = mundo();
  await lee(pide(env, 'supervisora', '/api/projects/OBRA-1/sin-ubicar'));
  rev(pedidas[1]?.ruta === '/orgs/forespot/obras/OBRA-1/sin-ubicar',
      'los ítems sin ubicar van a /obras/:id/sin-ubicar, sin pasar por /quell', pedidas[1]?.ruta);

  env = mundo();
  await lee(pide(env, 'supervisora', '/api/projects/OBRA-1/punch'));
  rev(pedidas[1]?.ruta === '/orgs/forespot/quell/projects/OBRA-1/punch',
      'y lo demás de la obra sigue yendo al motor, con /quell', pedidas[1]?.ruta);

  env = mundo();
  const sinSesion = await lee(pide(env, null, '/api/projects/OBRA-1/sin-ubicar'));
  rev(sinSesion.estado === 401, 'sin sesión no viaja a ningún lado', String(sinSesion.estado));

  env = mundo();
  const sitio = await pide(env, null, '/una/pantalla');
  rev(sitio.status === 200 && (await sitio.text()) === 'el sitio', 'lo demás es el sitio');
}

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
