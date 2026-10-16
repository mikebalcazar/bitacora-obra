import { pdfjs, esPdf } from './pdf.js';
import * as local from './local.js';
// Cliente API — cookies de sesión (HttpOnly). Fallback bearer para PWA en iOS si la cookie se pierde.
const TOKEN_KEY = 'bo_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

// Dentro del sitio, las rutas son relativas y la cookie hace el trabajo. Dentro
// de la app de Android o de Windows, el sitio va empaquetado y el servidor está
// en otro lado: la dirección se fija al compilar y la sesión viaja como token.
export const BASE = (import.meta.env?.VITE_API_BASE || '').replace(/\/$/, '');
export const empaquetada = !!BASE;

async function call(method, path, body, isForm = false) {
  const headers = {};
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body && !isForm) headers['content-type'] = 'application/json';
  const r = await fetch(BASE + '/api' + path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined, credentials: BASE ? 'omit' : 'same-origin' });
  let data = null;
  try { data = await r.json(); } catch { data = {}; }
  // El error lleva el cuerpo entero (`e.data`): un 409 correo_en_uso trae al
  // cliente que ya tiene ese correo, y la pantalla lo enseña (4-oct-2026).
  if (!r.ok) { const e = new Error(data.error || `Error ${r.status}`); e.status = r.status; e.data = data; throw e; }
  return data;
}
export const api = {
  get: (p) => call('GET', p),
  post: (p, b) => call('POST', p, b),
  patch: (p, b) => call('PATCH', p, b),
  del: (p) => call('DELETE', p),
  form: (p, fd) => call('POST', p, fd, true),
};

// ─────────────────────── la obra, sin señal ───────────────────────
// Todo lo que se lee queda guardado en el dispositivo, y todo lo que se escribe
// entra a una fila que se vacía sola en cuanto vuelve la señal.

export const hayRed = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

// Se avisa a la app cuando cambia algo: cuántos faltan por subir, si se está
// leyendo de lo guardado, si algo se atoró.
const OYENTES = new Set();
export const alCambiarRed = (fn) => { OYENTES.add(fn); return () => OYENTES.delete(fn); };
async function avisa(extra = {}) {
  const faltan = await local.cuantosFaltan();
  for (const fn of OYENTES) { try { fn({ faltan, red: hayRed(), ...extra }); } catch {} }
}
// Para que la app sepa al arrancar cuántos cambios quedaron por subir de la
// vez pasada, aunque ahora mismo no haya señal (vaciaFila no avisa sin red).
export const revisaSenal = () => avisa();

// Un fallo de red es "no hubo forma de llegar", no "el servidor dijo que no".
// El segundo no se guarda para reintentar: reintentarlo daría lo mismo.
const esFalloDeRed = (e) => !e || !e.status;

// ─────────── quell instantáneo (Mike, 16-oct-2026) ───────────
// «Que en pantalla sea suuuuper snappy y que en el background se vayan subiendo
// esos cambios». Se midió: cada toque esperaba ~3 s, con señal buena o mala,
// porque esperaba al servidor dos veces (guardar y volver a leer). Ahora:
//   · escribir: va a la fila, se pinta en el teléfono y regresa al instante; la
//     fila sube por detrás, haya señal o no;
//   · leer: lo guardado se enseña enseguida y se pone al día por detrás; y
//     mientras haya algo por subir, lo del teléfono manda, para que una lectura
//     vieja del servidor no borre lo que el usuario acaba de hacer.

const marcaDeCache = async (ruta, datos) => ({ ...datos, __deCache: true, __cuando: await local.cuando(ruta) });

// Pone al día una ruta desde el servidor, por detrás. Si mientras tanto el
// usuario hizo algo (hay fila), no se guarda: la fila sube primero y luego se
// vuelve a leer.
async function refrescar(ruta, antes, alRefrescar) {
  try {
    const datos = await call('GET', ruta);
    if (await local.cuantosFaltan()) return;
    await local.guarda(ruta, datos);
    avisa({ deCache: false });
    if (alRefrescar && JSON.stringify(datos) !== JSON.stringify(antes)) alRefrescar(datos);
  } catch (e) { /* sin red o el servidor no quiso: se queda lo guardado */ }
}

