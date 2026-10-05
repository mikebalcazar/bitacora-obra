import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BASE, escribir, leer } from './api.js';
import { useApp } from './App.jsx';

/* El cronograma de la obra (5-oct-2026).
 *
 * Mike: «necesito en quell poder configurar un cronograma, pero algo muy
 * amigable (…) 1) asignar tiempo de fabricación total, y dar la opción a
 * definir tiempo de a) entrega de material b) fabricación c) instalación, y a
 * cada una de esas etapas asignarle un proveedor o contratista (…) 2) poder
 * encadenar tareas (…) dentro del mismo ítem puede haber 2 ó 3 procesos (…)
 * herrería, luego gabinetes, luego cubiertas (…) sólo se encadenan las
 * instalaciones (…) 3) poder exportar el cronograma en un formato comercial,
 * ej. Microsoft Project, o en un Excel.» Los días se cuentan de lunes a
 * sábado (decisión de Mike con botones).
 *
 * CÓMO SE LEE LA PANTALLA
 *
 * Arriba, la obra: cuándo arranca, cuántos días se le prometieron al cliente,
 * y cuándo termina según lo capturado —en rojo si se pasa—. Después, una
 * tarjeta por pieza. Una pieza sin tiempo tiene un solo campo: los días
 * totales, que es lo que Mike pidió como arranque rápido («tiempo de
 * fabricación total»). Quien quiera más detalle la desglosa en entrega de
 * material, fabricación e instalación, cada una con sus días y su proveedor.
 * Y si la pieza lleva varios procesos (herrería, gabinetes, cubiertas), cada
 * uno es una sección con sus propias etapas.
 *
 * LAS CUENTAS NO SE HACEN AQUÍ
 *
 * Las fechas las pone el servidor (`cronograma.js` en la suite): esta pantalla
 * captura y enseña. Cada cambio se guarda solo, un momento después de que la
 * persona deja de teclear, y lo que vuelve trae las fechas ya contadas. Así
 * hay una sola versión de las reglas, la misma que sale en el Excel y en el
 * archivo de Project.
 *
 * LAS CADENAS
 *
 * Dentro de una sección, el orden es fijo y no se pregunta: el material
 * llega, luego se fabrica, luego se instala. Entre secciones de la misma
 * pieza, al nacer una sección su instalación se encadena a la instalación de
 * la anterior —lo que Mike describió—, y las demás etapas quedan libres para
 * avanzarse. Cualquier tarea puede, además, esperar a otra cualquiera de la
 * obra con «Después de…». */

const ETAPAS = ['material', 'fabricacion', 'instalacion'];
const NOMBRE = { material: 'Entrega de material', fabricacion: 'Fabricación', instalacion: 'Instalación' };
/* Qué proveedores le tocan a cada etapa: el material lo surte uno de
 * materiales; fabricar e instalar es un servicio (o el taller mismo). */
const TIPO_DE = { material: 'materiales', fabricacion: 'servicios', instalacion: 'servicios' };
const nuevoId = () => 'nuevo-' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const fecha = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—');
const plural = (n, una, varias) => `${n} ${n === 1 ? una : varias}`;

