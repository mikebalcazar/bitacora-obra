/* La puerta de quell101, probada en una mesa de trabajo.
 *
 * El Worker es un módulo con `export default { fetch }`, así que se puede
 * llamar aquí mismo con un `env` de mentiras: una API que contesta lo que se le
 * diga y una base con tres renglones. Lo que se prueba es lo único que cambió
 * con la mudanza —quién pasa la puerta y quién no—, y se prueba sobre todo lo
 * que NO debe pasar: eso es lo que un despliegue no enseña hasta que ya es
 * tarde.
 *
 *   node pruebas/puerta.mjs
 */

import worker from '../worker/index.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

/* ─────────────── el mundo de mentiras ─────────────── */

// Quién es cada galleta para la suite. `null` = la suite dice que no.
const SUITE = {
  'duena': { usuario: { id: 'u1', correo: 'mike@forespot.com' }, superadmin: true, orgs: [], tiene_pin: true },
  // Como la guarda la suite de verdad: llaves cortas, no nombres de app. Fue
  // el error que se coló a producción el 16-sep y que la lista vacía de Mike y
  // de Fer tapó, porque vacía quiere decir todas.
  'supervisora': { usuario: { id: 'u2', correo: 'fer@forespot.com' }, superadmin: false, orgs: [{ id: 'forespot', nombre: 'Forespot', rol: 'staff', apps: ['quell', 'peek'] }], tiene_pin: true },
  'todas-las-apps': { usuario: { id: 'u3', correo: 'goyomonroy23807@gmail.com' }, superadmin: false, orgs: [{ id: 'forespot', nombre: 'Forespot', rol: 'staff', apps: [] }], tiene_pin: false },
  'nombre_largo': { usuario: { id: 'u7', correo: 'fer@forespot.com' }, superadmin: false, orgs: [{ id: 'forespot', nombre: 'Forespot', rol: 'staff', apps: ['quell101'] }], tiene_pin: true },
  'sin-quell': { usuario: { id: 'u4', correo: 'solo-dash@ejemplo.mx' }, superadmin: false, orgs: [{ id: 'forespot', nombre: 'Forespot', rol: 'socio', apps: ['dash'] }], tiene_pin: true },
  'sin-alta-aqui': { usuario: { id: 'u5', correo: 'nadie@ejemplo.mx' }, superadmin: false, orgs: [{ id: 'forespot', nombre: 'Forespot', rol: 'staff', apps: ['quell101'] }], tiene_pin: true },
};

// Los tres renglones de `users` que hay hoy en producción.
const USERS = [
  { id: '196440e4', email: 'mike@forespot.com', name: 'mike', role: 'admin', company: '', active: 1, pin_hash: 'x' },
  { id: 'c8a6aafe', email: 'fer@forespot.com', name: 'Fer Balcázar', role: 'int', company: 'Taller101', active: 1, pin_hash: 'x' },
  { id: '0d45d7f0', email: 'goyomonroy23807@gmail.com', name: 'Goyo Monroy', role: 'con', company: 'taller101', active: 1, pin_hash: null },
];

// La sesión vieja que llevan adentro el APK y la app de Windows ya instaladas.
const SESION_VIEJA = { token: 'token-viejo-del-apk', user: USERS[1] };

let pedidasALaSuite = [];
let escrito = [];
let codigoOcupado = null;   // el código que la base va a rechazar por repetido

