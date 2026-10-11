/* La app de Android: Google adentro de la app y el aviso de versión nueva
 * (Mike, 9-oct-2026).
 *
 * «Si le pido "entrar con google" me manda al browser y abre la aplicación en
 * el browser, no en la app. Debería validar el usuario de google dentro de la
 * misma app» y «necesito también que el app tenga un aviso automático de
 * cuando hay una nueva versión para que se actualice sola».
 *
 * Se mide el Worker (assetlinks, la vuelta en el navegador, android.json) y el
 * fuente de la pantalla y del armado. El recorrido en un navegador con un
 * Android de mentira se corrió aparte (ver el PR).
 *
 *   node pruebas/la-app-de-android.mjs
 */
import { readFileSync } from 'node:fs';
import worker, { HUELLA_LLAVE_ANDROID, PAQUETE_ANDROID } from '../worker/index.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response('{}') };
const guardado = { 'apps/android.json': '{"version":57,"fecha":"2026-10-09T16:00:00Z"}' };
const FILES = { get: async (k) => (guardado[k] ? { body: guardado[k], size: guardado[k].length } : null) };
const prod = { DOMINIO_PROPIO: 'quell.suite101.app', DOMINIO_ANTERIOR: 'quell101.taller101.com', APP_NAME: 'quell101', ORG_ID: 'forespot', ASSETS, API, FILES };
const pide = (url, init) => worker.fetch(new Request(url, init), prod);

console.log('· Android reconoce el dominio como de la app');
let r = await pide('https://quell.suite101.app/.well-known/assetlinks.json');
const ligas = await r.json();
rev(r.status === 200 && /application\/json/.test(r.headers.get('content-type')), 'assetlinks.json contesta JSON');
rev(ligas[0]?.target?.package_name === PAQUETE_ANDROID && PAQUETE_ANDROID === JSON.parse(readFileSync('capacitor.config.json', 'utf8')).appId,
  'con el paquete de la app', PAQUETE_ANDROID);
rev(ligas[0]?.relation?.includes('delegate_permission/common.handle_all_urls'), 'y el permiso de abrir sus ligas');
rev(ligas[0]?.target?.sha256_cert_fingerprints?.[0] === HUELLA_LLAVE_ANDROID
  && HUELLA_LLAVE_ANDROID.replace(/:/g, '').toLowerCase() === '844cafea1fa644fc1b7d47e180d2fecafdb726f6ae351eaab5f4534ab371e9e4',
  'y la huella de la llave fija (quell101-llaves)');

r = await pide('https://quell101.taller101.com/.well-known/assetlinks.json');
rev(r.status === 200 && (await r.json())[0]?.target?.package_name === PAQUETE_ANDROID, 'y también en la dirección de antes, sin rebote (la que traen las apps ya instaladas)');

console.log('· si la vuelta de Google cae en un navegador');
r = await pide('https://quell.suite101.app/app/entrar?entrada=BOLETO-1');
const html = await r.text();
rev(r.status === 200 && /text\/html/.test(r.headers.get('content-type')), 'contesta una página, no la app');
rev(html.includes(`intent://quell.suite101.app/app/entrar?entrada=BOLETO-1#Intent;scheme=https;package=${PAQUETE_ANDROID};end`),
  'con un botón que abre la app con el mismo boleto');
rev(html.includes('href="/?entrada=BOLETO-1"'), 'y otro para seguir en el navegador');
rev(r.headers.get('cache-control') === 'no-store', 'sin caché: el boleto es de un solo uso');
r = await pide('https://quell.suite101.app/app/entrar?entrada=%22%3E%3Cscript%3E');
rev(!(await r.text()).includes('"><script>'), 'lo que venga en la dirección no se cuela como HTML');

console.log('· el número de la versión publicada');
r = await pide('https://bitacora-obra.mike-929.workers.dev/descargas/android.json', { headers: { origin: 'http://localhost' } });
rev(r.status === 200 && (await r.json()).version === 57, '/descargas/android.json contesta en workers.dev (donde le habla la app)');
rev(!r.headers.get('content-disposition'), 'en línea, no como descarga');

console.log('· la pantalla');
const nativo = readFileSync('web/src/nativo.js', 'utf8');
const suite = readFileSync('web/src/suite.js', 'utf8');
const vn = readFileSync('web/src/VersionNueva.jsx', 'utf8');
rev(/VUELTA_GOOGLE = 'https:\/\/quell101\.taller101\.com\/app\/entrar'/.test(nativo), 'la vuelta de Google sigue en la dirección que reclaman TODAS las apps instaladas (la de antes)');
const ligasPy = readFileSync('apps/android/ligas.py', 'utf8');
rev(ligasPy.includes('android:host="quell.suite101.app" android:pathPrefix="/app/entrar"') && ligasPy.includes('android:host="quell101.taller101.com" android:pathPrefix="/app/entrar"'),
  'el manifiesto reclama la vuelta en el dominio nuevo y en el de antes (apps ya instaladas)');
rev(/esAndroid\(\) && Browser/.test(suite) && /Browser\.open\(\{ url: `\$\{BASE\}\/s101\/auth\/google\?volver_a=\$\{encodeURIComponent\(VUELTA_GOOGLE\)\}` \}\)/.test(suite),
  'en Android, Google se abre encima de la app (Browser) y vuelve a ella');
rev(/addListener\('appUrlOpen'/.test(nativo) && /getLaunchUrl/.test(nativo) && /location\.replace\(`\$\{location\.pathname\}\?entrada=/.test(nativo),
  'al volver, la app recarga con el boleto (abierta o recién abierta)');
rev(/escucharVueltaDeGoogle\(\);/.test(readFileSync('web/src/main.jsx', 'utf8')), 'y lo escucha desde que arranca');
rev(/VITE_VERSION_ANDROID/.test(vn) && /\/descargas\/android\.json/.test(vn) && /v > ARMADO/.test(vn), 'el aviso compara su número con el publicado');
rev(/data-version-nueva="apk"/.test(vn) && /\/descargas\/android\.apk/.test(vn), 'y su botón baja la app nueva');
rev(/<Login onLogin=\{\(u\) => setUser\(u\)\} \/><VersionNueva \/>/.test(readFileSync('web/src/App.jsx', 'utf8')), 'el aviso sale también en la entrada');

console.log('· el armado');
const yml = readFileSync('.github/workflows/apps.yml', 'utf8');
rev(/VITE_VERSION_ANDROID: \$\{\{ github\.run_number \}\}/.test(yml), 'la app lleva adentro el número de su corrida');
rev(/@capacitor\/app@\^7 @capacitor\/browser@\^7/.test(yml), 'con los plugins App y Browser');
rev(/python3 apps\/android\/ligas\.py/.test(yml), 'el manifiesto reclama /app/entrar');
rev(/versionCode \$\{\{ github\.run_number \}\}/.test(yml), 'el versionCode siempre crece');
rev(yml.indexOf('apps/android.apk') < yml.indexOf('apps/android.json'), 'y android.json se sube DESPUÉS del .apk');
rev(/android:autoVerify="true"/.test(readFileSync('apps/android/ligas.py', 'utf8')), 'el filtro pide verificación');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
