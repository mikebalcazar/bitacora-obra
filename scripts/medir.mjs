/* Mide el Worker de quell101 ya publicado en Cloudflare.
 *
 * El chat no alcanza *.workers.dev: el proxy de salida se lo rechaza. El
 * corredor de GitHub sí. Por eso esto corre allá y lo que mide vuelve por el
 * comentario del commit, que es lo único que el chat puede leer (OPERAR §6).
 *
 * quell101 no tiene staging: es un solo Worker contra la base de producción,
 * donde está la obra de verdad. Así que aquí NO se entra y NO se escribe: todo
 * lo que se mide se mide desde afuera de la puerta, y lo que se comprueba es
 * justamente que la puerta esté donde debe y diga que no cuando toca.
 *
 * Lo que se mide, y por qué:
 *
 *   la portada                que el sitio esté servido.
 *   /s101/salud               que el enlace de servicio llegue a la API. Si
 *                             esto falla, nadie puede entrar: la pantalla de
 *                             entrada entera cuelga de aquí.
 *   /s101/yo sin sesión       401. La puerta nueva no regala nada.
 *   /s101/auth/codigo         200 y sin el código en la respuesta: en
 *                             producción eso no sale nunca, y si saliera
 *                             cualquiera entraría con el correo de otro.
 *   /s101/auth/google         que esta dirección esté dada de alta en la API
 *                             (no 403) y que Google devuelva a la API.
 *   /api/me sin sesión        401, con cookie inventada y con token inventado:
 *                             la caída a la puerta vieja no abre nada.
 *   la puerta vieja           sigue viva y sigue diciendo que no. Las apps de
 *                             Android y Windows ya instaladas entran por ahí
 *                             hasta que se rearmen.
 */

const PROD = process.env.PROD || 'https://bitacora-obra.mike-929.workers.dev';
const API = process.env.API || 'https://suite101-api.mike-929.workers.dev';

let fallas = 0, revisadas = 0;
const linea = (t) => console.log(t);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function rev(ok, texto, extra = '') {
  revisadas++; if (!ok) fallas++;
  linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
}

async function traer(ruta, { method = 'GET', body, cabeceras = {} } = {}) {
  const t0 = Date.now();
  const h = { ...cabeceras };
  if (body) h['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(`${PROD}${ruta}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  } catch (e) {
    return { estado: 0, ms: Date.now() - t0, texto: String(e), cuerpo: null, ubicacion: '', tipo: '', bytes: 0 };
  }
  const texto = await r.text();
  let crudo = null;
  try { crudo = JSON.parse(texto); } catch { /* HTML o un binario */ }
  // Sólo la API de la suite envuelve en `{ ok, data }`. Lo que contesta el
  // propio quell101 trae `ok` pegado a los datos (`{ ok: true, app, hora }`), y
  // desenvolverlo también dejaba `undefined` donde había respuesta.
  const envuelto = crudo && typeof crudo === 'object' && 'ok' in crudo && ('data' in crudo || 'error' in crudo);
  const cuerpo = envuelto ? (crudo.ok ? crudo.data : { error: crudo.error, detalle: crudo.detalle }) : crudo;
  return { estado: r.status, ms: Date.now() - t0, tipo: r.headers.get('content-type') || '', ubicacion: r.headers.get('location') || '', bytes: texto.length, texto, cuerpo };
}

