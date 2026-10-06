import React, { useMemo, useRef, useState } from 'react';
import { Candados, nombreDe, ordenaFases, pesos, responsableDe } from './Cronograma.jsx';

/* El cronograma gráfico (6-oct-2026).
 *
 * Mike: «quiero poder indicar los días de cada fase de cada ítem y después
 * en el cronograma gráfico poder "arrastrar" la tarea (fase del ítem) que se
 * encadena con otra fase de otro ítem ya sea antes o después».
 *
 * Una barra por fase, un día laborable por columna (lunes a sábado; el
 * domingo no existe en esta regla). A la izquierda, cada fase con sus días
 * para teclearlos ahí mismo; una pieza sin tiempo trae tres casillas
 * (material, fabricación, instalación) para darle sus días de una vez.
 *
 * ARRASTRAR
 *
 * Soltar una barra ENCIMA de otra la encadena: en la mitad derecha de la
 * otra, «después de» (ésta espera a que termine aquélla); en la mitad
 * izquierda, «antes de» (aquélla espera a ésta). Soltarla en el vacío la
 * mueve: queda con fecha fija, que es un piso —no puede empezar antes de lo
 * que espera, pero sí después—. El alfiler en la barra lo dice y, al
 * picarlo, suelta la fecha. Las cuentas siguen en el servidor: aquí sólo se
 * decide y se enseña lo que contestó. */

