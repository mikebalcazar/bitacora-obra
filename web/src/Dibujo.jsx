import React, { useEffect, useRef, useState } from 'react';

/* Un dibujo a mano para la bitácora (Mike, 9-oct-2026: «quiero poder hacer
 * un dibujo bitmap adicional a agregar imagen o tomar foto para anotaciones
 * de la bitácora. Un cuadro de 1000x1000 pixeles y un par de pinceles y
 * opción a colores»).
 *
 * El lienzo mide SIEMPRE 1000×1000 por dentro; en la pantalla se ve del
 * ancho que quepa y cada punto del dedo se lleva a esa escala. Al terminar
 * sale un PNG que entra a la fila de fotos por subir como cualquier otra,
 * así que viaja igual, también sin señal.
 *
 * Los trazos se guardan como lista (no como copias del lienzo): «Deshacer»
 * vuelve a pintar todo sin el último, y diez copias de 1000×1000 serían
 * 40 MB en un celular de obra. «Borrar todo» también es un paso, y también
 * se deshace. */

export const LADO = 1000;
export const PINCELES = [
  { clave: 'fino', nombre: 'Fino', ancho: 5 },
  { clave: 'grueso', nombre: 'Grueso', ancho: 18 },
  { clave: 'borrador', nombre: 'Borrador', ancho: 44, borra: true },
];
export const COLORES = ['#1d1d1f', '#d33a2f', '#2563eb', '#2e8b57', '#f59e0b', '#7c3aed'];
const FONDO = '#ffffff';

/** Un nombre para el dibujo: dibujo-AAAAMMDD-HHMMSS.png */
export function nombreDeDibujo(cuando = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `dibujo-${cuando.getFullYear()}${p(cuando.getMonth() + 1)}${p(cuando.getDate())}-${p(cuando.getHours())}${p(cuando.getMinutes())}${p(cuando.getSeconds())}.png`;
}

function pintaTrazo(ctx, t) {
  if (t.limpia) { ctx.fillStyle = FONDO; ctx.fillRect(0, 0, LADO, LADO); return; }
  const pts = t.puntos;
  ctx.strokeStyle = t.borra ? FONDO : t.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = t.ancho;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    // Un toque sin arrastrar deja un punto, no nada.
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], t.ancho / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

export function Dibujo({ onListo, onCerrar }) {
  const lienzo = useRef(null);
  const trazos = useRef([]);
  const actual = useRef(null);
  const [n, setN] = useState(0); // cuántos pasos hay: sólo para pintar los botones
  const [pincel, setPincel] = useState(PINCELES[0].clave);
  const [color, setColor] = useState(COLORES[0]);
  const [guardando, setGuardando] = useState(false);
  const p = PINCELES.find((x) => x.clave === pincel);

  const ctx = () => lienzo.current.getContext('2d');
  const repinta = () => {
    const c = ctx();
    c.fillStyle = FONDO; c.fillRect(0, 0, LADO, LADO);
    for (const t of trazos.current) pintaTrazo(c, t);
  };
  useEffect(() => { repinta(); }, []);

  // Del dedo (pixeles de pantalla) al lienzo (1000×1000).
  const punto = (ev) => {
    const r = lienzo.current.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * LADO, ((ev.clientY - r.top) / r.height) * LADO];
  };
  const baja = (ev) => {
    if (ev.button !== undefined && ev.button > 0) return;
    ev.preventDefault();
    lienzo.current.setPointerCapture?.(ev.pointerId);
    actual.current = { color, ancho: p.ancho, borra: !!p.borra, puntos: [punto(ev)] };
    pintaTrazo(ctx(), actual.current);
  };
  const mueve = (ev) => {
    const t = actual.current;
    if (!t) return;
    ev.preventDefault();
    // Los movimientos que el navegador juntó entre cuadro y cuadro: sin
    // ellos, un trazo rápido con el dedo sale en rectas.
    const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
    const c = ctx();
    for (const e of (evs.length ? evs : [ev])) {
      const q = punto(e);
      const [x0, y0] = t.puntos[t.puntos.length - 1];
      t.puntos.push(q);
      c.strokeStyle = t.borra ? FONDO : t.color;
      c.lineWidth = t.ancho; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(q[0], q[1]); c.stroke();
    }
  };
  const sube = () => {
    if (!actual.current) return;
    trazos.current.push(actual.current);
    actual.current = null;
    setN(trazos.current.length);
  };

  const deshacer = () => { trazos.current.pop(); setN(trazos.current.length); repinta(); };
  const limpiar = () => { trazos.current.push({ limpia: true }); setN(trazos.current.length); repinta(); };
  // Hay algo que agregar si el último paso no fue «Borrar todo».
  const hayDibujo = n > 0 && !trazos.current[n - 1].limpia;

  async function listo() {
    setGuardando(true);
    try {
      const blob = await new Promise((res) => lienzo.current.toBlob(res, 'image/png'));
      onListo(new File([blob], nombreDeDibujo(), { type: 'image/png' }));
      onCerrar();
    } finally { setGuardando(false); }
  }

  return (
    <div className="ov dibujo-ov" onClick={(ev) => ev.target === ev.currentTarget && !n && onCerrar()}>
      <div className="modal dibujo" data-dibujo>
        <div className="row dibujo-cab">
          <h2>Dibujo</h2>
          <div className="spacer" />
          <button type="button" className="btn sm" onClick={deshacer} disabled={!n} data-dibujo-deshacer title="Deshacer el último trazo">↶ Deshacer</button>
          <button type="button" className="btn sm" onClick={limpiar} disabled={!hayDibujo} data-dibujo-limpiar>Borrar todo</button>
        </div>
        <canvas
          ref={lienzo}
          width={LADO}
          height={LADO}
          className="dibujo-lienzo"
          data-dibujo-lienzo
          onPointerDown={baja}
          onPointerMove={mueve}
          onPointerUp={sube}
          onPointerCancel={sube}
          onPointerLeave={sube}
        />
        <div className="dibujo-herr">
          <div className="dibujo-pinceles" role="group" aria-label="Pincel">
            {PINCELES.map((x) => (
              <button key={x.clave} type="button" className={'btn sm' + (pincel === x.clave ? ' on' : '')} data-pincel={x.clave} aria-pressed={pincel === x.clave} onClick={() => setPincel(x.clave)}>
                {!x.borra && <span className="punta" style={{ width: Math.min(18, x.ancho), height: Math.min(18, x.ancho), background: color }} />}
                {x.nombre}
              </button>
            ))}
          </div>
          <div className="dibujo-colores" role="group" aria-label="Color">
            {COLORES.map((c) => (
              <button key={c} type="button" className={'muestra' + (color === c ? ' on' : '')} style={{ background: c }} data-color={c} aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); if (p.borra) setPincel(PINCELES[0].clave); }} />
            ))}
            <label className={'muestra otro' + (COLORES.includes(color) ? '' : ' on')} title="Otro color" style={COLORES.includes(color) ? undefined : { background: color }}>
              <input type="color" value={color} data-color-otro onChange={(ev) => { setColor(ev.target.value); if (p.borra) setPincel(PINCELES[0].clave); }} />
            </label>
          </div>
        </div>
        <div className="acts">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn primary" disabled={!hayDibujo || guardando} onClick={listo} data-dibujo-listo>{guardando ? 'Guardando…' : 'Agregar el dibujo'}</button>
        </div>
      </div>
    </div>
  );
}