function mundo() {
  pedidasALaSuite = [];
  escrito = [];
  return {
    APP_NAME: 'quell101',
    API: {
      async fetch(req) {
        const u = new URL(req.url);
        pedidasALaSuite.push({ ruta: u.pathname, app: req.headers.get('X-App'), metodo: req.method });
        if (u.pathname !== '/yo') return new Response(JSON.stringify({ ok: true, data: { eco: u.pathname } }), { status: 200 });
        const galleta = /(?:^|;\s*)s101=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
        const llevado = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || null;
        const quien = SUITE[galleta ?? ''] ?? SUITE[llevado ?? ''] ?? null;
        if (!quien) return new Response(JSON.stringify({ ok: false, error: 'sin_sesion' }), { status: 401 });
        return new Response(JSON.stringify({ ok: true, data: quien }), { status: 200 });
      },
    },
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                if (/FROM users WHERE email/.test(sql)) {
                  return USERS.find((u) => u.email === args[0] && u.active) ?? null;
                }
                if (/FROM sessions s JOIN users u/.test(sql)) {
                  return args[0] === SESION_VIEJA.token ? SESION_VIEJA.user : null;
                }
                if (/SELECT project_id FROM plans/.test(sql)) return { project_id: 'obra-a' };
                return null;
              },
              async all() { return { results: [] }; },
              async run() {
                // La base rechaza el código repetido con este mensaje exacto;
                // está copiado de lo que devolvió SQLite de verdad en
                // pruebas/codigo-unico.mjs.
                if (codigoOcupado && /INSERT INTO elements/.test(sql) && args.includes(codigoOcupado)) {
                  throw new Error('D1_ERROR: UNIQUE constraint failed: elements.project_id, elements.code: SQLITE_CONSTRAINT');
                }
                escrito.push({ sql, args });
                return { success: true };
              },
            };
          },
        };
      },
      async batch() { return []; },
    },
    FILES: { async get() { return null; }, async head() { return null; } },
    ASSETS: { async fetch() { return new Response('el sitio', { status: 200 }); } },
  };
}

const pide = (ruta, cabeceras = {}, env = mundo()) =>
  worker.fetch(new Request(`https://bitacora-obra.mike-929.workers.dev${ruta}`, { headers: cabeceras }), env);

/* ─────────────── lo que se prueba ─────────────── */

console.log('\n== la puerta de la suite ==');
{
  const env = mundo();
  const r = await worker.fetch(new Request('https://bitacora-obra.mike-929.workers.dev/s101/auth/codigo', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App': 'me-quiero-hacer-pasar-por-otro' }, body: '{"correo":"x@y.mx"}',
  }), env);
  rev(r.status === 200, '/s101/auth/codigo llega a la API', String(r.status));
  rev(pedidasALaSuite[0]?.ruta === '/auth/codigo', 'y llega sin el prefijo', String(pedidasALaSuite[0]?.ruta));
  rev(pedidasALaSuite[0]?.app === 'quell101', 'el Worker pone X-App y pisa lo que mandó la app', String(pedidasALaSuite[0]?.app));
  rev(pedidasALaSuite[0]?.metodo === 'POST', 'y no se pierde el método', String(pedidasALaSuite[0]?.metodo));
}

console.log('\n== quién pasa ==');
for (const [galleta, quien, espera] of [
  ['duena', 'la dueña de la suite', 200],
  ['supervisora', 'quien trae la llave «quell» en su lista de apps', 200],
  ['nombre_largo', 'quien la trae escrita como «quell101»', 200],
  ['todas-las-apps', 'quien trae la lista vacía, que quiere decir todas', 200],
]) {
  const r = await pide('/api/me', { Cookie: `s101=${galleta}` });
  const cuerpo = await r.json().catch(() => ({}));
  rev(r.status === espera, `${quien} entra`, `${r.status} ${cuerpo.user?.email ?? cuerpo.error ?? ''}`);
  if (r.status === 200) {
    rev(cuerpo.user?.email === SUITE[galleta].usuario.correo, '  y es quien dijo la suite, con su rol de esta base', `${cuerpo.user?.email} · ${cuerpo.user?.role}`);
  }
}

