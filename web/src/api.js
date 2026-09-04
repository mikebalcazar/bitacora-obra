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
  if (!r.ok) { const e = new Error(data.error || `Error ${r.status}`); e.status = r.status; throw e; }
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

// Un fallo de red es "no hubo forma de llegar", no "el servidor dijo que no".
// El segundo no se guarda para reintentar: reintentarlo daría lo mismo.
const esFalloDeRed = (e) => !e || !e.status;

// Leer: la red manda, y lo guardado es la red de abajo.
export async function leer(ruta, { soloCache = false } = {}) {
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
  const guardado = await local.lee(ruta);
  if (guardado) { avisa({ deCache: true }); return { ...guardado, __deCache: true, __cuando: await local.cuando(ruta) }; }
  throw new Error(hayRed() ? 'No se pudo cargar.' : 'Sin señal y sin copia guardada de esto todavía.');
}

// Escribir: se intenta subir; si no se puede, se guarda para después. Las fotos
// se guardan tal cual —IndexedDB sí guarda archivos— y se vuelven a armar al
// subirlas.
export async function escribir({ metodo = 'POST', ruta, cuerpo = null, campos = null, archivos = null, parche = null }) {
  // El identificador se hace aquí, no en el servidor, y viaja con la operación.
  // Si la señal se cae justo al terminar de subir, nadie sabe si llegó: al
  // reintentar, el servidor reconoce el identificador y no la repite. Sin esto,
  // una foto subida con mala señal terminaría apareciendo tres veces.
  const idOp = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  if (campos || archivos) campos = { ...(campos || {}), op_id: idOp };
  else cuerpo = { ...(cuerpo || {}), op_id: idOp };

  const subir = async () => {
    if (campos || archivos) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(campos || {})) fd.append(k, v);
      for (const f of archivos || []) fd.append('photos', f);
      return await call('POST', ruta, fd, true);
    }
    return await call(metodo, ruta, cuerpo);
  };

  if (hayRed()) {
    try { const r = await subir(); avisa(); return { ok: true, subido: true, r }; }
    catch (e) { if (!esFalloDeRed(e)) throw e; }
  }

  const op = { id: idOp, metodo, ruta, cuerpo, campos, archivos, creado: Date.now() };
  await local.encola(op);
  // Que se vea enseguida, aunque no haya subido: para quien lo escribió ya está
  // hecho, y volver a pedírselo cuando haya señal es la manera segura de que no
  // lo vuelva a hacer.
  if (parche) await local.parchea(parche.clave, parche.fn);
  avisa();
  return { ok: true, subido: false, id: op.id };
}

// Vaciar la fila, en orden. Lo que el servidor rechaza de plano se saca de la
// fila: reintentarlo eternamente solo la tapa.
let vaciando = false;
export async function vaciaFila() {
  if (vaciando || !hayRed()) return { subidas: 0, rechazadas: 0 };
  vaciando = true;
  let subidas = 0, rechazadas = 0, ultimoError = null;
  try {
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
        if (esFalloDeRed(e)) break;             // se fue la señal otra vez: mañana será
        await local.desencola(op.id);           // el servidor dijo que no
        rechazadas++; ultimoError = e.message;
      }
    }
  } finally {
    vaciando = false;
    avisa({ ultimoError });
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
export const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
export const fmtT = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
export const isLate = (k) => k.status !== 'ok' && k.due_date && new Date(k.due_date + 'T23:59:59') < new Date();
export const ini = (n = '') => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
export const ST = { pend: 'Pendiente', proc: 'En proceso', ok: 'Resuelto' };

// Los tres roles, con el nombre que se usa en obra.
export const ROLES = { admin: 'Dueño', int: 'Supervisor', con: 'Contratista' };
export const esDueno = (u) => u?.role === 'admin';
export const esContratista = (u) => u?.role === 'con';
export const dirige = (u) => u?.role === 'admin' || u?.role === 'int';
export const elStatus = (e) => (!e.n_total ? 'none' : e.n_pend ? 'pend' : e.n_proc ? 'proc' : 'ok');
export const todayISO = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };

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
export async function rasterizePlan(file) {
  const LIMITE = 8 * 1024 * 1024;
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
    const vp = pagina.getViewport({ scale: 1 });
    ancho1 = vp.width; alto1 = vp.height;
  } else {
    bitmap = await createImageBitmap(file);
    ancho1 = bitmap.width; alto1 = bitmap.height;
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
    if (pdf) await pagina.render({ canvasContext: ctx, viewport: pagina.getViewport({ scale: escala }) }).promise;
    else ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise((res) => lienzo.toBlob(res, 'image/png'));
    if (!blob) continue;
    ultimo = { blob, width: w, height: h };
    if (blob.size <= LIMITE) return ultimo;
  }

  // Ni en la medida más chica cupo: se entrega tal cual antes que quedarse sin plano.
  return ultimo;
}
