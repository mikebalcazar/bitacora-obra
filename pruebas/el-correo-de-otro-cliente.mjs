/* Invitar a un cliente con el correo de otro que ya existe: avisa, enseña
 * quién es, y pregunta.
 *
 * Mike, 4-oct-2026: «El cliente se debe poder crear desde quell, dash o quote.
 * Los 3 generan exactamente el mismo cliente (…) en caso de querer generar un
 * nuevo cliente con el email de otro que ya existe, avisar que ya existe un
 * cliente, presentar su info y preguntar si es ese cliente el que estás
 * buscando y ya usarlo o si quieres crear uno nuevo con otro email.»
 *
 * La regla vive en la suite (contrato 0.65.0): `POST /clientes/invitar` sin
 * `usar_existente` contesta 409 correo_en_uso con el cliente que ya tiene ese
 * correo. Lo que se mide aquí, sin navegador: que el error de la API conserve
 * el cuerpo (`e.data`), que la pantalla lo atrape, lo enseñe con nombre,
 * teléfono, RFC y portal, y ofrezca las dos salidas: «Sí, es ése: invitarlo»
 * vuelve a mandar con usar_existente, «No, es otro: cambio el correo» limpia.
 *
 *   npm run build && node pruebas/el-correo-de-otro-cliente.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const api = readFileSync('web/src/api.js', 'utf8');
const home = readFileSync('web/src/Home.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');
const inv = home.slice(home.indexOf('function InvitarCliente('), home.indexOf('function CambiarPin('));

console.log('· el error de la API trae el cuerpo');
rev(/e\.status = r\.status; e\.data = data; throw e;/.test(api), 'call() cuelga el cuerpo de la respuesta en e.data');

console.log('· la pantalla atrapa el 409 correo_en_uso');
rev(/if \(x\.status === 409 && x\.message === 'correo_en_uso'\) \{ setConEseCorreo\(x\.data\?\.cliente \|\| \{ correo: f\.email \}\); return; \}/.test(inv), 'y guarda al cliente que ya tiene ese correo, sin toast');
rev(/\.\.\.\(usarExistente \? \{ usar_existente: true \} : \{\}\)/.test(inv), 'el envío lleva usar_existente sólo cuando se confirmó');
rev(/await manda\(false\);/.test(inv), 'el botón «Invitar» manda sin la bandera');

console.log('· el aviso dice quién es y pregunta');
const aviso = inv.slice(inv.indexOf('<div className="aviso-correo"'), inv.indexOf('<div className="aviso-correo"') + 1200);
rev(aviso.length > 100, 'hay un bloque aviso-correo con data-con-ese-correo', /data-con-ese-correo/.test(aviso) ? '' : 'sin data-con-ese-correo');
rev(/Ya hay un cliente con el correo <b>\{conEseCorreo\.correo \|\| f\.email\}<\/b>\. ¿Es éste el que buscas\?/.test(aviso), 'avisa que ya existe y pregunta si es ése');
rev(/\{conEseCorreo\.nombre \|\| '\(sin nombre\)'\}/.test(aviso) && /conEseCorreo\.telefono/.test(aviso) && /conEseCorreo\.rfc/.test(aviso) && /conEseCorreo\.portal_activo \? ' · con portal'/.test(aviso), 'presenta nombre, teléfono, RFC y si tiene portal');
rev(/onClick=\{\(\) => manda\(true\)\}>\{busy \? 'Invitando…' : 'Sí, es ése: invitarlo'\}/.test(aviso), '«Sí, es ése: invitarlo» vuelve a mandar con usar_existente');
rev(/setConEseCorreo\(null\); document\.getElementById\('correo-cliente-invitado'\)\?\.focus\(\); \}\}>No, es otro: cambio el correo/.test(aviso), '«No, es otro: cambio el correo» quita el aviso y lleva al correo');
rev(/id="correo-cliente-invitado"[^>]*onChange=\{\(e\) => \{ setF\(\{ \.\.\.f, email: e\.target\.value \}\); setConEseCorreo\(null\); \}\}/.test(inv), 'cambiar el correo quita el aviso solo');
rev(/\.aviso-correo\{background:var\(--proc-soft\)/.test(css), 'el aviso tiene su estilo (ámbar, como lo «en proceso»)');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Sí, es ése: invitarlo/.test(js) && /usar_existente/.test(js), 'el texto del botón y la bandera están en el JavaScript publicado');
const cssPub = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.aviso-correo\{/.test(cssPub), 'y el estilo en el CSS publicado');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
