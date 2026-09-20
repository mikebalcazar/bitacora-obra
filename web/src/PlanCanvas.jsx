import React, { useEffect, useRef, useState } from 'react';
import { fileUrl, colorTipo, aguado } from './api.js';
import { pdfjs, esPdf } from './pdf.js';

// Plano + pines. Pan (arrastrar), zoom (rueda / pinch), tap para elegir.
//
// Todo el plano se dibuja en UN lienzo del tamaño de la pantalla, y en él se
// pinta nada más el pedazo que se está viendo. Nunca hay una imagen gigante
// estirada por CSS: eso obliga al navegador a guardar la textura completa a la
// escala del zoom —un plano de 3600 píxeles a 12 aumentos son cuarenta y tres
// mil píxeles de ancho— y en un celular eso se queda sin memoria de video y
// mata la pestaña. Acercarse ahora cuesta lo mismo que estar lejos.
//
// Encima, si el plano llegó en PDF, se dibuja la página del PDF a la escala en
// que se está viendo: al ser dibujo y no fotografía, las líneas finas y la letra
// chica salen limpias a cualquier acercamiento.
export default function PlanCanvas({ plan, elements, sel, flash, adding, mios = null, onPick, onClick }) {
  const box = useRef(null);
  const [v, setV] = useState({ x: 0, y: 0, s: 1 });
  const [drag, setDrag] = useState(false);
  const ptrs = useRef(new Map());
  const start = useRef(null);
  const moved = useRef(false);
  const [tam, setTam] = useState({ w: 0, h: 0 });

  const lienzo = useRef(null);      // lo que se ve, del tamaño de la pantalla
  const imagen = useRef(null);      // el plano rasterizado, ya descargado
  const pagina = useRef(null);      // la página del PDF original, si lo hay
  const hoja = useRef(null);        // lienzo de trabajo donde se dibuja el PDF
  const hojaVista = useRef(null);   // con qué vista se dibujó esa hoja
  const tarea = useRef(null);
  const cuadro = useRef(0);
  const vista = useRef(v);
  const [falla, setFalla] = useState(false);
  const [quieto, setQuieto] = useState(0);

  // Tope de la escala a la que se le pide la página al PDF. Es un seguro, no una
  // política: lo que tumbaba la pestaña era la imagen estirada por CSS, no
  // pdf.js, y el lienzo donde dibuja mide lo que la pantalla pase lo que pase.
  // Puesto bajo, la hoja del PDF salía diminuta y había que estirarla tanto que
  // se veía igual de borrosa que la imagen: para eso, mejor no dibujarla.
  const PAGINA_MAX = 60000;
  const punto = () => Math.min(window.devicePixelRatio || 1, 2);

  const fit = () => {
    const b = box.current; if (!b || !plan.width) return;
    const pad = 24;
    const s = Math.min((b.clientWidth - pad * 2) / plan.width, (b.clientHeight - pad * 2 - 40) / plan.height);
    aplica({ s, x: (b.clientWidth - plan.width * s) / 2, y: (b.clientHeight - plan.height * s) / 2 + 20 });
  };
  const mide = () => { const b = box.current; if (b) setTam({ w: b.clientWidth, h: b.clientHeight }); };

  /* IMPRIMIR: antes de que el navegador arme las hojas, el plano se encuadra
   * solo y se vuelve a dibujar.
   *
   * Mike, 20-sep: «quiero poder imprimir el plano de quell pero enfocado a
   * que la impresión salga, con el plano ligeramente claro y los círculos de
   * ítems en sus colores bien, pero el código del ítem en letra más
   * legible».
   *
   * Hace falta porque el plano se pinta en un lienzo del tamaño de la
   * PANTALLA: sin esto se imprime el pedazo que se estaba viendo, al zoom en
   * que estaba, y lo que quedaba fuera sale en blanco. `afterprint` deja las
   * cosas como estaban, para que imprimir no le mueva la vista a nadie. */
  useEffect(() => {
    const antes = () => { fit(); pinta(); };
    const despues = () => { pide(); };
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', despues);
    return () => { window.removeEventListener('beforeprint', antes); window.removeEventListener('afterprint', despues); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.width, plan?.height]);

  // La vista vive en un ref además del estado: así el dibujado la lee sin
  // esperar a que React vuelva a pintar, y el arrastre se siente inmediato.
  function aplica(nueva) {
    const val = typeof nueva === 'function' ? nueva(vista.current) : nueva;
    vista.current = val;
    setV(val);
    pide();
  }
  function pide() {
    if (cuadro.current) return;
    cuadro.current = requestAnimationFrame(() => { cuadro.current = 0; pinta(); });
  }

  useEffect(() => {
    fit(); mide();
    const ro = new ResizeObserver(() => { fit(); mide(); });
    ro.observe(box.current);
    return () => { ro.disconnect(); if (cuadro.current) cancelAnimationFrame(cuadro.current); };
  }, [plan.id]);

  // Bajar la imagen del plano.
  useEffect(() => {
    imagen.current = null;
    const im = new Image();
    im.decoding = 'async';
    im.src = fileUrl(plan.image_key);
    let vivo = true;
    im.onload = () => { if (!vivo) return; imagen.current = im; pide(); };
    return () => { vivo = false; im.onload = null; imagen.current = null; };
  }, [plan.id, plan.image_key]);

  // Abrir el PDF original, si lo hay. Si falla —no era PDF, ya no está el
  // archivo, el navegador no puede— no se avisa: se queda la imagen.
  useEffect(() => {
    setFalla(false);
    pagina.current = null; hojaVista.current = null;
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
      tarea.current = null; pagina.current = null; hojaVista.current = null;
      doc?.destroy?.();
      // Soltar el lienzo de trabajo a la mala: en el celular la memoria de
      // video no se libera sola nada más con dejar de apuntarlo.
      if (hoja.current) { hoja.current.width = 0; hoja.current.height = 0; hoja.current = null; }
    };
  }, [plan.id, plan.source_key]);

  // Dibujar lo que se ve: primero el pedazo de imagen que toca, y encima, si ya
  // está lista, la hoja del PDF, corrida y estirada según cuánto se movió la
  // vista desde que se dibujó. Es todo copiar píxeles: sale en un cuadro.
  function pinta() {
    const c = lienzo.current, b = box.current;
    if (!c || !b) return;
    const p = punto();
    const w = Math.round(b.clientWidth * p), h = Math.round(b.clientHeight * p);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    const vv = vista.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const im = imagen.current;
    if (im) {
      // Qué pedazo del plano cae dentro de la pantalla, en píxeles de la imagen.
      const escalaImg = im.naturalWidth / plan.width;
      let x0 = Math.max(0, -vv.x / vv.s), y0 = Math.max(0, -vv.y / vv.s);
      let x1 = Math.min(plan.width, (b.clientWidth - vv.x) / vv.s);
      let y1 = Math.min(plan.height, (b.clientHeight - vv.y) / vv.s);
      if (x1 > x0 && y1 > y0) {
        ctx.fillStyle = '#fff';
        ctx.fillRect((vv.x + x0 * vv.s) * p, (vv.y + y0 * vv.s) * p, (x1 - x0) * vv.s * p, (y1 - y0) * vv.s * p);
        ctx.drawImage(
          im,
          x0 * escalaImg, y0 * escalaImg, (x1 - x0) * escalaImg, (y1 - y0) * escalaImg,
          (vv.x + x0 * vv.s) * p, (vv.y + y0 * vv.s) * p, (x1 - x0) * vv.s * p, (y1 - y0) * vv.s * p
        );
      }
    }

    const hv = hojaVista.current;
    if (hoja.current && hv && !falla) {
      // La hoja se dibujó con la vista `hv` y, si hubo que bajarle la escala al
      // PDF, a un tamaño `hv.estirar` veces menor que la pantalla. Al pegarla
      // van las dos cuentas: el estirado con que se dibujó, y cuánto se movió la
      // vista desde entonces. Sin lo primero se pega chiquita en una esquina.
      const k = vv.s / hv.s;
      const e = hv.estirar || 1;
      ctx.drawImage(hoja.current, 0, 0, hoja.current.width, hoja.current.height,
        (vv.x - hv.x * k) * p, (vv.y - hv.y * k) * p, hoja.current.width * e * k, hoja.current.height * e * k);
    }
  }

  // El PDF se redibuja cuando la vista se queda quieta: mientras el dedo está
  // encima se estira lo ya dibujado, que es instantáneo.
  useEffect(() => {
    if (!pagina.current || falla || !tam.w) return;
    const t = setTimeout(() => { if (!ptrs.current.size) dibujaPdf(); }, 200);
    return () => clearTimeout(t);
  }, [v.x, v.y, v.s, tam.w, tam.h, quieto, falla]);

  async function dibujaPdf() {
    const pg = pagina.current, b = box.current;
    if (!pg || !b || falla) return;
    const vv = { ...vista.current };
    const p = punto();
    const w = Math.round(b.clientWidth * p), h = Math.round(b.clientHeight * p);
    if (!w || !h) return;

    const base = pg.getViewport({ scale: 1 });
    const deseada = (plan.width / base.width) * vv.s * p;
    if (!(deseada > 0) || !Number.isFinite(deseada)) return;
    const tope = PAGINA_MAX / Math.max(base.width, base.height);
    const estirar = deseada > tope ? deseada / tope : 1;
    const escala = deseada / estirar;
    const aw = Math.max(1, Math.round(w / estirar)), ah = Math.max(1, Math.round(h / estirar));

    if (!hoja.current) hoja.current = document.createElement('canvas');
    const off = hoja.current;
    if (off.width !== aw || off.height !== ah) { off.width = aw; off.height = ah; }
    const ctx = off.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, aw, ah);

    try { tarea.current?.cancel(); } catch {}
    let t;
    try {
      t = pg.render({
        canvasContext: ctx,
        viewport: pg.getViewport({ scale: escala }),
        transform: [1, 0, 0, 1, (vv.x * p) / estirar, (vv.y * p) / estirar],
      });
      tarea.current = t;
      await t.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      // Memoria, un PDF que pdf.js no puede: se apaga la capa nítida y se queda
      // el plano de siempre, en vez de tumbar la pestaña.
      setFalla(true);
      return;
    }
    if (tarea.current !== t) return;
    hojaVista.current = { ...vv, estirar };
    pinta();
  }

  function toWorld(cx, cy) {
    const r = box.current.getBoundingClientRect();
    const vv = vista.current;
    return { x: (cx - r.left - vv.x) / vv.s, y: (cy - r.top - vv.y) / vv.s };
  }
  function zoomAt(cx, cy, factor) {
    const r = box.current.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    aplica((o) => { const s = Math.min(12, Math.max(0.05, o.s * factor)); const k = s / o.s; return { s, x: px - (px - o.x) * k, y: py - (py - o.y) * k }; });
  }

  const onWheel = (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); };
  const onDown = (e) => {
    box.current.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    const vv = vista.current;
    if (ptrs.current.size === 1) start.current = { x: e.clientX, y: e.clientY, vx: vv.x, vy: vv.y };
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; start.current = { pinch: Math.hypot(a.x - b.x, a.y - b.y), s: vv.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: vv.x, vy: vv.y }; }
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
      aplica({ s, x: mx - (start.current.mx - r.left - start.current.vx) * kk, y: my - (start.current.my - r.top - start.current.vy) * kk });
      moved.current = true;
      return;
    }
    if (ptrs.current.size === 1 && start.current && !start.current.pinch) {
      const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { moved.current = true; setDrag(true); }
      if (moved.current) aplica((o) => ({ ...o, x: start.current.vx + dx, y: start.current.vy + dy }));
    }
  };
  const onUp = (e) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) {
      setDrag(false);
      const propio = e.target === box.current || e.target === lienzo.current || e.target.classList.contains('world');
      if (!moved.current && propio) {
        const w = toWorld(e.clientX, e.clientY);
        if (w.x >= 0 && w.y >= 0 && w.x <= plan.width && w.y <= plan.height) onClick(w.x / plan.width, w.y / plan.height);
      }
      start.current = null;
      setQuieto((n) => n + 1);
    }
  };

  return (
    <div ref={box} className={'canvas' + (adding ? ' adding' : '') + (drag ? ' dragging' : '')} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <canvas ref={lienzo} className="hoja" style={{ width: tam.w, height: tam.h }} />
      <div className="world" style={{ transform: `translate(${v.x}px,${v.y}px) scale(${v.s})` }}>
        {elements.map((e) => {
          // El relleno dice de qué tipo es; el aro rojo, que tiene punchlist sin
          // cerrar. Un ítem en producción va aguado: del color de su tipo pero
          // a media tinta, para que se note que todavía no hay nada entregado
          // sin desaparecer del plano. Relleno blanco no se veía: el plano
          // también es blanco, y quedaba un aro suelto.
          //
          // El pin no lleva número adentro. Lo llevaba, y con un dígito el pin
          // se estiraba a 120 px de ancho: el texto abre una columna en la
          // rejilla que se pasa por alto el ancho fijo, y quedaba un óvalo. En
          // un plano lleno el pin es una marca de posición, no una etiqueta:
          // cuántos pendientes son se lee al abrirlo.
          const abierto = (e.n_pend || 0) + (e.n_proc || 0) > 0;
          const tinte = colorTipo(e.type);
          const enProd = (e.fase || 'produccion') === 'produccion';
          return (
            <div key={e.id} className={'pin' + (abierto ? ' abierto' : '') + (enProd ? ' prod' : '') + (e.id === sel ? ' sel' : '') + (flash && e.id === sel ? ' flash' : '')
                + (mios ? (mios.includes(e.id) ? ' mio' : ' ajeno') : '')
                /* Fuera del alcance: hueco y punteado. No se borra del plano
                   —la pieza existe y alguien la puede estar buscando— pero
                   tampoco se ve como algo que se esté fabricando. */
                + ((e.alcance && e.alcance !== 'dentro') ? ' fuera' : '')}
              style={{
                left: e.x * plan.width, top: e.y * plan.height, transform: `translate(-50%,-50%) scale(${1 / v.s})`,
                background: enProd ? aguado(tinte) : tinte,
                ['--tinte']: tinte,
              }}
              onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); if (!adding) onPick(e.id); }} title={`${e.code} · ${e.name}`}>
              <span>{e.code}</span>
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