export default function Cronograma({ pid, onIr }) {
  const { toast } = useApp();
  const [c, setC] = useState(null);          // lo último que contestó el servidor (fechas)
  const [tareas, setTareas] = useState([]);   // lo que se captura
  const [inicio, setInicio] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [estado, setEstado] = useState('');   // '', 'Guardando…', 'Guardado', 'Sin guardar'
  const sucio = useRef(0);                    // cuántos cambios van; para no pisar lo nuevo con una respuesta vieja
  const guardando = useRef(false);
  const reloj = useRef(null);

  const carga = (r) => {
    setC(r);
    setTareas(r.tareas.map(limpia));
    setInicio(r.inicio_guardado || '');
    setObjetivo(r.dias_objetivo ?? '');
  };
  useEffect(() => {
    setC(null); sucio.current = 0;
    leer(`/projects/${pid}/cronograma`).then(carga).catch((e) => toast(e.message));
    return () => clearTimeout(reloj.current);
  }, [pid]);

  /* Guardar: entero, un momento después del último cambio. Si mientras
   * guardaba hubo otro cambio, la respuesta se usa para las fechas pero no
   * para la captura, y se vuelve a guardar. */
  const guarda = async () => {
    if (guardando.current) return;
    guardando.current = true;
    const marca = sucio.current;
    setEstado('Guardando…');
    try {
      const cuerpo = { inicio: inicio || null, dias_objetivo: objetivo === '' ? null : Number(objetivo), tareas: tareas.map(aServidor) };
      const r = await escribir({ metodo: 'PUT', ruta: `/projects/${pid}/cronograma`, cuerpo });
      if (!r.subido) { setEstado('Sin señal: se guarda cuando vuelva'); return; }
      setC(r.r);
      if (sucio.current === marca) { setTareas(r.r.tareas.map(limpia)); setEstado('Guardado'); }
    } catch (e) {
      setEstado('Sin guardar');
      toast(e.message);
    } finally {
      guardando.current = false;
      if (sucio.current !== marca) programaGuardar();
    }
  };
  const guardaRef = useRef(guarda); guardaRef.current = guarda;
  const programaGuardar = () => {
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => guardaRef.current(), 700);
  };
  const cambia = (fn) => { sucio.current++; setEstado('Sin guardar'); fn(); programaGuardar(); };

  // ---- lo que se edita ----
  const pon = (id, parche) => cambia(() => setTareas((ts) => ts.map((t) => (t.id === id ? { ...t, ...parche } : t))));
  const quita = (id) => cambia(() => setTareas((ts) => ts.filter((t) => t.id !== id).map((t) => (t.depende_de === id ? { ...t, depende_de: null } : t))));
  const agrega = (lista) => cambia(() => setTareas((ts) => [...ts, ...lista]));
  /* La pieza arranca con un solo número: los días totales, como fabricación. */
  const daTiempo = (element_id, dias) => agrega([tarea({ element_id, seccion: '', etapa: 'fabricacion', dias })]);
  const agregaEtapa = (element_id, seccion, etapa) => agrega([tarea({ element_id, seccion, etapa, dias: 1, orden: ordenDe(element_id, seccion) })]);
  /* Una sección más: nace con fabricación e instalación, y su instalación
   * espera a la instalación de la sección anterior de la misma pieza. */
  const agregaSeccion = (element_id) => {
    const mias = tareas.filter((t) => t.element_id === element_id);
    const secciones = seccionesDe(mias);
    const previa = secciones.length ? mias.filter((t) => t.seccion === secciones[secciones.length - 1] && t.etapa === 'instalacion')[0] : null;
    const nombre = `Proceso ${secciones.length + 1}`;
    const orden = secciones.length;
    if (secciones.length === 1 && secciones[0] === '') {
      // La sección sin nombre pasa a llamarse «Proceso 1» para que se distinga de la nueva.
      cambia(() => setTareas((ts) => ts.map((t) => (t.element_id === element_id && t.seccion === '' ? { ...t, seccion: 'Proceso 1' } : t))));
    }
    agrega([
      tarea({ element_id, seccion: nombre, etapa: 'fabricacion', dias: 1, orden }),
      tarea({ element_id, seccion: nombre, etapa: 'instalacion', dias: 1, orden, depende_de: previa ? previa.id : null }),
    ]);
  };
  const renombra = (element_id, seccion, nuevo) => cambia(() => setTareas((ts) => ts.map((t) => (t.element_id === element_id && t.seccion === seccion ? { ...t, seccion: nuevo } : t))));
  const ordenDe = (element_id, seccion) => (tareas.find((t) => t.element_id === element_id && t.seccion === seccion) || {}).orden || 0;

  const fechasDe = useMemo(() => new Map((c?.tareas || []).map((t) => [t.id, t])), [c]);
  const items = c?.items || [];
  const porPieza = useMemo(() => new Map(items.map((e) => [e.element_id, e])), [items]);
  const etiqueta = (t) => { const e = porPieza.get(t.element_id); return `${e?.code || '?'}${t.seccion ? ' · ' + t.seccion : ''} · ${NOMBRE[t.etapa]}`; };

  if (!c) return <div className="crono"><div className="spin" /></div>;

  const conTiempo = items.filter((e) => tareas.some((t) => t.element_id === e.element_id)).length;
  return (
    <div className="crono">
      <div className="crono-cab">
        <div className="campo"><label>Arranca el</label><input type="date" value={inicio} onChange={(e) => cambia(() => setInicio(e.target.value))} /></div>
        <div className="campo"><label>Días prometidos</label><input type="number" min="0" step="1" inputMode="numeric" placeholder="—" value={objetivo} onChange={(e) => cambia(() => setObjetivo(e.target.value.replace(/\D/g, '')))} /></div>
        <div className="campo total">
          <label>Termina el</label>
          <b className={c.excede ? 'excede' : ''}>{c.dias_laborables ? fecha(c.fin) : '—'}</b>
          <small>{c.dias_laborables ? `${plural(c.dias_laborables, 'día laborable', 'días laborables')}${c.excede ? ` · se pasa ${plural(c.dias_laborables - c.dias_objetivo, 'día', 'días')}` : ''}` : 'Sin tiempos todavía'}</small>
        </div>
        <div className="acciones">
          <span className={'estado' + (estado === 'Guardado' ? ' ok' : '')}>{estado}</span>
          <a className="btn sm" href={`${BASE}/api/projects/${pid}/cronograma.xlsx`} download title="Bajar el cronograma en Excel">Excel</a>
          <a className="btn sm" href={`${BASE}/api/projects/${pid}/cronograma.xml`} download title="Bajar el cronograma para Microsoft Project (XML)">Project</a>
        </div>
      </div>
      <div className="crono-nota muted">Los días se cuentan de lunes a sábado. Dentro de cada proceso, el material llega, luego se fabrica y luego se instala; las instalaciones de los procesos de una pieza van una tras otra. {conTiempo} de {items.length} piezas con tiempo.</div>
      {!items.length && <div className="empty"><h3>Sin piezas</h3>El cronograma se arma con los ítems de la obra.</div>}
      {items.map((e) => {
        const mias = tareas.filter((t) => t.element_id === e.element_id);
        const secciones = seccionesDe(mias);
        const vivo = porPieza.get(e.element_id);
        return (
          <section key={e.element_id} className={'pieza' + (mias.length ? '' : ' sin')}>
            <header>
              <button className="nombre" onClick={() => onIr && onIr(e)} title="Abrir el ítem">{e.code ? <b>{e.code}</b> : null} {e.name}</button>
              <span className="muted">{e.type}{e.plan_name ? ` · ${e.plan_name}` : ''}</span>
              {mias.length ? <span className="fechas">{fecha(vivo?.inicio)} → {fecha(vivo?.fin)} · {plural(vivo?.dias || 0, 'día', 'días')}</span> : null}
            </header>
            {!mias.length && <DarTiempo onOk={(d) => daTiempo(e.element_id, d)} />}
            {secciones.map((s) => {
              const deS = mias.filter((t) => t.seccion === s).sort((a, b) => ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa));
              const faltan = ETAPAS.filter((k) => !deS.some((t) => t.etapa === k));
              const soloTotal = secciones.length === 1 && s === '' && deS.length === 1 && deS[0].etapa === 'fabricacion';
              return (
                <div key={s || '(sin)'} className="seccion">
                  {(secciones.length > 1 || s) && (
                    <div className="seccion-cab">
                      <input className="seccion-nombre" value={s} placeholder="Nombre del proceso" onChange={(ev) => renombra(e.element_id, s, ev.target.value)} />
                    </div>
                  )}
                  {deS.map((t) => (
                    <Fila key={t.id} t={t} soloTotal={soloTotal} fechas={fechasDe.get(t.id)} proveedores={c.proveedores}
                      otras={tareas.filter((o) => o.id !== t.id)} etiqueta={etiqueta}
                      onPon={(p) => pon(t.id, p)} onQuita={() => quita(t.id)} />
                  ))}
                  {!!faltan.length && (
                    <div className="agregar">
                      {soloTotal ? <span className="muted">Desglosar:</span> : null}
                      {faltan.map((k) => <button key={k} className="btn sm" onClick={() => agregaEtapa(e.element_id, s, k)}>+ {NOMBRE[k]}</button>)}
                    </div>
                  )}
                </div>
              );
            })}
            {!!mias.length && <div className="agregar"><button className="btn sm" onClick={() => agregaSeccion(e.element_id)} title="Otro proceso de la misma pieza (herrería, gabinetes, cubiertas…)">+ Otro proceso</button></div>}
          </section>
        );
      })}
    </div>
  );
}

