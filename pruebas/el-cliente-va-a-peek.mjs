/* El portal del cliente es peek101 (5-oct-2026).
 *
 * Mike: «Quiero que el único visor del cliente sea Peek y que ahí mismo pueda
 * ver el plano general y aparte contestar los puntos de dudas. Y el generar
 * sus propias dudas desde Peek».
 *
 * Lo que se mide sin navegador: que un cliente que entra aquí no vea la obra
 * sino la liga a su portal, que la liga se deduzca de dónde vive esta app, y
 * que una liga vieja a una obra o a una pieza se traduzca a la de peek101.
 *
 *   npm run build && node pruebas/el-cliente-va-a-peek.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const app = readFileSync('web/src/App.jsx', 'utf8');

console.log('· el cliente no ve la obra aquí');
rev(/if \(esCliente\(user\)\) return <Ctx\.Provider value=\{ctx\}><ClienteAPeek user=\{user\} onSalir=\{ctx\.logout\} \/><\/Ctx\.Provider>;/.test(app), 'un cliente ve ClienteAPeek y nada más');
rev(app.indexOf('if (esCliente(user)) return') < app.indexOf("if (route.page === 'p' && route.id) view ="), 'y se decide ANTES de escoger la pantalla de la obra');
rev(/<a className="btn primary" href=\{destino\}[^>]*>Abrir mi portal<\/a>/.test(app), 'con el botón «Abrir mi portal»');

console.log('· a dónde manda');
// La función se evalúa aparte: se copia tal cual del archivo para no armar un navegador.
const fn = app.slice(app.indexOf('export function sitioPeek('), app.indexOf('function ClienteAPeek('));
const sitioPeek = new Function(`${fn.replace('export function', 'function').replace('origen = location.origin', 'origen')} return sitioPeek;`)();
rev(sitioPeek('https://quell.suite101.app') === 'https://peek.suite101.app', 'producción: quell.suite101.app → peek.suite101.app');
rev(sitioPeek('https://quell.acme.com') === 'https://peek.acme.com', 'dominio propio sin el «101»: quell.X → peek.X');
rev(sitioPeek('https://quell101.taller101.com') === 'https://peek101.taller101.com', 'la dirección de antes: quell101.taller101.com → peek101.taller101.com');
rev(sitioPeek('https://otra.cosa') === 'https://peek.suite101.app', 'otra cosa → producción, en suite101.app');
rev(sitioPeek('https://quell101.acme.com.mx') === 'https://peek101.acme.com.mx', 'dominio propio: quell101.X → peek101.X');
rev(sitioPeek('https://bitacora-obra-staging.mike-929.workers.dev') === 'https://peek101-staging.mike-929.workers.dev', 'staging → el peek101 de staging');
rev(/`\$\{peek\}\/#\/pieza\/\$\{pieza\}`/.test(app) && /`\$\{peek\}\/#\/obra\/\$\{obra\}`/.test(app), 'una liga vieja #/p/OBRA o #/p/OBRA/e/PIEZA se traduce a #/obra o #/pieza de peek101');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Tu portal es peek101/.test(js) && /data-cliente-a-peek/.test(js), 'la pantalla está en el JavaScript publicado');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
