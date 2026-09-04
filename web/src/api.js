import { pdfjs, esPdf } from './pdf.js';
// Cliente API — cookies de sesión (HttpOnly). Fallback bearer para PWA en iOS si la cookie se pierde.
const TOKEN_KEY = 'bo_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

async function call(method, path, body, isForm = false) {
  const headers = {};
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body && !isForm) headers['content-type'] = 'application/json';
  const r = await fetch('/api' + path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
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

// URL de archivo R2 (misma origin, cookie). Si hay token bearer y no cookie, se agrega ?t= para <img>.
export const fileUrl = (key) => `/files/${key}`;

// ---------- utilidades ----------
export const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
export const fmtT = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDay = (iso) => new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
export const isLate = (k) => k.status !== 'ok' && k.due_date && new Date(k.due_date + 'T23:59:59') < new Date();
export const ini = (n = '') => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
export const ST = { pend: 'Pendiente', proc: 'En proceso', ok: 'Resuelto' };
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
  const MEDIDAS = [5000, 4000, 3200, 2600];
  const LIMITE = 8 * 1024 * 1024;
  // Safari en iPhone no dibuja lienzos de más de 16.7 millones de píxeles: se
  // queda en blanco sin avisar. Por eso el área también manda, no solo el lado.
  const AREA_MAX = 16 * 1024 * 1024;
  const pdf = file.type === 'application/pdf' || esPdf(file.name);
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