// Leer. Con `alRefrescar`, lo guardado sale al momento y lo del servidor llega
// después por esa función. Sin él, la red manda como antes, salvo que haya algo
// por subir: entonces manda lo del teléfono.
export async function leer(ruta, { soloCache = false, alRefrescar = null } = {}) {
  const guardado = await local.lee(ruta);
  const porSubir = guardado ? await local.cuantosFaltan() : 0;
  if (guardado && (soloCache || porSubir > 0 || alRefrescar)) {
    if (alRefrescar && !soloCache && !porSubir && hayRed()) refrescar(ruta, guardado, alRefrescar);
    return hayRed() ? guardado : marcaDeCache(ruta, guardado);
  }
  if (!soloCache && hayRed()) {
    try {
      const datos = await call('GET', ruta);
      await local.guarda(ruta, datos);
      avisa({ deCache: false });
      return datos;
    } catch (e) {
      if (!esFalloDeRed(e)) throw e;   // 403, 404: eso sí es respuesta
    }
  }
  if (guardado) { avisa({ deCache: true }); return marcaDeCache(ruta, guardado); }
  throw new Error(hayRed() ? 'No se pudo cargar.' : 'Sin señal y sin copia guardada de esto todavía.');
}

// Escribir. El identificador se hace aquí y viaja con la operación: si la señal
// se cae justo al subir, al reintentar el servidor lo reconoce y no la repite.
// Desde la 0.103.0 de la API también es el id de lo que se crea (pendiente,
// nota, duda, pieza), así que el parche lo pinta con su id de verdad y el
// siguiente toque ya va contra él.
//
// `parche.fn(datos, { id, archivos })` cambia lo guardado para que se vea al
// instante. `esperar: true` es para lo poco que necesita la respuesta del
// servidor (un correo que salió o no, una cuenta que hace allá): con señal se
// espera como antes; sin señal, a la fila.
export async function escribir({ metodo = 'POST', ruta, cuerpo = null, campos = null, archivos = null, parche = null, esperar = false }) {
  const idOp = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  if (campos || archivos) campos = { ...(campos || {}), op_id: idOp };
  else cuerpo = { ...(cuerpo || {}), op_id: idOp };

  if (esperar && hayRed()) {
    try {
      let r;
      if (campos || archivos) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(campos || {})) fd.append(k, v);
        for (const f of archivos || []) fd.append('photos', f);
        r = await call('POST', ruta, fd, true);
      } else r = await call(metodo, ruta, cuerpo);
      avisa();
      return { ok: true, subido: true, r, id: idOp, sinSenal: false };
    } catch (e) { if (!esFalloDeRed(e)) throw e; }
  }

  const op = { id: idOp, metodo, ruta, cuerpo, campos, archivos, creado: Date.now() };
  await local.encola(op);
  if (parche) await local.parchea(parche.clave, (d) => parche.fn(d, { id: idOp, archivos: archivos || [] }));
  avisa();
  if (hayRed()) vaciaFila();   // por detrás: no se espera
  return { ok: true, subido: false, id: idOp, sinSenal: !hayRed() };
}

