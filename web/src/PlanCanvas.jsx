import React, { useEffect, useRef, useState } from 'react';
import { fileUrl, elStatus } from './api.js';
import { pdfjs, esPdf } from './pdf.js';

// Plano rasterizado + pines. Pan (arrastrar), zoom (rueda / pinch), tap para elegir.
export default function PlanCanvas({ plan, elements, sel, flash, adding, onPick, onClick }) {
  const box = useRef(null);
  const [v, setV] = useState({ x: 0, y: 0, s: 1 });
  const [drag, setDrag] = useState(false);
  const ptrs = useRef(new Map());
  const start = useRef(null);
  const moved = useRef(false);

  // ── capa nítida ──────────────────────────────────────────────────────────
  // La imagen del plano es una sola, del tamaño que se subió: al acercarse a
  // leer una cota lo que crece son sus píxeles. Si el plano llegó en PDF, el
  // original sigue guardado, así que encima de la imagen se dibuja la página a
  // la escala a la que se está viendo, y las líneas y la letra salen limpias.
  //
  // El lienzo mide lo que la pantalla, nunca lo que el plano. Y la escala tiene
  // tope: pedirle a pdf.js una página de cien mil píxeles de ancho —que es lo
  // que sale de un plano grande a 12 aumentos— deja al navegador sin memoria y
  // mata la pestaña. Pasado el tope se dibuja a la escala máxima y se estira lo
  // que falte: se ve apenas más suave, pero no se cae.
  const PAGINA_MAX = 14000;   // px del lado largo de la página dibujada
  const lienzo = useRef(null);
  const aparte = useRef(null);
  const pagina = useRef(null);
  const tarea = useRef(null);
  const [listo, setListo] = useState(null);   // la vista con la que se pintó lo que se ve
  const [falla, setFalla] = useState(false);  // si el dibujado truena, se deja de intentar
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [quieto, setQuieto] = useState(0);    // sube al soltar: redibuja al terminar el gesto

  const fit = () => {
    const b = box.current; if (!b || !plan.width) return;
    const pad = 24;
    const s = Math.min((b.clientWidth - pad * 2) / plan.width, (b.clientHeight - pad * 2 - 40) / plan.height);
    setV({ s, x: (b.clientWidth - plan.width * s) / 2, y: (b.clientHeight - plan.height * s) / 2 + 20 });
  };
  const mide = () => { const b = box.current; if (b) setTam({ w: b.clientWidth, h: b.clientHeight }); };
  useEffect(() => {
    fit(); mide();
    const ro = new ResizeObserver(() => { fit(); mide(); });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [plan.id]);

  // Abrir el PDF original del plano, si lo hay. Si falla —no era PDF, ya no
  // está el archivo, el navegador no puede— no se avisa ni se rompe nada: se
  // queda la imagen de siempre.
  useEffect(() => {
    setListo(null); setFalla(false);
    pagina.current = null;
    if (!plan.source_key || !esPdf(plan.file_name || plan.source_key)) return;
    let vivo = true;
    let doc;
    (async () => {
      try {
        const lib = await pdfjs();
        doc = await lib.getDocument({ url: fileUrl(plan.source_key), withCredentials: true }).promise;
        const p = await doc.getPage(1);
        if (!vivo) return;
        pagina.current = p;
        setQuieto((n) => n + 1);
      } catch { /* se queda el plano rasterizado */ }
    })();
    return () => {
      vivo = false;
      try { tarea.current?.cancel(); } catch {}
      tarea.current = null;
      pagina.current = null;
      doc?.destroy?.();
      // Soltar los lienzos a la mala: en el celular la memoria de video no se
      // libera sola nada más con dejar de apuntarlos.
      for (const ref of [lienzo, aparte]) if (ref.current) { ref.current.width = 0; ref.current.height = 0; }
      aparte.current = null;
    };
  }, [plan.id, plan.source_key]);

  // Redibujar cuando la vista se queda quieta. Mientras el dedo está encima se
  // estira lo ya pintado —instantáneo— y al soltar entra la versión nítida.
  useEffect(() => {
    if (!pagina.current || falla || !tam.w) return;
    const t = setTimeout(() => { if (!ptrs.current.size) dibujaNitido(); }, 180);
    return () => clearTimeout(t);
  }, [v.x, v.y, v.s, tam.w, tam.h, quieto, falla]);

  async function dibujaNitido() {
    const p = pagina.current, b = box.current, c = lienzo.current;
    if (!p || !b || !c || falla) return;
    const vista = { ...v };
    const punto = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(b.clientWidth * punto), h = Math.round(b.clientHeight * punto);
    if (!w || !h) return;

    const base = p.getViewport({ scale: 1 });
    const deseada = (plan.width / base.width) * vista.s * punto;
    if (!(deseada > 0) || !Number.isFinite(deseada)) return;
    // Cuánto hay que estirar después, si la escala que tocaba pasa del tope.
    const tope = PAGINA_MAX / Math.max(base.width, base.height);
    const estirar = deseada > tope ? deseada / tope : 1;
    const escala = deseada / estirar;
    const aw = Math.max(1, Math.round(w / estirar)), ah = Math.max(1, Math.round(h / estirar));

    // Un solo lienzo de trabajo, reaprovechado: pintar aparte y copiar de golpe
    // evita que el plano parpadee en blanco mientras el PDF se dibuja.
    if (!aparte.current) aparte.current = document.createElement('canvas');
    const off = aparte.current;
    if (off.width !== aw || off.height !== ah) { off.width = aw; off.height = ah; }
    const ctx = off.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, aw, ah);

    try { tarea.current?.cancel(); } catch {}
    let t;
    try {
      t = p.render({
        canvasContext: ctx,
        viewport: p.getViewport({ scale: escala }),
        transform: [1, 0, 0, 1, (vista.x * punto) / estirar, (vista.y * punto) / estirar],
      });
      tarea.current = t;
      await t.promise;
    } catch (e) {
      // Cancelada porque ya viene otra: normal, no pasa nada. Cualquier otra
      // cosa —memoria, un PDF que pdf.js no puede— apaga la capa nítida y deja
      // el plano de siempre, en vez de tumbar la pestaña.
      if (e && e.name === 'RenderingCancelledException') return;
      setFalla(true);
      return;
    }
    if (tarea.current !== t || !lienzo.current) return;

    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const dst = c.getContext('2d');
    dst.setTransform(1, 0, 0, 1, 0, 0);
    dst.clearRect(0, 0, w, h);
    dst.drawImage(off, 0, 0, aw, ah, 0, 0, w, h);
    setListo(vista);
  }

  // Mientras no llega el redibujado, lo pintado se mueve y se estira con el
  // plano: el desfase nunca se ve.
  const desfase = listo && !falla
    ? { k: v.s / listo.s, x: v.x - listo.x * (v.s / listo.s), y: v.y - listo.y * (v.s / listo.s) }
    : null;

  function toWorld(cx, cy) {
    const r = box.current.getBoundingClientRect();
    return { x: (cx - r.left - v.x) / v.s, y: (cy - r.top - v.y) / v.s };
  }
  function zoomAt(cx, cy, factor) {
    const r = box.current.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    setV((o) => { const s = Math.min(12, Math.max(0.05, o.s * factor)); const k = s / o.s; return { s, x: px - (px - o.x) * k, y: py - (py - o.y) * k }; });
  }

  const onWheel = (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); };
  const onDown = (e) => {
    box.current.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (ptrs.current.size === 1) start.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; start.current = { pinch: Math.hypot(a.x - b.x, a.y - b.y), s: v.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: v.x, vy: v.y }; }
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && start.current?.pinch) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = d / start.current.pinch;
      const s = Math.min(12, Math.max(0.05, start.current.s * k));
      const r = box.current.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const kk = s / start.current.s;
      setV({ s, x: mx - (start.current.mx - r.left - start.current.vx) * kk, y: my - (start.current.my - r.top - start.current.vy) * kk });
      moved.current = true;
      return;
    }
    if (ptrs.current.size === 1 && start.current && !start.current.pinch) {
      const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { moved.current = true; setDrag(true); }
      if (moved.current) setV((o) => ({ ...o, x: start.current.vx + dx, y: start.current.vy + dy }));
    }
  };
  const onUp = (e) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) {
      setDrag(false);
      if (!moved.current && e.target === box.current || (!moved.current && e.target.classList.contains('world')) || (!moved.current && e.target.tagName === 'IMG')) {
        const w = toWorld(e.clientX, e.clientY);
        if (w.x >= 0 && w.y >= 0 && w.x <= plan.width && w.y <= plan.height) onClick(w.x / plan.width, w.y / plan.height);
      }
      start.current = null;
      setQuieto((n) => n + 1);
    }
  };

  return (
    <div ref={box} className={'canvas' + (adding ? ' adding' : '') + (drag ? ' dragging' : '')} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="capa" style={{ transform: `translate(${v.x}px,${v.y}px) scale(${v.s})` }}>
        <img src={fileUrl(plan.image_key)} width={plan.width} height={plan.height} alt={plan.name} draggable={false} />
      </div>
      <canvas
        ref={lienzo}
        className="nitido"
        style={{
          width: tam.w, height: tam.h,
          opacity: desfase ? 1 : 0,
          transform: desfase ? `translate(${desfase.x}px,${desfase.y}px) scale(${desfase.k})` : 'none',
        }}
      />
      <div className="world" style={{ transform: `translate(${v.x}px,${v.y}px) scale(${v.s})` }}>
        {elements.map((e) => {
          const n = e.n_pend + e.n_proc;
          return (
            <div key={e.id} className={'pin ' + elStatus(e) + (e.id === sel ? ' sel' : '') + (flash && e.id === sel ? ' flash' : '')}
              style={{ left: e.x * plan.width, top: e.y * plan.height, transform: `translate(-50%,-50%) scale(${1 / v.s})` }}
              onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); if (!adding) onPick(e.id); }} title={`${e.code} · ${e.name}`}>
              {n || ''}<span>{e.code}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', right: 12, bottom: 'calc(12px + var(--sab))', display: 'flex', flexDirection: 'column', gap: 6, zIndex: 3 }}>
        <button className="btn sm" onClick={() => { const r = box.current.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.3); }}>+</button>
        <button className="btn sm" onClick={() => { const r = box.current.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.3); }}>−</button>
        <button className="btn sm" onClick={fit} title="Ajustar">⊡</button>
      </div>
    </div>
  );
}