console.log('\n== quién no pasa ==');
for (const [cabeceras, quien] of [
  [{}, 'sin nada'],
  [{ Cookie: 's101=inventada' }, 'con una galleta que la suite no reconoce'],
  [{ Authorization: 'Bearer inventado' }, 'con un token que la suite no reconoce'],
  [{ Cookie: 's101=sin-quell' }, 'quien entra a la suite pero sólo trae «dash» en sus apps'],
  [{ Cookie: 's101=sin-alta-aqui' }, 'quien entra a la suite pero nadie lo dio de alta en la obra'],
]) {
  const r = await pide('/api/me', cabeceras);
  rev(r.status === 401, `${quien}, no`, String(r.status));
}

console.log('\n== las apps ya instaladas ==');
{
  const r = await pide('/api/me', { Authorization: `Bearer ${SESION_VIEJA.token}` });
  const cuerpo = await r.json().catch(() => ({}));
  rev(r.status === 200 && cuerpo.user?.email === SESION_VIEJA.user.email,
    'el token viejo del APK sigue entrando por la puerta de atrás', `${r.status} ${cuerpo.user?.email ?? cuerpo.error ?? ''}`);
  const mala = await pide('/api/me', { Authorization: 'Bearer token-viejo-que-ya-no-existe' });
  rev(mala.status === 401, 'y un token viejo que ya no existe, no', String(mala.status));
}

console.log('\n== los archivos ==');
{
  // La etiqueta <img> no puede mandar encabezados: para /files/ el token va en
  // la dirección. Con uno bueno se llega al archivo (que aquí no existe, 404);
  // con uno inventado se queda en la puerta (401).
  const bueno = await pide('/files/foto.jpg?t=supervisora');
  rev(bueno.status === 404, 'con un token bueno en la dirección se pasa la puerta', `${bueno.status} (404 = pasó y el archivo no existe)`);
  const malo = await pide('/files/foto.jpg?t=inventado');
  rev(malo.status === 401, 'con uno inventado, no', String(malo.status));
  const enOtraRuta = await pide('/api/me?t=supervisora');
  rev(enOtraRuta.status === 401, 'y el token en la dirección sólo vale para /files/', String(enOtraRuta.status));
}

console.log('\n== el código repetido del ítem ==');
{
  const alta = (code, env) => worker.fetch(new Request('https://bitacora-obra.mike-929.workers.dev/api/plans/pa/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 's101=supervisora' },
    body: JSON.stringify({ name: 'Mueble nuevo', code, x: 0.5, y: 0.5 }),
  }), env);

  codigoOcupado = null;
  const env1 = mundo();
  const bien = await alta('MW-08', env1);
  rev(bien.status === 200, 'el supervisor levanta un ítem con un código libre', String(bien.status));
  const ins = escrito.find((e) => /INSERT INTO elements/.test(e.sql));
  rev(/project_id/.test(ins?.sql ?? ''), 'y el ítem se guarda con su obra', ins?.sql?.includes('project_id') ? 'project_id va en el INSERT' : 'NO va');
  rev(ins?.args?.[2] === 'obra-a', 'con la obra del plano, no con lo que mande la pantalla', String(ins?.args?.[2]));

  codigoOcupado = 'MW-07';
  const choque = await alta('MW-07', mundo());
  const cuerpo = await choque.json().catch(() => ({}));
  rev(choque.status === 409, 'y si el código ya existe en la obra, contesta 409', String(choque.status));
  rev(/ya hay un ítem con el código MW-07/.test(cuerpo.error ?? ''), 'con palabras, no con un «error interno»', String(cuerpo.error));

  // Un espacio de más no es un código distinto.
  codigoOcupado = 'MW-07';
  const conEspacios = await alta('  MW-07  ', mundo());
  rev(conEspacios.status === 409, 'y «  MW-07  » tampoco se cuela: se recortan los espacios', String(conEspacios.status));
  codigoOcupado = null;
}

console.log('\n== el sitio ==');
{
  const r = await pide('/');
  rev(r.status === 200 && (await r.text()) === 'el sitio', 'lo que no es ruta del Worker lo sirven los archivos');
}

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