// Vaciar la fila, en orden. Lo que el servidor rechaza de plano se saca de la
// fila: reintentarlo eternamente solo la tapa. Si mientras se vaciaba entró
// algo nuevo, se da otra vuelta.
let vaciando = false, otraVuelta = false;
export async function vaciaFila() {
  if (vaciando) { otraVuelta = true; return { subidas: 0, rechazadas: 0 }; }
  if (!hayRed()) return { subidas: 0, rechazadas: 0 };
  vaciando = true;
  let subidas = 0, rechazadas = 0, ultimoError = null;
  try {
    do {
      otraVuelta = false;
      for (const op of await local.fila()) {
        try {
          if (op.campos || op.archivos) {
            const fd = new FormData();
            for (const [k, v] of Object.entries(op.campos || {})) fd.append(k, v);
            for (const f of op.archivos || []) fd.append('photos', f);
            await call('POST', op.ruta, fd, true);
          } else {
            await call(op.metodo, op.ruta, op.cuerpo);
          }
          await local.desencola(op.id);
          subidas++;
        } catch (e) {
          if (esFalloDeRed(e)) { otraVuelta = false; break; }   // se fue la señal otra vez
          await local.desencola(op.id);                          // el servidor dijo que no
          rechazadas++; ultimoError = e.message;
        }
      }
    } while (otraVuelta && hayRed());
  } finally {
    vaciando = false;
    // `subidas` y `rechazadas` le dicen a la pantalla que vuelva a leer: lo que
    // enseñaba como «Por subir» ya está en el servidor, o el servidor no lo
    // quiso y hay que enseñar lo que de verdad quedó.
    avisa({ ultimoError, subidas, rechazadas });
  }
  return { subidas, rechazadas, ultimoError };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { vaciaFila(); avisa(); });
  window.addEventListener('offline', () => avisa());
}

// Dirección de una foto o un plano. Dentro del sitio basta la ruta: la cookie
// viaja sola. En las apps empaquetadas una etiqueta de imagen no puede mandar
// encabezados, así que el token va en la dirección.
export const fileUrl = (key) => {
  if (!BASE) return `/files/${key}`;
  const t = getToken();
  return `${BASE}/files/${key}${t ? `?t=${encodeURIComponent(t)}` : ''}`;
};

// ---------- utilidades ----------
/* Una fecha sola (AAAA-MM-DD: límite, entrega, diseño) se lee a mediodía.
 * `new Date('2026-10-12')` es la medianoche UTC, que en la Ciudad de México
 * todavía es el 11: así salía un día antes (Mike lo vio el 9-oct-2026 en el
 * límite de un pendiente). Una fecha con hora se deja como viene. */
const soloDia = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
export const fmtD = (iso) => iso ? new Date(soloDia(iso)).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
export const fmtT = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
export const isLate = (k) => k.status !== 'ok' && k.due_date && new Date(k.due_date + 'T23:59:59') < new Date();
export const ini = (n = '') => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
export const ST = { pend: 'Pendiente', proc: 'En proceso', ok: 'Resuelto' };

// Los tres roles de cuenta, con el nombre que se usa en obra.
export const ROLES = { admin: 'Dueño', int: 'Supervisor', con: 'Contratista', cli: 'Cliente' };

// Y lo que se es dentro de una obra. Quien la dirige lo es en todas; a los
// demás se lo dice su membresía, obra por obra: la misma persona es contratista
// en una y trabajador en otra.
export const ROLES_OBRA = {
  con: { nombre: 'Contratista', que: 'Ve nada más los pendientes que traen su nombre. Sube evidencia y los marca terminados.' },
  tra: { nombre: 'Trabajador', que: 'Ve la obra completa —planos, ítems, bitácora y punchlist— y no puede editar nada. Puede levantar dudas.' },
};
// Ver la obra entera es de quien la dirige y del trabajador. Editarla, solo de
// quien la dirige: son dos preguntas distintas y se contestan por separado.
export const veTodoEn = (user, miRol) => dirige(user) || miRol === 'tra';

// Las dos fases por las que pasa un ítem. Producción es mientras se hace;
// punchlist empieza el día que se entrega y hay algo que corregir.
export const FASES = { produccion: 'Producción', punchlist: 'Punchlist' };

/* El alcance de un ítem, tal como lo manda la API en cada pieza del plano
 * (contrato 0.64.0). Mike, 2-oct: «solo existirá "en alcance" o "fuera de
 * alcance"»; lo que se sacó y lo que nadie ha aprobado van en la MISMA lista,
 * y la historia —cuándo entró, cuándo salió, quién— está en la bitácora del
 * ítem, no en un tercer estado. Aquí sólo están los NOMBRES: la regla vive
 * en el contrato de la suite y la resuelve el servidor. */
export const ALCANCES = {
  dentro: 'En alcance',
  fuera: 'Fuera de alcance',
  todos: 'Todos',
};