async function medir() {
  linea('');
  linea(`== quell101 ==  ${PROD}`);

  // El borde tarda en servir lo recién publicado; se reintenta antes de dar
  // por mala una portada que sólo llegó temprano.
  let portada = await traer('/');
  for (let i = 1; i < 12 && portada.estado !== 200; i++) { await dormir(5000); portada = await traer('/'); }
  rev(portada.estado === 200, 'la portada contesta', `${portada.estado} en ${portada.ms} ms`);

  linea('');
  linea('-- la puerta de la suite --');
  const salud = await traer('/s101/salud');
  rev(salud.estado === 200 && salud.cuerpo?.servicio === 'suite101-api',
    'el enlace de servicio llega a suite101-api', `${salud.estado} · version ${salud.cuerpo?.version} · contrato ${salud.cuerpo?.contrato}`);
  rev(salud.cuerpo?.entorno === 'produccion', 'y es la API de producción, no la de prueba', String(salud.cuerpo?.entorno));

  const sinSesion = await traer('/s101/yo');
  rev(sinSesion.estado === 401 && sinSesion.cuerpo?.error === 'sin_sesion',
    '/s101/yo sin sesión contesta 401', `${sinSesion.estado} ${sinSesion.cuerpo?.error ?? ''}`);

  const cod = await traer('/s101/auth/codigo', { method: 'POST', body: { correo: 'nadie-de-quell101@ejemplo.mx' } });
  rev(cod.estado === 200, 'pedir código contesta 200 aunque el correo no exista', `${cod.estado} en ${cod.ms} ms`);
  rev(cod.cuerpo?.codigo_prueba === undefined && !/codigo_prueba/.test(cod.texto),
    'y producción NUNCA devuelve el código en la respuesta');

  const google = await traer(`/s101/auth/google?volver_a=${encodeURIComponent(PROD + '/')}`);
  rev(google.estado !== 403, 'esta dirección está dada de alta en la API para entrar con Google', `${google.estado} ${google.cuerpo?.error ?? ''}`);
  if (google.estado === 302) {
    rev(google.ubicacion.startsWith('https://accounts.google.com/'), 'y manda a Google', google.ubicacion.slice(0, 60));
    const destino = new URL(google.ubicacion).searchParams.get('redirect_uri');
    rev(destino === `${API}/auth/google/callback`, 'Google devuelve a la API, no a la app', String(destino));
  } else {
    rev(google.estado === 501, 'Google todavía no está prendido (501), pero la puerta existe', `${google.estado}`);
  }

  linea('');
  linea('-- la puerta de quell101 --');
  const yo = await traer('/api/me');
  rev(yo.estado === 401, '/api/me sin sesión contesta 401', `${yo.estado}`);

  const conGalleta = await traer('/api/me', { cabeceras: { Cookie: 's101=inventada.firmaQueNoEs; bo_session=tampoco' } });
  rev(conGalleta.estado === 401, 'con una cookie inventada, tampoco', `${conGalleta.estado}`);

  const conToken = await traer('/api/me', { cabeceras: { Authorization: 'Bearer inventado.niFirma' } });
  rev(conToken.estado === 401, 'con un token inventado, tampoco', `${conToken.estado}`);

  const foto = await traer('/files/loquesea?t=inventado');
  rev(foto.estado === 401, 'y un archivo con un token inventado en la dirección, tampoco', `${foto.estado}`);

  /* La puerta vieja, cerrada el 16-sep por encargo de Mike.
   *
   * Hasta ese día esta medición comprobaba lo contrario —que siguiera en pie
   * para el APK y la app de Windows ya instaladas—. Cambió de signo, y se deja
   * dicho para que nadie lea esto y crea que alguien se equivocó de sentido.
   *
   * 410 y no 404: «existía y se fue», con el texto que dice a dónde ir. Un 404
   * es lo que contestaría un servidor roto, y la app instalada no sabría
   * distinguir. */
  /* Se REINTENTA, como el de la portada de arriba, y por la misma razón: el
   * borde de Cloudflare tarda unos segundos en soltar la versión recién
   * publicada. La primera corrida de esta medición (16-sep) salió en rojo
   * midiendo el Worker VIEJO —contestó 401 con «Correo o PIN incorrecto.», que
   * es el texto del código que se acababa de quitar— con el nuevo ya
   * desplegado: wrangler decía «Deployed» y el borde seguía en la anterior.
   *
   * Y el 410 sirve de seña de que la versión nueva ya está arriba: la portada
   * contesta 200 con la vieja y con la nueva, así que esperar por ella no
   * distingue nada. Éste sí, y por eso va antes que lo demás. */
  let vieja = await traer('/api/auth/pin', { method: 'POST', body: { email: 'nadie@ejemplo.mx', pin: '000000' } });
  for (let i = 1; i < 12 && vieja.estado !== 410; i++) {
    if (i === 1) console.log('  (el borde todavía sirve la versión anterior: esperando)');
    await dormir(5000);
    vieja = await traer('/api/auth/pin', { method: 'POST', body: { email: 'nadie@ejemplo.mx', pin: '000000' } });
  }
  rev(vieja.estado === 410, 'la puerta vieja está cerrada: /api/auth/pin contesta 410', `${vieja.estado}`);
  rev(vieja.cuerpo?.error === 'esta_puerta_se_cerro' && /suite 101/i.test(String(vieja.cuerpo?.mensaje || '')),
    'y dice con palabras que ahora se entra con la cuenta de la suite', String(vieja.cuerpo?.error));

  const salud101 = await traer('/api/salud');
  rev(salud101.estado === 200 && salud101.cuerpo?.app === 'quell101', 'el Worker se nombra quell101', String(salud101.cuerpo?.app));
  rev(salud101.cuerpo?.datos === 'suite', 'y dice que sus datos viven en la suite (desde el 19-sep no hay base propia)', String(salud101.cuerpo?.datos));
  rev(salud.cuerpo?.contrato >= '0.16.0', 'la API de producción ya trae a quell101 adentro (contrato 0.16.0 o más)', String(salud.cuerpo?.contrato));

  // Levantar un ítem sigue pidiendo sesión; la cerradura del código vive
  // ahora en la base por empresa de la suite (migración 0006).
  const item = await traer('/api/plans/loquesea/elements', { method: 'POST', body: { name: 'x', code: 'X-1', x: 0.5, y: 0.5 } });
  rev(item.estado === 401, 'levantar un ítem sin sesión sigue contestando 401', String(item.estado));
}

/* ─────────────── ─────────────── */

const t0 = Date.now();
linea(`quell101 con el login de la suite — medido el ${new Date().toISOString()}`);
try {
  await medir();
} catch (e) {
  fallas++;
  linea(`\nSe cayó la medición: ${e?.stack || e}`);
}
linea('');
linea(`${revisadas} revisadas · ${fallas} fallas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas === 0 ? 0 : 1);
