import React, { useEffect, useRef, useState } from 'react';
import { fileUrl, elStatus } from './api.js';

// Plano rasterizado + pines. Pan (arrastrar), zoom (rueda / pinch), tap para elegir.
export default function PlanCanvas({ plan, elements, sel, flash, adding, onPick, onClick }) {
  const box = useRef(null);
  const [v, setV] = useState({ x: 0, y: 0, s: 1 });
  const [drag, setDrag] = useState(false);
  const ptrs = useRef(new Map());
  const start = useRef(null);
  const moved = useRef(false);

  const fit = () => {
    const b = box.current; if (!b || !plan.width) return;
    const pad = 24;
    const s = Math.min((b.clientWidth - pad * 2) / plan.width, (b.clientHeight - pad * 2 - 40) / plan.height);
    setV({ s, x: (b.clientWidth - plan.width * s) / 2, y: (b.clientHeight - plan.height * s) / 2 + 20 });
  };
  useEffect(() => { fit(); const ro = new ResizeObserver(fit); ro.observe(box.current); return () => ro.disconnect(); }, [plan.id]);

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
      <div className="world" style={{ transform: `translate(${v.x}px,${v.y}px) scale(${v.s})` }}>
        <img src={fileUrl(plan.image_key)} width={plan.width} height={plan.height} alt={plan.name} draggable={false} />
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