/* El arranque rápido de una pieza: un número y listo. */
function DarTiempo({ onOk }) {
  const [d, setD] = useState('');
  const manda = () => { const n = Number(d); if (Number.isInteger(n) && n >= 1) { onOk(n); setD(''); } };
  return (
    <div className="dar">
      <label>Tiempo total</label>
      <input type="number" min="1" step="1" inputMode="numeric" placeholder="días" value={d} onChange={(e) => setD(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && manda()} />
      <button className="btn sm" onClick={manda} disabled={!d}>Dar tiempo</button>
    </div>
  );
}

function Fila({ t, soloTotal, fechas, proveedores, otras, etiqueta, onPon, onQuita }) {
  const tipo = TIPO_DE[t.etapa];
  const lista = proveedores.filter((p) => p.tipo === tipo || p.id === t.proveedor_id);
  return (
    <div className="tarea">
      <span className="etapa">{soloTotal ? 'Tiempo total' : NOMBRE[t.etapa]}</span>
      <label className="dias"><input type="number" min="1" step="1" inputMode="numeric" value={t.dias} onChange={(e) => onPon({ dias: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} /><span>días</span></label>
      <select className="prov" value={t.proveedor_id || ''} onChange={(e) => onPon({ proveedor_id: e.target.value || null })} title={tipo === 'materiales' ? 'Quién surte el material' : 'Quién lo hace: el taller o un contratista'}>
        <option value="">{tipo === 'materiales' ? '(sin proveedor)' : '(el taller)'}</option>
        {lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <select className="despues" value={t.depende_de || ''} onChange={(e) => onPon({ depende_de: e.target.value || null })} title="Esperar a que termine otra tarea de la obra">
        <option value="">Después de… (sigue el orden)</option>
        {otras.map((o) => <option key={o.id} value={o.id}>{etiqueta(o)}</option>)}
      </select>
      <span className="cuando">{fechas ? `${fecha(fechas.inicio)} → ${fecha(fechas.fin)}` : '…'}</span>
      <button className="x" onClick={onQuita} title="Quitar esta etapa" aria-label="Quitar">✕</button>
    </div>
  );
}

// ---- utilidades ----
const tarea = ({ element_id, seccion = '', etapa, dias = 1, orden = 0, depende_de = null }) => ({ id: nuevoId(), element_id, seccion, orden, etapa, dias, proveedor_id: null, depende_de, inicio_fijo: null, notas: null });
const limpia = (t) => ({ id: t.id, element_id: t.element_id, seccion: t.seccion || '', orden: t.orden || 0, etapa: t.etapa, dias: t.dias, proveedor_id: t.proveedor_id || null, depende_de: t.depende_de || null, inicio_fijo: t.inicio_fijo || null, notas: t.notas || null });
const aServidor = (t) => ({ id: t.id, element_id: t.element_id, seccion: t.seccion, orden: t.orden, etapa: t.etapa, dias: Number(t.dias) || 1, proveedor_id: t.proveedor_id, depende_de: t.depende_de, inicio_fijo: t.inicio_fijo, notas: t.notas });
/* Las secciones de una pieza, en el orden en que se crearon. */
const seccionesDe = (ts) => [...ts].sort((a, b) => (a.orden || 0) - (b.orden || 0)).reduce((acc, t) => (acc.includes(t.seccion) ? acc : [...acc, t.seccion]), []);