/** Lo que dice cada renglón de la bitácora del alcance (contrato 0.64.0). */
export const MOVIMIENTOS_ALCANCE = {
  entra: 'Se agregó al alcance',
  sale: 'Se sacó del alcance',
};

// Los tipos de ítem y su color. El color es lo que hace legible un plano lleno:
// de un vistazo se ve dónde están las puertas y dónde los muebles, sin leer una
// sola etiqueta. Son tres tonos bien separados entre sí y separados también de
// los tres del estado —rojo, ámbar y verde—, que viven en el aro del pin.
export const TIPOS = [
  { clave: 'Mueble',  color: '#2C5AA0' },
  { clave: 'Puerta',  color: '#B4622A' },
  { clave: 'Acabado', color: '#4B7F52' },
  { clave: 'Servicio', color: '#6B4E9B' },
  // 22-sep-2026, Mike: «el requerimiento es un tipo de ítem pero que aún está
  // en revisión. Sí aparece en mapa, sí aparece en ítems, pero está pendiente
  // de cotizarse y autorizarse para entrar en producción».
  //
  // Era gris (22-sep: «esto todavía no es nada»), y desde el 2-oct además va
  // fuera del alcance: hueco, punteado y a tres cuartos. Gris, hueco y
  // punteado sobre un plano blanco no se veía. Mike, 3-oct-2026: «El color de
  // los círculos de los requerimientos en quell no se ven. Podríamos hacerlos
  // un amarillo relleno con círculo verde?». Amarillo relleno con aro verde:
  // el único pin que no es color de material y el que más se ve, que es lo
  // que un trabajo pedido en obra y sin autorizar necesita. El aro va en
  // styles.css (`.pin.revision`).
  { clave: 'Requerimiento', color: '#F0C419' },
];

/** ¿Está en revisión? Se pregunta por el tipo y normalizando, igual que en la
 *  API (`esRequerimiento` de src/quell/codigos.js): `type` es texto libre, y
 *  un «requerimiento» en minúscula guardado desde otra pantalla tiene que
 *  seguir contando. */
export const enRevision = (tipo) => String(tipo || '').trim().toLowerCase() === 'requerimiento';
// Un ítem viejo con un tipo que ya no está en la lista no desaparece: se pinta
// del azul marino de siempre y se puede prender y apagar como los demás.
export const colorTipo = (t) => (TIPOS.find((x) => x.clave === t) || {}).color || '#1C3557';
// El mismo color, aguado. Sirve para rellenar sin tapar: un ítem en producción
// va del color de su tipo pero a media tinta, y encima del plano se sigue
// viendo el dibujo. La mitad es el punto donde el pin pesa lo mismo que el
// entregado sin taparle las líneas: a un cuarto se perdía sobre el papel.
// Se calcula aquí y no con color-mix porque esto también se dibuja dentro de
// la app de escritorio y del reporte, y ahí no se puede andar suponiendo qué
// entiende cada motor.
export const aguado = (hex, a = 0.5) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(28,53,87,${a})`;
  const v = parseInt(m[1], 16);
  return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`;
};
// El avance de un ítem por su proceso, como fracción de las etapas activas. El
// catálogo lo manda el servidor —las etapas viven en la base, no aquí— así que
// el total cambia solo el día que se agregue una.
export const avance = (e, etapas = []) => {
  const total = etapas.length;
  const hechas = Math.min(e?.n_etapas || 0, total);
  return { hechas, total, pct: total ? Math.round((hechas / total) * 100) : 0 };
};