const DW = 28;      // ancho de un día
const RH = 34;      // alto de un renglón
const NOMBRE = { material: 'Material', fabricacion: 'Fabricación', instalacion: 'Instalación', otra: 'Otra fase' };
/* En la gráfica el material se abrevia; lo demás, como se llame. */
const rotulo = (t) => (t.nombre && t.nombre.trim()) || NOMBRE[t.etapa] || t.etapa;
const ETAPAS = ['material', 'fabricacion', 'instalacion'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const aFecha = (iso) => new Date(iso + 'T12:00:00');
const aIso = (d) => d.toISOString().slice(0, 10);
const sumaDias = (iso, n) => { const d = aFecha(iso); d.setDate(d.getDate() + n); return aIso(d); };
/* Los días laborables entre dos fechas, ambas incluidas, sin domingos. */
function diasEntre(a, b) {
  const salida = [];
  for (let d = a; d <= b; d = sumaDias(d, 1)) if (aFecha(d).getDay() !== 0) salida.push(d);
  return salida;
}

export default function Gantt({ c, tareas, items, fechasDe, onPon, onEncadena, onDarFases, onIr }) {
  const hoy = aIso(new Date());
  const inicio = c.inicio < hoy ? c.inicio : hoy;
  const finMin = sumaDias(inicio, 21);
  const fin = sumaDias((c.fin && c.fin > finMin ? c.fin : finMin), 7);
  const dias = useMemo(() => diasEntre(inicio, fin), [inicio, fin]);
  const idx = useMemo(() => new Map(dias.map((d, i) => [d, i])), [dias]);
  const ancho = dias.length * DW;

  /* Los renglones: la pieza y debajo sus fases, en el orden de sus procesos. */
  const filas = useMemo(() => {
    const salida = [];
    for (const e of items) {
      const porProceso = new Map();
      for (const t of tareas.filter((t) => t.element_id === e.element_id)) { if (!porProceso.has(t.seccion)) porProceso.set(t.seccion, []); porProceso.get(t.seccion).push(t); }
      const procesos = [...porProceso.values()].sort((a, b) => (a[0].orden || 0) - (b[0].orden || 0) || a[0].seccion.localeCompare(b[0].seccion));
      const mias = procesos.flatMap((ts) => ordenaFases(ts));
      salida.push({ tipo: 'item', e, n: mias.length });
      for (const t of mias) salida.push({ tipo: 'tarea', t, e });
    }
    return salida;
  }, [items, tareas]);
  const filaDe = useMemo(() => new Map(filas.map((f, i) => [f.tipo === 'tarea' ? f.t.id : 'e-' + f.e.element_id, i])), [filas]);

  const [arrastre, setArrastre] = useState(null); // { id, dx, sobre: { id, lado } | null }
  const origen = useRef(null);

  const posDe = (id) => {
    const f = fechasDe.get(id);
    if (!f || !idx.has(f.inicio)) return null;
    const a = idx.get(f.inicio), b = idx.has(f.fin) ? idx.get(f.fin) : dias.length - 1;
    return { left: a * DW, width: (b - a + 1) * DW - 3 };
  };

  // ---- arrastrar ----
  const baja = (t) => (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    origen.current = { x: ev.clientX, id: t.id };
    setArrastre({ id: t.id, dx: 0, sobre: null });
  };
  const mueve = (ev) => {
    if (!origen.current) return;
    const dx = ev.clientX - origen.current.x;
    let sobre = null;
    const debajo = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.dataset && el.dataset.barra && el.dataset.barra !== origen.current.id);
    if (debajo) {
      const r = debajo.getBoundingClientRect();
      sobre = { id: debajo.dataset.barra, lado: ev.clientX < r.left + r.width / 2 ? 'antes' : 'despues' };
    }
    setArrastre({ id: origen.current.id, dx, sobre });
  };
  const suelta = (t) => (ev) => {
    if (!origen.current) return;
    const { dx, sobre } = arrastre || { dx: 0, sobre: null };
    origen.current = null;
    setArrastre(null);
    if (sobre) {
      if (sobre.lado === 'despues') onEncadena(t.id, sobre.id);
      else onEncadena(sobre.id, t.id);
      return;
    }
    const pasos = Math.round(dx / DW);
    if (!pasos) return;
    const f = fechasDe.get(t.id);
    if (!f || !idx.has(f.inicio)) return;
    const nuevo = dias[Math.max(0, Math.min(dias.length - 1, idx.get(f.inicio) + pasos))];
    onPon(t.id, { inicio_fijo: nuevo });
  };

  const etiqueta = (id) => { const t = tareas.find((x) => x.id === id); const e = t && items.find((i) => i.element_id === t.element_id); return t ? `${e?.code || '?'}${t.seccion ? ' · ' + t.seccion : ''} · ${nombreDe(t)}` : ''; };

  /* Las ligas entre barras: del fin de la que se espera al inicio de la que
   * espera. Las que puso alguien (depende_de) van marcadas; las del orden de
   * cada proceso, apagadas. */
  const ligas = [];
  for (const f of filas) {
    if (f.tipo !== 'tarea') continue;
    const srv = fechasDe.get(f.t.id);
    if (!srv) continue;
    for (const p of srv.previas || []) {
      const a = posDe(p), b = posDe(f.t.id);
      const ya = filaDe.get(p), yb = filaDe.get(f.t.id);
      if (!a || !b || ya === undefined || yb === undefined) continue;
      ligas.push({ k: p + '>' + f.t.id, x1: a.left + a.width, y1: ya * RH + RH / 2, x2: b.left, y2: yb * RH + RH / 2, fuerte: f.t.depende_de === p });
    }
  }

  return (
    <div className="gantt" onPointerMove={mueve}>
      <div className="g-cab">
        <div className="g-izq">Pieza · fase</div>
        <div className="g-dias" style={{ width: ancho }}>
          {dias.map((d, i) => {
            const f = aFecha(d);
            const lunes = f.getDay() === 1 || i === 0;
            return (
              <div key={d} className={'g-dia' + (f.getDay() === 6 ? ' sab' : '') + (d === hoy ? ' hoy' : '') + (lunes ? ' lunes' : '')} style={{ width: DW }} title={d}>
                {lunes ? <small>{f.getDate()} {MESES[f.getMonth()]}</small> : <small>{f.getDate()}</small>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="g-cuerpo" style={{ height: filas.length * RH }}>
        {filas.map((f, i) => f.tipo === 'item' ? (
          <div key={'e-' + f.e.element_id} className="g-fila de-pieza" style={{ top: i * RH }}>
            <div className="g-izq">
              <button className="g-nombre" onClick={() => onIr && onIr(f.e)} title="Abrir el ítem">{f.e.code ? <b>{f.e.code}</b> : null} {f.e.name}</button>
              <Candados k={f.e.candados} corto />
              {!f.n && <DarFases onOk={(d) => onDarFases(f.e.element_id, d)} />}
            </div>
            <div className="g-linea" style={{ width: ancho }}>
              {f.e.inicio && idx.has(f.e.inicio) && (
                <div className="g-resumen" style={{ left: idx.get(f.e.inicio) * DW, width: ((idx.has(f.e.fin) ? idx.get(f.e.fin) : dias.length - 1) - idx.get(f.e.inicio) + 1) * DW - 3 }} />
              )}
            </div>
          </div>
        ) : (
          <div key={f.t.id} className="g-fila de-fase" style={{ top: i * RH }}>
            <div className="g-izq">
              <span className="g-fase" title={f.t.seccion || ''}>{f.t.seccion ? <small>{f.t.seccion} · </small> : null}{rotulo(f.t)}</span>
              <label className="g-dias-in"><input type="number" min="1" step="1" inputMode="numeric" value={f.t.dias} onChange={(ev) => onPon(f.t.id, { dias: Math.max(1, Number(ev.target.value.replace(/\D/g, '')) || 1) })} /><span>d</span></label>
              <span className="g-prov muted" title={responsableDe(f.t, c)}>{responsableDe(f.t, c)}</span>
              {Number(f.t.costo) > 0 && <span className="g-costo muted" title="El costo de la fase (se edita en la lista)">{pesos(f.t.costo)}</span>}
            </div>
            <div className="g-linea" style={{ width: ancho }}>
              {(() => {
                const pos = posDe(f.t.id);
                if (!pos) return <span className="g-espera muted">…</span>;
                const yo = arrastre && arrastre.id === f.t.id;
                const destino = arrastre && arrastre.sobre && arrastre.sobre.id === f.t.id ? arrastre.sobre.lado : null;
                return (
                  <div data-barra={f.t.id} className={'g-barra ' + f.t.etapa + (yo ? ' va' : '') + (destino ? ' destino ' + destino : '')}
                    style={{ left: pos.left, width: pos.width, transform: yo ? `translateX(${arrastre.dx}px)` : undefined }}
                    onPointerDown={baja(f.t)} onPointerUp={suelta(f.t)} onPointerCancel={() => { origen.current = null; setArrastre(null); }}
                    title={`${f.e.code || ''} ${rotulo(f.t)}: ${fechasDe.get(f.t.id).inicio} → ${fechasDe.get(f.t.id).fin}. Arrastra sobre otra barra para encadenar (del otro lado, para voltear la cadena); al vacío para fijar la fecha.${f.t.depende_de ? ' El eslabón quita la cadena.' : ''}`}>
                    {f.t.depende_de && <button className="g-pin" title={`Espera a ${etiqueta(f.t.depende_de)}. Picar para quitar la cadena.`} onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onPon(f.t.id, { depende_de: null })}>⛓</button>}
                    {f.t.inicio_fijo && <button className="g-pin" title={`Empieza el ${f.t.inicio_fijo} o después. Picar para soltar la fecha.`} onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onPon(f.t.id, { inicio_fijo: null })}>📌</button>}
                    <span>{f.t.dias}d</span>
                    {destino && <em className="g-aviso">{destino === 'despues' ? `${etiqueta(arrastre.id)} después de ésta` : `${etiqueta(arrastre.id)} antes de ésta`}</em>}
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
        <svg className="g-ligas" width={ancho} height={filas.length * RH} style={{ left: 300 }}>
          {ligas.map((l) => (
            <path key={l.k} className={l.fuerte ? 'fuerte' : ''} d={`M${l.x1},${l.y1} h6 V${l.y2 - (l.y2 > l.y1 ? RH / 2 : -RH / 2)} H${l.x2 - 6} V${l.y2} h6`} />
          ))}
        </svg>
      </div>
    </div>
  );
}

/* Tres casillas para darle de una vez sus fases a una pieza sin tiempo. */
function DarFases({ onOk }) {
  const [v, setV] = useState({ material: '', fabricacion: '', instalacion: '' });
  const lista = ETAPAS.filter((k) => Number(v[k]) >= 1);
  return (
    <span className="g-dar">
      {ETAPAS.map((k) => (
        <label key={k} title={`Días de ${NOMBRE[k].toLowerCase()}`}><small>{NOMBRE[k][0]}</small><input type="number" min="1" step="1" inputMode="numeric" placeholder="–" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, '') })} /></label>
      ))}
      <button className="btn sm" disabled={!lista.length} onClick={() => { onOk(Object.fromEntries(lista.map((k) => [k, Number(v[k])]))); setV({ material: '', fabricacion: '', instalacion: '' }); }}>Dar</button>
    </span>
  );
}
