/* La bitácora de obra, de punta a punta, en staging.
 *
 * Es lo que quell101 no tenía: un lugar donde entrar y escribir sin tocar la
 * obra real. Desde el 19-sep sus datos viven en la base por empresa de la
 * suite, así que el Worker de staging (bitacora-obra-staging) habla con la
 * API de staging y con la empresa `demo`. Aquí se entra como el dueño de la
 * suite —en staging la API devuelve el código en la respuesta—, se levanta
 * una obra con su plano y su ítem, se lee, se sirve el plano y se borra todo.
 *
 * Corre en el corredor de GitHub antes de publicar producción: si esto no
 * pasa, producción no se toca.
 *
 *   STAGING=https://bitacora-obra-staging.mike-929.workers.dev node scripts/humo.mjs
 */

const STAGING = process.env.STAGING || 'https://bitacora-obra-staging.mike-929.workers.dev';
const CORREO = process.env.CORREO_SUPERADMIN || 'mike@forespot.com';
const ORG = process.env.ORG_ID || 'demo';
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

let fallas = 0, revisadas = 0, galleta = '';
const linea = (t) => console.log(t);
const rev = (ok, texto, extra = '') => { revisadas++; if (!ok) fallas++; linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`); };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(ruta, { method = 'GET', body, form } = {}) {
  const h = {};
  if (galleta) h.Cookie = galleta;
  if (body) h['Content-Type'] = 'application/json';
  const t0 = Date.now();
  const r = await fetch(`${STAGING}${ruta}`, { method, headers: h, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const puesta = r.headers.get('set-cookie');
  if (puesta) galleta = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  return { estado: r.status, ms: Date.now() - t0, tipo: r.headers.get('content-type') || '', bytes: texto.length, ...cuerpo };
}

async function humo() {
  linea(`== quell101 en staging ==  ${STAGING}  · empresa ${ORG}`);
  let portada = await pedir('/');
  for (let i = 1; i < 12 && portada.estado !== 200; i++) { await dormir(5000); portada = await pedir('/'); }
  rev(portada.estado === 200, 'la portada contesta', `${portada.estado} en ${portada.ms} ms`);
  const salud = await pedir('/s101/salud');
  rev(salud.estado === 200 && salud.data?.entorno === 'staging', 'el enlace de servicio llega a la API de staging', `${salud.estado} · contrato ${salud.data?.contrato}`);
  rev(salud.data?.contrato >= '0.16.0', 'y la API ya trae a quell101 adentro (contrato 0.16.0 o más)', String(salud.data?.contrato));

  // Entrar como el dueño de la suite: en staging el código viene en la respuesta.
  const cod = await pedir('/s101/auth/codigo', { method: 'POST', body: { correo: CORREO } });
  rev(/^\d{6}$/.test(String(cod.data?.codigo_prueba)) && cod.data?.enviado === false, 'llega un código de prueba y NO se manda correo de verdad', `${cod.estado}`);
  const ent = await pedir('/s101/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: cod.data?.codigo_prueba } });
  rev(ent.estado === 200, 'entra con el código', `${ent.estado}`);

  // Que la empresa exista y tenga quell101 prendida.
  const empresa = await pedir(`/s101/admin/orgs/${ORG}`);
  if (empresa.estado === 404) {
    const alta = await pedir('/s101/admin/orgs', { method: 'POST', body: { id: ORG, nombre: 'Demo' } });
    rev(alta.estado === 201, `la empresa ${ORG} no existía y se creó`, `${alta.estado}`);
  } else if (empresa.data?.apps && empresa.data.apps.quell !== true) {
    const prende = await pedir(`/s101/admin/orgs/${ORG}`, { method: 'PATCH', body: { apps: { ...empresa.data.apps, quell: true } } });
    rev(prende.estado === 200, `quell101 se prendió para ${ORG}`, `${prende.estado}`);
  }

  const yo = await pedir('/api/me');
  rev(yo.estado === 200 && yo.user?.role === 'admin', 'el dueño de la suite entra a la bitácora como dueño', `${yo.estado} ${yo.user?.role}`);

  const nombre = `Obra de humo ${new Date().toISOString().slice(0, 16)}`;
  const obra = await pedir('/api/projects', { method: 'POST', body: { name: nombre, client: 'Cliente de humo' } });
  rev(obra.estado === 200 && !!obra.id, 'levanta una obra', `${obra.estado}`);
  const fd = new FormData();
  fd.append('name', 'Planta'); fd.append('file_name', 'planta.png'); fd.append('width', '1000'); fd.append('height', '800');
  fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
  const plano = await pedir(`/api/projects/${obra.id}/plans`, { method: 'POST', form: fd });
  rev(plano.estado === 200 && String(plano.image_key || '').startsWith(`orgs/${ORG}/quell/plans/`), 'sube un plano al bucket de la suite, bajo la empresa', `${plano.estado} ${plano.image_key || plano.error || ''}`);
  const item = await pedir(`/api/plans/${plano.id}/elements`, { method: 'POST', body: { name: 'Isla de humo', type: 'Mueble', x: 0.5, y: 0.5, op_id: crypto.randomUUID() } });
  rev(item.estado === 200 && item.code === 'MW-01', 'levanta un ítem y la suite le propone MW-01', `${item.estado} ${item.code || item.error || ''}`);
  const leida = await pedir(`/api/projects/${obra.id}`);
  rev(leida.estado === 200 && leida.elements?.length === 1 && leida.plans?.length === 1 && leida.mi_rol === 'admin', 'lee la obra completa', `${leida.elements?.length} ítems · ${leida.plans?.length} planos`);
  const archivo = await pedir(`/files/${plano.image_key}`);
  rev(archivo.estado === 200 && archivo.tipo.startsWith('image/png'), 'sirve el plano desde el bucket de la suite', `${archivo.estado} ${archivo.tipo}`);
  const conteo = await pedir(`/s101/admin/orgs/${ORG}/quell`);
  rev(conteo.estado === 200 && conteo.data?.filas?.quell_elements >= 1, 'master101 cuenta lo que hay en quell101 de la empresa', JSON.stringify(conteo.data?.filas));
  const borrada = await pedir(`/api/projects/${obra.id}`, { method: 'DELETE' });
  rev(borrada.estado === 200 && borrada.archivos === 1, 'borra la obra y su plano del bucket', `${borrada.estado} archivos=${borrada.archivos}`);
  const ya = await pedir(`/files/${plano.image_key}`);
  rev(ya.estado === 404, 'y el plano ya no está', `${ya.estado}`);

  galleta = '';
  const sin = await pedir('/api/me');
  rev(sin.estado === 401, 'sin sesión, 401', `${sin.estado}`);
}

const t0 = Date.now();
try { await humo(); } catch (e) { fallas++; linea(`\nSe cayó el humo: ${e?.stack || e}`); }
linea(`\n${revisadas} revisadas · ${fallas} fallas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas === 0 ? 0 : 1);