export const esDueno = (u) => u?.role === 'admin';
export const esContratista = (u) => u?.role === 'con';
// El cliente del taller (0012): ve el plano de su obra y sus puntos por definir.
export const esCliente = (u) => u?.role === 'cli';
export const dirige = (u) => u?.role === 'admin' || u?.role === 'int';
// «Hoy» es el de aquí, no el de Greenwich: con `toISOString` a partir de las
// 6 de la tarde en la Ciudad de México ya era mañana.
export const todayISO = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// Comprimir imagen en cliente (máx 1600 px, JPEG .82) → File
export async function compressImage(file, max = 1600, q = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  return new File([blob], (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

// Plano: PDF (pág. 1) o imagen → PNG rasterizado.
//
// Esta imagen es la que se ve de un vistazo y la que sale en los reportes; para
// acercarse a leer cotas está la capa nítida que se dibuja del PDF original.
// Aun así se rasteriza grande, porque en un plano de obra lo que se busca son
// líneas finas y letra chica: a 2600 px una hoja de 90 cm queda a 73 puntos por
// pulgada y no se distingue nada. Se prueba de mayor a menor hasta que el
// archivo entre en 8 MB, y nunca se pasa a JPEG: sus manchas alrededor de cada
// línea negra son justo lo que arruina un plano.
/* `giro` (0, 90, 180 o 270): cuántos grados se gira el original al subirlo.
 * Mike, 2-oct-2026: «a veces el PDF viene vertical». Un PDF se gira con el
 * propio pdf.js (`rotation` en el viewport); una imagen, girando el lienzo.
 * El giro se guarda con el plano, porque la capa nítida vuelve a dibujar el
 * PDF original y tiene que girarlo igual. */
export async function rasterizePlan(file, giro = 0) {
  const LIMITE = 8 * 1024 * 1024;
  const rotation = [0, 90, 180, 270].includes(Number(giro)) ? Number(giro) : 0;
  const deLado = rotation === 90 || rotation === 270;
  // Safari en iPhone no dibuja lienzos de más de 16.7 millones de píxeles: se
  // queda en blanco sin avisar. Por eso el área también manda, no solo el lado.
  const AREA_MAX = 16 * 1024 * 1024;
  const pdf = file.type === 'application/pdf' || esPdf(file.name);
  // Un PNG de 5000 px se descomprime en unos 70 MB de memoria al mostrarlo: en
  // un celular, sumado al PDF que se dibuja encima, es lo que tumba la pestaña.
  // El PDF no necesita que su imagen sea enorme —para leer de cerca está la capa
  // nítida—, así que se le pide menos. Una imagen suelta no tiene esa capa y es
  // todo lo que va a haber, por eso se le deja más.
  const MEDIDAS = pdf ? [3600, 3000, 2600] : [4200, 3400, 2600];
  let pagina, bitmap, ancho1, alto1;

  if (pdf) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    pagina = await doc.getPage(1);
    // Con el giro puesto, el viewport ya viene de lado: ancho y alto cambiados.
    const vp = pagina.getViewport({ scale: 1, rotation });
    ancho1 = vp.width; alto1 = vp.height;
  } else {
    bitmap = await createImageBitmap(file);
    ancho1 = deLado ? bitmap.height : bitmap.width;
    alto1 = deLado ? bitmap.width : bitmap.height;
  }

  let ultimo = null;
  for (const medida of MEDIDAS) {
    let escala = medida / Math.max(ancho1, alto1);
    if (!pdf) escala = Math.min(1, escala);           // una foto no se inventa detalle
    if (ancho1 * alto1 * escala * escala > AREA_MAX) {
      escala = Math.sqrt(AREA_MAX / (ancho1 * alto1));
    }
    const w = Math.max(1, Math.round(ancho1 * escala));
    const h = Math.max(1, Math.round(alto1 * escala));
    const lienzo = document.createElement('canvas');
    lienzo.width = w; lienzo.height = h;
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    if (pdf) {
      await pagina.render({ canvasContext: ctx, viewport: pagina.getViewport({ scale: escala, rotation }) }).promise;
    } else {
      // La imagen se dibuja girada alrededor del centro del lienzo ya girado.
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      const bw = deLado ? h : w, bh = deLado ? w : h;
      ctx.drawImage(bitmap, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();
    }

    const blob = await new Promise((res) => lienzo.toBlob(res, 'image/png'));
    if (!blob) continue;
    ultimo = { blob, width: w, height: h, rotation };
    if (blob.size <= LIMITE) return ultimo;
  }

  // Ni en la medida más chica cupo: se entrega tal cual antes que quedarse sin plano.
  return ultimo;
}
