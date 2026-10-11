// La dirección de workers.dev manda al dominio propio; el dominio, las apps
// empacadas (/api, /files, /descargas) y staging siguen igual. Desde el
// 11-oct-2026 el dominio propio es quell.suite101.app y el de antes
// (quell101.taller101.com, DOMINIO_ANTERIOR) también manda aquí.
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response(JSON.stringify({ ok: true, data: null }), { headers: { 'content-type': 'application/json' } }) };
const FILES = { get: async () => null, head: async () => null };
const prod = { DOMINIO_PROPIO: 'quell.suite101.app', DOMINIO_ANTERIOR: 'quell101.taller101.com', APP_NAME: 'quell101', ORG_ID: 'forespot', ASSETS, API, FILES };
const staging = { APP_NAME: 'quell101', ORG_ID: 'demo', ASSETS, API, FILES };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env);

let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); console.log('  ok   ', m); };

let r = await pide('https://bitacora-obra.mike-929.workers.dev/?x=1', prod);
ok(r.status === 301, 'una lectura de la pantalla en workers.dev manda al dominio con 301');
ok(r.headers.get('location') === 'https://quell.suite101.app/?x=1', 'y conserva ruta y consulta');
r = await pide('https://bitacora-obra.mike-929.workers.dev/assets/app.js', prod);
ok(r.status === 301, 'los archivos de la pantalla también');
r = await pide('https://quell.suite101.app/', prod);
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
ok(/navigate\('https:\/\/quell\.suite101\.app'/.test(sw), 'y manda cada ventana abierta al dominio');
ok(r.headers.get('cache-control') === 'no-store', 'sin caché');
r = await pide('https://quell.suite101.app/sw.js', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'en el dominio /sw.js es el de siempre');
r = await pide('https://bitacora-obra-staging.mike-929.workers.dev/sw.js', staging);
ok(r.status === 200 && await r.text() === 'sitio', 'y en staging también');
r = await pide('https://bitacora-obra-staging.mike-929.workers.dev/', staging);
ok(r.status === 200 && await r.text() === 'sitio', 'staging, sin DOMINIO_PROPIO, sirve tal cual');
// Sin la «s» (Mike, 30-sep-2026): http en el dominio propio manda a https.
r = await pide('http://quell.suite101.app/?x=1', prod);
ok(r.status === 301 && r.headers.get('location') === 'https://quell.suite101.app/?x=1', 'http en el dominio propio manda a https con 301, con ruta y consulta');
r = await pide('http://quell.suite101.app/', prod, { method: 'POST' });
ok(r.status !== 301, 'pero un POST por http no se convierte en GET');
r = await pide('http://bitacora-obra-staging.mike-929.workers.dev/', staging);
ok(r.status !== 301, 'y sin DOMINIO_PROPIO no se toca');
// 11-oct-2026 · la dirección de antes (quell101.taller101.com) manda al dominio nuevo.
console.log('· la dirección de antes');
r = await pide('https://quell101.taller101.com/obra/7?x=1&y=2', prod);
ok(r.status === 301 && r.headers.get('location') === 'https://quell.suite101.app/obra/7?x=1&y=2', 'la de antes manda al dominio nuevo con 301, con ruta y consulta');
r = await pide('http://quell101.taller101.com/?x=1', prod);
ok(r.status === 301 && r.headers.get('location') === 'https://quell.suite101.app/?x=1', 'y por http, derecho al https del nuevo');
r = await pide('https://quell101.taller101.com/', prod, { method: 'HEAD' });
ok(r.status === 301, 'HEAD también');
r = await pide('https://quell101.taller101.com/s101/yo', prod);
ok(r.status === 200, '/s101/* desde la de antes NO se redirige');
r = await pide('https://quell101.taller101.com/s101', prod);
ok(r.status !== 301, 'ni /s101 pelón');
r = await pide('https://quell101.taller101.com/', prod, { method: 'POST' });
ok(r.status !== 301, 'un POST en la de antes no se redirige');
r = await pide('https://quell101.taller101.com/api/salud', prod);
ok(r.status === 200, '/api/* en la de antes sigue contestando (pantallas ya abiertas)');
r = await pide('https://quell101.taller101.com/sw.js', prod);
ok(r.status === 200 && /navigate\('https:\/\/quell\.suite101\.app'/.test(await r.text()), '/sw.js en la de antes es el que se da de baja y manda al nuevo');
r = await pide('https://quell101.taller101.com/.well-known/assetlinks.json', prod);
ok(r.status === 200 && /mx\.forespot\.bitacoraobra/.test(await r.text()), 'assetlinks.json contesta en la de antes, sin rebote (Android no sigue redirecciones)');
r = await pide('https://quell101.taller101.com/app/entrar?entrada=B1', prod);
ok(r.status === 200 && (await r.text()).includes('intent://quell101.taller101.com/app/entrar?entrada=B1'), 'la vuelta de Google de las apps ya instaladas contesta en la de antes');
r = await pide('https://quell.acme.com/obra/7?x=1', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'un host de empresa (quell.acme.com) no se redirige');
r = await pide('https://quell101.acme.com.mx/', prod);
ok(r.status === 200, 'ni uno con el nombre de antes (quell101.acme.com.mx)');
r = await pide('https://quell101.taller101.com.evil.com/', prod);
ok(r.status === 200, 'ni uno que sólo se le parece');
const lista = { ...prod, DOMINIO_ANTERIOR: ' otro.taller101.com , quell101.taller101.com ' };
r = await pide('https://otro.taller101.com/a?b=1', lista);
ok(r.status === 301 && r.headers.get('location') === 'https://quell.suite101.app/a?b=1', 'DOMINIO_ANTERIOR acepta una lista separada por comas');
r = await pide('https://quell101.taller101.com/', lista);
ok(r.status === 301, 'y cada una de la lista manda');
r = await pide('https://quell101.taller101.com/', { ...prod, DOMINIO_ANTERIOR: undefined });
ok(r.status === 200, 'sin DOMINIO_ANTERIOR la de antes se sirve tal cual');
console.log(`${n} revisadas · 0 fallas`);
