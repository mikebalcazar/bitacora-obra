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

// Plano: PDF (pág. 1) o imagen → PNG/JPEG rasterizado ~2600 px
export async function rasterizePlan(file) {
  const TARGET = 2600;
  let canvas;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = TARGET / Math.max(vp1.width, vp1.height);
    const vp = page.getViewport({ scale });
    canvas = document.createElement('canvas'); canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } else {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, TARGET / Math.max(bmp.width, bmp.height));
    canvas = document.createElement('canvas'); canvas.width = Math.round(bmp.width * s); canvas.height = Math.round(bmp.height * s);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  }
  let blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (blob.size > 4 * 1024 * 1024) blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  return { blob, width: canvas.width, height: canvas.height };
}
