/* La puerta recuerda la empresa de cada sesión (16-oct-2026).
 *
 * Medido en staging: cada pedido de quell preguntaba primero a la suite
 * «¿quién es?» (/yo, ~0.7 s) sólo para saber a qué empresa tocar. Ahora la
 * empresa se recuerda 5 minutos por sesión. Lo que se prueba aquí es que eso
 * no abra nada: la suite sigue revisando cada pedido, y si dice que no, la
 * puerta olvida y vuelve a preguntar.
 *
 *   node pruebas/la-puerta-recuerda.mjs
 */
import worker, { olvidaEmpresas } from '../worker/index.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

// La suite de mentiras: quién es cada galleta y en qué empresas puede entrar.
let SUITE, PERMISO;
let pedidas = [];
const env = {
  APP_NAME: 'quell101', ORG_ID: 'forespot',
  API: {
    async fetch(req) {
      const u = new URL(req.url);
      const galleta = /(?:^|;\s*)s101=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1] ?? '';
      pedidas.push(u.pathname);
      if (u.pathname === '/yo') {
        const quien = SUITE[galleta];
        return quien ? new Response(JSON.stringify({ ok: true, data: quien })) : new Response('{}', { status: 401 });
      }
      // El motor revisa por su cuenta: sesión viva y empresa permitida.
      const org = u.pathname.split('/')[2];
      if (!SUITE[galleta]) return new Response('{}', { status: 401 });
      if (!PERMISO[galleta]?.includes(org)) return new Response('{}', { status: 403 });
      return new Response(JSON.stringify({ org, cuerpo: req.method === 'POST' ? await req.text() : null }));
    },
  },
  FILES: { async head() { return null; } },
  ASSETS: { async fetch() { return new Response('el sitio'); } },
};
const pide = async (galleta, ruta, { metodo = 'GET', cuerpo = null } = {}) => {
  pedidas = [];
  const r = await worker.fetch(new Request(`https://quell.suite101.app${ruta}`, {
    method: metodo, headers: { cookie: `s101=${galleta}`, ...(cuerpo ? { 'content-type': 'application/json' } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : null,
  }), env);
  return { estado: r.status, json: await r.json().catch(() => null), pedidas: [...pedidas] };
};
const fer = { usuario: { id: 'u2' }, orgs: [{ id: 'forespot', apps: ['quell'] }] };

olvidaEmpresas();
SUITE = { fer }; PERMISO = { fer: ['forespot'] };

console.log('· la primera vez pregunta; las siguientes, no');
let r = await pide('fer', '/api/me');
rev(r.estado === 200 && r.pedidas.join(' ') === '/yo /orgs/forespot/quell/me', 'la primera: /yo y luego el motor', r.pedidas.join(' '));
r = await pide('fer', '/api/projects/abc');
rev(r.estado === 200 && r.pedidas.join(' ') === '/orgs/forespot/quell/projects/abc', 'la segunda va directo al motor, sin /yo', r.pedidas.join(' '));
r = await pide('fer', '/api/projects', { metodo: 'POST', cuerpo: { name: 'Obra' } });
rev(r.estado === 200 && r.json?.cuerpo === '{"name":"Obra"}', 'un POST también, con su cuerpo entero');

console.log('· otra sesión no hereda nada');
SUITE.otra = { usuario: { id: 'u7' }, orgs: [{ id: 'muebles-lopez', apps: ['quell'] }] }; PERMISO.otra = ['muebles-lopez'];
r = await pide('otra', '/api/me');
rev(r.pedidas[0] === '/yo' && r.json?.org === 'muebles-lopez', 'una galleta distinta pregunta por su cuenta y va a su empresa', r.pedidas.join(' '));
r = await pide('inventada', '/api/me');
rev(r.estado === 401 && r.pedidas.join(' ') === '/yo', 'una galleta que la suite no conoce: 401 y nada más');

console.log('· si la suite dice que no, se olvida y se vuelve a preguntar');
delete SUITE.fer;                                     // cerró sesión / la sesión venció
r = await pide('fer', '/api/me');
rev(r.estado === 401, 'sesión vencida: 401, aunque la empresa estuviera recordada', String(r.estado));
rev(r.pedidas.join(' ') === '/orgs/forespot/quell/me /yo', 'el motor dijo que no, y se volvió a preguntar', r.pedidas.join(' '));
SUITE.fer = fer;
r = await pide('fer', '/api/me');
rev(r.pedidas[0] === '/yo', 'y ya no se usa la recordada', r.pedidas.join(' '));
// La cambiaron de empresa: el motor contesta 403 en la vieja, la puerta pregunta y va a la nueva.
SUITE.fer = { usuario: { id: 'u2' }, orgs: [{ id: 'muebles-lopez', apps: ['quell'] }] }; PERMISO.fer = ['muebles-lopez'];
r = await pide('fer', '/api/me');
rev(r.estado === 200 && r.json?.org === 'muebles-lopez', 'cambió de empresa: 403 en la vieja, pregunta y entra a la nueva', r.pedidas.join(' '));
// Le quitaron quell: la suite ya no le da empresa → 401 y no se reintenta más.
SUITE.fer = { usuario: { id: 'u2' }, orgs: [{ id: 'muebles-lopez', apps: ['dash'] }] }; PERMISO.fer = [];   // la suite también le cierra quell (app_no_permitida)
r = await pide('fer', '/api/me');
rev(r.estado === 401 || r.estado === 403, 'le quitaron quell: no entra', String(r.estado));
rev(r.pedidas.filter((x) => x === '/yo').length === 1, 'y se preguntó una sola vez', r.pedidas.join(' '));

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
