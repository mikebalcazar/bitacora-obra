import { fileUrl, fmtD, fmtT, isLate, ST, ROLES } from './api.js';

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Recorte del plano alrededor del elemento → dataURL (canvas)
const imgCache = {};
function loadImg(src) {
  if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  return imgCache[src];
}
async function crop(planKey, pw, ph, x, y, code) {
  try {
    const img = await loadImg(fileUrl(planKey));
    const W = 520, H = 330;                         // px de salida
    const cw = Math.max(pw * 0.22, 400), ch = cw * H / W; // ventana ≈ 22% del ancho del plano
    const cx = x * pw, cy = y * ph;
    let sx = cx - cw / 2, sy = cy - ch / 2;
    sx = Math.max(0, Math.min(pw - cw, sx)); sy = Math.max(0, Math.min(ph - ch, sy));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.drawImage(img, sx, sy, cw, ch, 0, 0, W, H);
    const k = W / cw, px = (cx - sx) * k, py = (cy - sy) * k;
    g.strokeStyle = '#D33A2F'; g.lineWidth = 4; g.beginPath(); g.arc(px, py, 22, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#D33A2F'; g.font = '600 14px Instrument Sans, sans-serif'; g.textAlign = 'center'; g.fillText(code, px, py - 30);
    return c.toDataURL('image/jpeg', 0.85);
  } catch { return null; }
}

// Devuelve HTML del reporte (páginas .page) para mostrar en <ReportView>
export async function buildReport({ project, plans, elements, logs, punch, user, opts }) {
  const { type, scope, status, from, to, dest, planId, elementId } = opts;
  const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
  const inScope = (r) => scope === 'proj' ? true : scope === 'plano' ? r.plan_id === planId : r.element_id === elementId;
  const inDates = (iso) => (!from || iso >= from) && (!to || iso.slice(0, 10) <= to);
  const scopeName = scope === 'proj' ? 'Todo el proyecto' : scope === 'plano' ? planById[planId]?.name : (() => { const e = elements.find((x) => x.id === elementId); return e ? `${e.code} · ${e.name}` : ''; })();
  const title = type === 'bitacora' ? 'Reporte de bitácora' : type === 'punch' ? 'Reporte de punchlist' : 'Reporte de bitácora y punchlist';
  const today = new Date();
  const folio = `R-${today.toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 90) + 10)}`;
  const head = `<div class="ph-head"><span>${esc(project.name).toUpperCase()} · ${esc(scopeName).toUpperCase()}</span><b>FORESPOT</b></div>`;
  const foot = `<div class="ph-foot"><span>Elaboró ${esc(user.name)}</span><span class="pn"></span><span>Folio ${folio}</span></div>`;
  const fig = (p) => `<figure><div class="ph"><img src="${fileUrl(p.r2_key)}" alt=""></div><figcaption>${esc(p.file_name || 'foto')}<br><b>${esc(p.user_name || '')}</b><br>${fmtD(p.created_at)} ${fmtT(p.created_at)}</figcaption></figure>`;
  const pages = [];

  let L = [], K = [];
  if (type !== 'punch') L = logs.filter((l) => inScope(l) && inDates(l.created_at));
  if (type !== 'bitacora') { K = punch.filter(inScope); if (status === 'abiertos') K = K.filter((k) => k.status !== 'ok'); }

  // Portada / índice
  let idx = `<header><div><div class="eyebrow">${esc(project.name)}${project.client ? ' · ' + esc(project.client) : ''}</div><h1>${title}</h1><div class="sub">${esc(scopeName)}${from || to ? ` · ${from ? fmtD(from) : '…'} — ${to ? fmtD(to) : 'hoy'}` : ''}</div></div>
    <div class="r"><b>FORESPOT</b>Folio ${folio}<br>Emitido ${fmtD(today.toISOString())}<br>Supervisión: ${esc(user.name)}${dest ? '<br>Para: ' + esc(dest) : ''}</div></header>`;
  if (type !== 'punch') {
    const byEl = groupBy(L, 'element_id');
    idx += `<h3>Bitácora <span>${Object.keys(byEl).length} elementos · ${L.length} registros</span></h3>
    <div class="sum"><span><b>${L.length}</b> registros</span><span><b>${L.filter((m) => m.kind === 'acuerdo').length}</b> acuerdos</span><span><b>${L.filter((m) => m.kind === 'arreglo').length}</b> arreglos</span><span><b>${L.reduce((a, m) => a + m.photos.length, 0)}</b> fotos</span></div>
    <table><thead><tr><th>Elemento</th><th>Plano</th><th>Registros</th><th>Último</th></tr></thead><tbody>${Object.values(byEl).map((ms) => `<tr><td><b>${esc(ms[0].element_code)}</b> ${esc(ms[0].element_name)}</td><td>${esc(ms[0].plan_name)}</td><td>${ms.length}</td><td>${fmtD(ms[ms.length - 1].created_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin registros en el periodo.</td></tr>'}</tbody></table>`;
  }
  if (type !== 'bitacora') {
    const late = K.filter(isLate).length;
    idx += `<h3>Punchlist <span>${K.length} detalles${status === 'abiertos' ? ' abiertos' : ''}</span></h3>
    <div class="sum"><span><b>${K.filter((k) => k.status === 'pend').length}</b> pendientes</span><span><b>${K.filter((k) => k.status === 'proc').length}</b> en proceso</span><span><b>${K.filter((k) => k.status === 'ok').length}</b> resueltos</span><span><b style="color:${late ? '#D33A2F' : 'inherit'}">${late}</b> vencidos</span></div>
    <table><thead><tr><th>#</th><th>Detalle</th><th>Elemento</th><th>Estado</th><th>Responsable</th><th>Límite</th></tr></thead><tbody>${K.map((k, i) => `<tr><td>${i + 1}</td><td>${esc(k.title)}</td><td>${esc(k.element_code)} · ${esc(k.plan_name)}</td><td><span class="pill ${k.status}">${ST[k.status]}</span>${isLate(k) ? ' <span class="pill late">Vencido</span>' : ''}</td><td>${esc(k.resp)}</td><td>${fmtD(k.due_date)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sin detalles.</td></tr>'}</tbody></table>`;
  }
  idx += `<footer><div>Elaboró<br><b>${esc(user.name)}</b> · FORESPOT</div><div>Recibió<br><b>${esc(dest) || '________________________'}</b></div></footer>`;
  pages.push(idx);

  // Fichas bitácora: una por elemento
  for (const ms of Object.values(groupBy(L, 'element_id'))) {
    const m0 = ms[0];
    const c = await crop(m0.image_key, m0.plan_w, m0.plan_h, m0.x, m0.y, m0.element_code);
    pages.push(`${head}<h2 class="ft"><span class="num">${esc(m0.element_code)}</span>${esc(m0.element_name)}</h2>
      <div class="ficha"><div class="fields">
        <div><label>Tipo</label>${esc(m0.element_type)}</div><div><label>Responsable</label>${esc(m0.element_resp)}</div><div><label>Registros</label>${ms.length}</div>
        <div><label>Plano</label>${esc(m0.plan_name)}</div><div><label>Periodo</label>${fmtD(ms[0].created_at)} — ${fmtD(ms[ms.length - 1].created_at)}</div><div><label>Acuerdos</label>${ms.filter((m) => m.kind === 'acuerdo').length}</div>
      </div><div class="sheetcrop"><label>Ubicación · ${esc(m0.plan_file || m0.plan_name)}</label>${c ? `<img class="crop" src="${c}" alt="">` : ''}</div></div>
      <label class="sec">Historial</label>
      ${ms.map((m) => `<div class="entry"><div class="et"><time>${fmtD(m.created_at)} · ${fmtT(m.created_at)}</time><b>${esc(m.user_name)}</b><span>${ROLES[m.user_role] || 'Supervisor'}</span><span class="pill ${m.kind === 'acuerdo' ? 'acu' : 'gen'}">${m.kind}</span></div><p>${esc(m.text)}</p>${m.photos.length ? `<div class="big">${m.photos.map(fig).join('')}</div>` : ''}</div>`).join('')}
      ${foot}`);
  }
  // Fichas punchlist: una por detalle
  let i = 0;
  for (const k of K) {
    i++;
    const c = await crop(k.image_key, k.plan_w, k.plan_h, k.x, k.y, k.element_code);
    pages.push(`${head}<h2 class="ft"><span class="num">#${i}</span>${esc(k.title)}</h2>
      <div class="ficha"><div class="fields">
        <div><label>Estado</label><span class="pill ${k.status}">${ST[k.status]}</span>${isLate(k) ? ' <span class="pill late">Vencido</span>' : ''}</div><div><label>Elemento</label>${esc(k.element_code)} · ${esc(k.element_name)}</div><div><label>Responsable</label>${esc(k.resp)}</div>
        <div><label>Ubicación</label>${esc(k.plan_name)}</div><div><label>Fecha límite</label>${fmtD(k.due_date)}</div><div><label>${k.status === 'ok' ? 'Resuelto' : 'Registrado'}</label>${fmtD(k.status === 'ok' ? k.done_at : k.created_at)}</div>
        ${k.description ? `<div style="grid-column:1/-1"><label>Descripción</label>${esc(k.description)}</div>` : ''}
      </div><div class="sheetcrop"><label>Plano · ${esc(k.plan_file || k.plan_name)}</label>${c ? `<img class="crop" src="${c}" alt="">` : ''}</div></div>
      <label class="sec">Fotos</label>
      ${k.photos.length ? `<div class="big">${k.photos.map(fig).join('')}</div>` : '<p class="muted">Sin fotografías de respaldo.</p>'}
      ${foot}`);
  }
  const html = pages.map((p, n) => `<div class="page">${p.replace('<span class="pn"></span>', `<span>${n + 1} / ${pages.length}</span>`)}</div>`).join('');
  window.dispatchEvent(new CustomEvent('bo:report', { detail: { html, title } }));
}

function groupBy(arr, k) { const o = {}; for (const x of arr) (o[x[k]] ||= []).push(x); return o; }

export const REPORT_CSS = `
.report{position:fixed;inset:0;background:var(--bg);z-index:25;overflow:auto}
.rbar{position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:10px;align-items:center;z-index:2;padding-top:calc(10px + var(--sat))}
.sheet{width:210mm;max-width:100%;margin:0 auto;font-size:12px;color:#141C26}
.page{background:#fff;min-height:297mm;margin:16px 0;padding:14mm 14mm 12mm;box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column;break-after:page}
.page .muted{color:#7A8593}
.ph-head{display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:600;color:#7A8593;letter-spacing:.04em;margin-bottom:20px}
.ph-head b{font-size:13px;color:#141C26;letter-spacing:.08em}
.ph-foot{margin-top:auto;padding-top:14px;display:flex;justify-content:space-between;font-size:10px;color:#7A8593}
.page header{display:grid;grid-template-columns:1fr auto;border-bottom:3px solid #141C26;padding-bottom:10px;margin-bottom:16px;gap:12px}
.page header h1{font-size:22px;line-height:1.1}
.page header .sub{color:#4A5563;margin-top:4px}
.page header .r{text-align:right;font-size:11px;line-height:1.5;color:#4A5563}
.page header .r b{display:block;font-size:16px;color:#141C26}
.page h3{font-size:15px;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid #D5D9DE;display:flex;justify-content:space-between}
.page h3 span{font-size:11px;font-weight:400;color:#7A8593}
.page table{width:100%;border-collapse:collapse;font-size:11.5px}
.page th{text-align:left;font-size:11px;font-weight:500;color:#7A8593;padding:5px 6px;border-bottom:1px solid #D5D9DE}
.page td{padding:6px;border-bottom:1px solid #E6E9ED;vertical-align:top}
.page .sum{display:flex;gap:18px;margin-bottom:6px;font-size:12px;flex-wrap:wrap}
.page .sum b{font-size:16px;font-weight:600}
.page footer{margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:30px;font-size:11px;color:#4A5563}
.page footer div{border-top:1px solid #141C26;padding-top:6px}
.page .pill.pend{background:#FBE3E1;color:#D33A2F}.page .pill.proc{background:#FBF0D3;color:#8A6209}.page .pill.ok{background:#DDF1E4;color:#2E8B57}.page .pill.acu{background:#E4EAF2;color:#3F5F85}.page .pill.gen{background:#E6E9ED;color:#4A5563}
.ft{font-size:17px;font-weight:600;margin:0 0 14px;display:flex;gap:8px;align-items:baseline}
.ft .num{color:#7A8593;font-weight:500}
.ficha{display:grid;grid-template-columns:1fr 190px;gap:20px;align-items:start;margin-bottom:18px}
.fields{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 16px;font-size:12.5px}
.fields label,.sheetcrop label,label.sec{display:block;font-size:11px;font-weight:600;color:#141C26;margin-bottom:3px}
label.sec{font-size:12px;margin:6px 0 8px}
.crop{width:100%;aspect-ratio:520/330;border:1px solid #D5D9DE;display:block;object-fit:cover}
.entry{border-top:1px solid #E6E9ED;padding:9px 0}
.entry .et{display:flex;gap:10px;align-items:baseline;font-size:11px;color:#7A8593;flex-wrap:wrap}
.entry .et b{color:#141C26;font-size:12px}
.entry p{margin:3px 0 0;white-space:pre-wrap}
.big{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:8px 0 6px}
.big figure{margin:0}
.big .ph{width:100%;height:auto;aspect-ratio:4/3;border-radius:2px;border:1px solid #D5D9DE;cursor:default;overflow:hidden}
.big .ph img{width:100%;height:100%;object-fit:cover}
.big figcaption{font-size:9.5px;color:#7A8593;margin-top:4px;line-height:1.35}
.big figcaption b{color:#141C26}
@media (max-width:600px){.ficha{grid-template-columns:1fr}.fields{grid-template-columns:1fr 1fr}.page{padding:16px 14px;min-height:0}}
@media print{@page{size:A4;margin:0}body{background:#fff}.app,.ov,.toast,.rbar{display:none!important}.report{position:static;overflow:visible;background:#fff}.sheet{width:auto;max-width:none}.page{box-shadow:none;margin:0;min-height:297mm;padding:14mm}}
`;
