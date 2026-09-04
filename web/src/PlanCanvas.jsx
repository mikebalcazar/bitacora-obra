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
  // leer una cota lo que crece son sus píxeles y no se distingue nada. Si el
  // plano llegó en PDF, el original sigue guardado, así que encima de la imagen
  // se dibuja la página del PDF a la escala a la que se está viendo: al ser
  // dibujo y no fotografía, las líneas y la letra salen limpias a cualquier
  // acercamiento. El lienzo mide lo que la pantalla, no lo que el plano, así
  // que acercarse no cuesta más memoria.
  const lienzo = useRef(null);
  const pagina = useRef(null);
  const tarea = useRef(null);
  const [listo, setListo] = useState(null);   // la vista con la que se dibujó lo que hay pintado
  const [tam, setTam] = useState({ w: 0, h: 0 });

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
    setListo(null);
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
        setListo(null);
        dibujaNitido();
      } catch { /* se queda el plano rasterizado */ }
    })();
    return () => { vivo = false; tarea.current?.cancel(); doc?.destroy?.(); };
  }, [plan.id, plan.source_key]);

  // Redibujar cuando la vista se queda quieta: mientras se arrastra o se hace
  // pinza se estira lo ya pintado, que es instantáneo, y al soltar entra la
  // versión nítida.
  useEffect(() => {
    if (!pagina.current || !tam.w) return;
    const t = setTimeout(dibujaNitido, 140);
    return () => clearTimeout(t);
  }, [v.x, v.y, v.s, tam.w, tam.h]);

  async function dibujaNitido() {
    const p = pagina.current, b = box.current, c = lienzo.current;
    if (!p || !b || !c) return;
    const vista = { ...v };
    const punto = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(b.clientWidth * punto), h = Math.round(b.clientHeight * punto);
    if (!w || !h) return;

    // Se pinta aparte y se copia de golpe: así nunca se ve el plano en blanco
    // mientras el PDF se dibuja.
    const aparte = document.createElement('canvas');
    aparte.width = w; aparte.height = h;
    const ctx = aparte.getContext('2d');
    const base = p.getViewport({ scale: 1 });
    const escala = (plan.width / base.width) * vista.s * punto;
    if (!(escala > 0) || !Number.isFinite(escala)) return;

    tarea.current?.cancel();
    const t = p.render({
      canvasContext: ctx,
      viewport: p.getViewport({ scale: escala }),
      transform: [1, 0, 0, 1, vista.x * punto, vista.y * punto],
    });
    tarea.current = t;
    try { await t.promise; } catch { return; }          // cancelada: llega otra en camino
    if (tarea.current !== t || !lienzo.current) return;

    c.width = w; c.height = h;
    c.getContext('2d').drawImage(aparte, 0, 0);
    setListo(vista);
  }

  // Mientras no llega el redibujado, lo pintado se mueve y se estira con el
  // plano: el desfase nunca se ve.
  const desfase = listo
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
