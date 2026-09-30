// La dirección de workers.dev manda al dominio propio; el dominio, las apps
// empacadas (/api, /files, /descargas) y staging siguen igual.
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response(JSON.stringify({ ok: true, data: null }), { headers: { 'content-type': 'application/json' } }) };
const FILES = { get: async () => null, head: async () => null };
const prod = { DOMINIO_PROPIO: 'quell101.taller101.com', APP_NAME: 'quell101', ORG_ID: 'forespot', ASSETS, API, FILES };
const staging = { APP_NAME: 'quell101', ORG_ID: 'demo', ASSETS, API, FILES };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env);

let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); console.log('  ok   ', m); };

let r = await pide('https://bitacora-obra.mike-929.workers.dev/?x=1', prod);
ok(r.status === 301, 'una lectura de la pantalla en workers.dev manda al dominio con 301');
ok(r.headers.get('location') === 'https://quell101.taller101.com/?x=1', 'y conserva ruta y consulta');
r = await pide('https://bitacora-obra.mike-929.workers.dev/assets/app.js', prod);
ok(r.status === 301, 'los archivos de la pantalla también');
r = await pide('https://quell101.taller101.com/', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'en el dominio se sirve la pantalla');
r = await pide('https://bitacora-obra.mike-929.workers.dev/api/salud', prod);
ok(r.status === 200, '/api/* en workers.dev sigue contestando (apps empacadas)');
r = await pide('https://bitacora-obra.mike-929.workers.dev/files/x.png?t=abc', prod);
ok(r.status !== 301, '/files/* tampoco rebota');
r = await pide('https://bitacora-obra.mike-929.workers.dev/descargas/android.apk', prod);
ok(r.status !== 301, '/descargas/* tampoco');
r = await pide('https://bitacora-obra.mike-929.workers.dev/s101/yo', prod);
ok(r.status === 200, 'la puerta a la suite no se redirige');
r = await pide('https://bitacora-obra.mike-929.workers.dev/api/items', prod, { method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } });
ok(r.status === 204, 'el preflight de las apps empacadas sigue en 204');
r = await pide('https://bitacora-obra.mike-929.workers.dev/sw.js', prod);
ok(r.status === 200, '/sw.js en workers.dev NO rebota: un service worker no acepta llegar por redirección');
const sw = await r.text();
ok(/registration\.unregister\(\)/.test(sw) && /caches\.delete/.test(sw), 'y lo que contesta se da de baja y borra sus cachés');
ok(/navigate\('https:\/\/quell101\.taller101\.com'/.test(sw), 'y manda cada ventana abierta al dominio');
ok(r.headers.get('cache-control') === 'no-store', 'sin caché');
r = await pide('https://quell101.taller101.com/sw.js', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'en el dominio /sw.js es el de siempre');
r = await pide('https://bitacora-obra-staging.mike-929.workers.dev/sw.js', staging);
ok(r.status === 200 && await r.text() === 'sitio', 'y en staging también');
r = await pide('https://bitacora-obra-staging.mike-929.workers.dev/', staging);
ok(r.status === 200 && await r.text() === 'sitio', 'staging, sin DOMINIO_PROPIO, sirve tal cual');
// Sin la «s» (Mike, 30-sep-2026): http en el dominio propio manda a https.
r = await pide('http://quell101.taller101.com/?x=1', prod);
ok(r.status === 301 && r.headers.get('location') === 'https://quell101.taller101.com/?x=1', 'http en el dominio propio manda a https con 301, con ruta y consulta');
r = await pide('http://quell101.taller101.com/', prod, { method: 'POST' });
ok(r.status !== 301, 'pero un POST por http no se convierte en GET');
r = await pide('http://bitacora-obra-staging.mike-929.workers.dev/', staging);
ok(r.status !== 301, 'y sin DOMINIO_PROPIO no se toca');
console.log(`${n} revisadas · 0 fallas`);
