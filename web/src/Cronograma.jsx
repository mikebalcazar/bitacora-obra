import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BASE, escribir, leer } from './api.js';
import { useApp } from './App.jsx';
import Gantt from './Gantt.jsx';

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
const NOMBRE = { material: 'Entrega de material', fabricacion: 'Fabricación', instalacion: 'Instalación', otra: 'Otra fase' };
/* Cómo se llama una fase: el nombre que le pusieron o el de su etapa (6-oct). */
export const nombreDe = (t) => (t.nombre && t.nombre.trim()) || NOMBRE[t.etapa] || t.etapa;
const posDe = (t) => (Number.isInteger(t.pos) ? t.pos : ETAPAS.indexOf(t.etapa) * 10);
export const ordenaFases = (ts) => [...ts].sort((a, b) => posDe(a) - posDe(b) || ETAPAS.indexOf(a.etapa) - ETAPAS.indexOf(b.etapa));
/* Qué proveedores le tocan a cada etapa: el material lo surte uno de
 * materiales; fabricar e instalar es un servicio (o el taller mismo). */
const TIPO_DE = { material: 'materiales', fabricacion: 'servicios', instalacion: 'servicios', otra: 'servicios' };
const nuevoId = () => 'nuevo-' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const fecha = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—');
const plural = (n, una, varias) => `${n} ${n === 1 ? una : varias}`;

/* Los dos candados de una pieza (Mike, 6-oct-2026): «todos los ítems
 * necesitan cumplir 2 parámetros para que se fije su fecha de inicio (…)
 * anticipo y definición de diseño. Mientras no se cumplan, la fecha de inicio
 * se sigue recorriendo al día presente». El servidor dice cuáles faltan y
 * desde cuándo corre la pieza; aquí sólo se enseña. */
export function Candados({ k, corto = false }) {
  if (!k) return null;
  if (k.listo) return <span className="candados listo" title={`Anticipo ${fecha(k.anticipo)} · diseño definido ${fecha(k.diseno)}: la pieza corre desde ${fecha(k.arranque)}.`}>{corto ? '✓' : `Arranca ${fecha(k.arranque)}`}</span>;
  return (
    <span className="candados faltan" title="Sin los dos candados la pieza corre desde hoy y se recorre sola día con día.">
      {!k.anticipo && <em title={k.ligado ? 'El anticipo se reparte en dash101 al registrar el pago del cliente.' : 'Sin ítem en dash101: liga la obra al proyecto para registrarle el anticipo.'}>{corto ? '⚠ anticipo' : k.ligado ? 'Sin anticipo' : 'Sin ítem en dash101'}</em>}
      {!k.diseno && <em title="La fecha de definición de diseño se pone en el ítem, en «Editar».">{corto ? '⚠ diseño' : 'Sin diseño'}</em>}
      {!corto && <small>corre desde hoy</small>}
    </span>
  );
}

export default function Cronograma({ pid, onIr }) {
  const { toast } = useApp();
  const [c, setC] = useState(null);          // lo último que contestó el servidor (fechas)
  const [tareas, setTareas] = useState([]);   // lo que se captura
  const [inicio, setInicio] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [estado, setEstado] = useState('');   // '', 'Guardando…', 'Guardado', 'Sin guardar'
  /* Gráfica (barras por día, se arrastran) o lista (cada pieza con sus
   * procesos). Mike, 6-oct: la gráfica es la que pidió; se recuerda la última. */
  const [modo, setModo] = useState(() => { try { return localStorage.getItem('crono_modo') || 'grafica'; } catch { return 'grafica'; } });
  const cambiaModo = (m) => { setModo(m); try { localStorage.setItem('crono_modo', m); } catch {} };
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
  /* Encadenar `a` después de `b`. Si `b` ya esperaba a `a` (la cadena al
   * revés, hecha sin querer), esa se quita en el mismo paso: así soltar la
   * barra del otro lado SOBREESCRIBE la cadena en vez de morderse la cola
   * (Mike, 6-oct). */
  const encadena = (a, b) => cambia(() => setTareas((ts) => ts.map((t) => (t.id === a ? { ...t, depende_de: b } : t.id === b && t.depende_de === a ? { ...t, depende_de: null } : t))));
  const quita = (id) => cambia(() => setTareas((ts) => ts.filter((t) => t.id !== id).map((t) => (t.depende_de === id ? { ...t, depende_de: null } : t))));
  const agrega = (lista) => cambia(() => setTareas((ts) => [...ts, ...lista]));
  /* El orden dentro de un proceso es `pos`; después de meter o mover una fase
   * se vuelve a contar de 10 en 10 para que no haya empates. */
  const renumera = (ts, element_id, seccion) => {
    const mias = ordenaFases(ts.filter((t) => t.element_id === element_id && t.seccion === seccion));
    const nuevoPos = new Map(mias.map((t, i) => [t.id, i * 10]));
    return ts.map((t) => (nuevoPos.has(t.id) ? { ...t, pos: nuevoPos.get(t.id) } : t));
  };
  /* Una fase de más en el proceso (Mike, 6-oct): entra antes de la
   * instalación si la hay, si no al final; nace como «Nueva fase» para que
   * se le ponga nombre. */
  const agregaFase = (element_id, seccion) => cambia(() => setTareas((ts) => {
    const mias = ordenaFases(ts.filter((t) => t.element_id === element_id && t.seccion === seccion));
    const inst = mias.find((t) => t.etapa === 'instalacion');
    const pos = inst ? posDe(inst) - 1 : (mias.length ? posDe(mias[mias.length - 1]) + 1 : 0);
    return renumera([...ts, tarea({ element_id, seccion, etapa: 'otra', nombre: 'Nueva fase', dias: 1, orden: ordenDe(element_id, seccion), pos })], element_id, seccion);
  }));
  /* Subir o bajar una fase dentro de su proceso. */
  const mueveFase = (id, delta) => cambia(() => setTareas((ts) => {
    const t = ts.find((x) => x.id === id); if (!t) return ts;
    const mias = ordenaFases(ts.filter((x) => x.element_id === t.element_id && x.seccion === t.seccion));
    const i = mias.findIndex((x) => x.id === id); const j = i + delta;
    if (j < 0 || j >= mias.length) return ts;
    const pa = posDe(mias[i]), pb = posDe(mias[j]);
    return renumera(ts.map((x) => (x.id === mias[i].id ? { ...x, pos: pb } : x.id === mias[j].id ? { ...x, pos: pa } : x)), t.element_id, t.seccion);
  }));
  /* La pieza arranca con un solo número: los días totales, como fabricación. */
  const daTiempo = (element_id, dias) => agrega([tarea({ element_id, seccion: '', etapa: 'fabricacion', dias })]);
  /* Varias fases de una vez, desde la gráfica: {material: 3, instalacion: 2}. */
  const darFases = (element_id, dias) => agrega(ETAPAS.filter((k) => dias[k] >= 1).map((k) => tarea({ element_id, seccion: '', etapa: k, dias: dias[k] })));
  const agregaEtapa = (element_id, seccion, etapa) => cambia(() => setTareas((ts) => renumera([...ts, tarea({ element_id, seccion, etapa, dias: 1, orden: ordenDe(element_id, seccion) })], element_id, seccion)));
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
  const etiqueta = (t) => { const e = porPieza.get(t.element_id); return `${e?.code || '?'}${t.seccion ? ' · ' + t.seccion : ''} · ${nombreDe(t)}`; };

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
        <div className="campo total" data-costo-total title="La suma de los costos de todas las fases. Las de piezas ligadas a un ítem son compromisos del proyecto en dash101.">
          <label>Costo de las fases</label>
          <b>{pesos(tareas.reduce((s, t) => s + (Number(t.costo) || 0), 0))}</b>
          <small>{costoDeDash(tareas, items) ? 'en dash101 como compromisos' : 'sin ítem ligado: no sale en dash101'}</small>
        </div>
        <div className="acciones">
          <span className={'estado' + (estado === 'Guardado' ? ' ok' : '')}>{estado}</span>
          <div className="segm chico">
            <button className={modo === 'grafica' ? 'on' : ''} onClick={() => cambiaModo('grafica')}>Gráfica</button>
            <button className={modo === 'lista' ? 'on' : ''} onClick={() => cambiaModo('lista')}>Lista</button>
          </div>
          <a className="btn sm" href={`${BASE}/api/projects/${pid}/cronograma.xlsx`} download title="Bajar el cronograma en Excel">Excel</a>
          <a className="btn sm" href={`${BASE}/api/projects/${pid}/cronograma.xml`} download title="Bajar el cronograma para Microsoft Project (XML)">Project</a>
        </div>
      </div>
      <div className="crono-nota muted">Cada pieza nace con sus tres fases: material 10 días, fabricación 24 e instalación 12, y el costo por tipo de ítem (muebles 30 % materiales y 30 % mano de obra; puertas 35 y 35; servicios 5 y 55; acabados 40 y 20, sobre el precio del ítem). Lo que se quite, se queda quitado. Los días se cuentan de lunes a sábado. Una pieza corre desde que tiene anticipo (se reparte en dash101 al registrar el pago) y diseño definido (se fecha en el ítem); mientras le falte alguno, corre desde hoy. Dentro de cada proceso, el material llega, luego se fabrica y luego se instala; las instalaciones de los procesos de una pieza van una tras otra. {modo === 'grafica' ? 'Arrastra una barra sobre otra para encadenarla antes o después; al vacío, para fijarle la fecha. ' : ''}{conTiempo} de {items.length} piezas con tiempo.</div>
      {!items.length && <div className="empty"><h3>Sin piezas</h3>El cronograma se arma con los ítems de la obra.</div>}
      {modo === 'grafica' && !!items.length && (
        <Gantt c={c} tareas={tareas} items={items} fechasDe={fechasDe} onPon={pon} onEncadena={encadena} onDarFases={darFases} onIr={onIr} />
      )}
      {modo === 'lista' && items.map((e) => {
        const mias = tareas.filter((t) => t.element_id === e.element_id);
        const secciones = seccionesDe(mias);
        const vivo = porPieza.get(e.element_id);
        return (
          <section key={e.element_id} className={'pieza' + (mias.length ? '' : ' sin')}>
            <header>
              <button className="nombre" onClick={() => onIr && onIr(e)} title="Abrir el ítem">{e.code ? <b>{e.code}</b> : null} {e.name}</button>
              <span className="muted">{e.type}{e.plan_name ? ` · ${e.plan_name}` : ''}</span>
              <Candados k={e.candados} />
              {mias.length ? <span className="fechas">{fecha(vivo?.inicio)} → {fecha(vivo?.fin)} · {plural(vivo?.dias || 0, 'día', 'días')} · {pesos(mias.reduce((s, t) => s + (Number(t.costo) || 0), 0))}</span> : null}
            </header>
            {!mias.length && <DarTiempo onOk={(d) => daTiempo(e.element_id, d)} />}
            {secciones.map((s) => {
              const deS = ordenaFases(mias.filter((t) => t.seccion === s));
              const faltan = ETAPAS.filter((k) => !deS.some((t) => t.etapa === k));
              const soloTotal = secciones.length === 1 && s === '' && deS.length === 1 && deS[0].etapa === 'fabricacion';
              return (
                <div key={deS[0].id} className="seccion">
                  {(secciones.length > 1 || s) && (
                    <div className="seccion-cab">
                      {/* La llave del bloque es el id de su primera fase y no el
                          nombre: si fuera el nombre, cada tecla volvería a crear
                          el bloque y el campo perdería el foco (Mike, 6-oct). */}
                      <label className="seccion-nombre"><i aria-hidden="true">✎</i><input value={s} placeholder="Nombre del proceso" title="El nombre del proceso: se puede cambiar" onChange={(ev) => renombra(e.element_id, s, ev.target.value)} /></label>
                    </div>
                  )}
                  {deS.map((t, i) => (
                    <Fila key={t.id} t={t} soloTotal={soloTotal} fechas={fechasDe.get(t.id)} proveedores={c.proveedores} contratistas={c.contratistas || []}
                      otras={tareas.filter((o) => o.id !== t.id)} etiqueta={etiqueta}
                      onPon={(p) => pon(t.id, p)} onQuita={() => quita(t.id)}
                      onSube={i > 0 ? () => mueveFase(t.id, -1) : null} onBaja={i < deS.length - 1 ? () => mueveFase(t.id, 1) : null} />
                  ))}
                  <div className="agregar">
                    {soloTotal ? <span className="muted">Desglosar:</span> : null}
                    {faltan.map((k) => <button key={k} className="btn sm" onClick={() => agregaEtapa(e.element_id, s, k)}>+ {NOMBRE[k]}</button>)}
                    <button className="btn sm" onClick={() => agregaFase(e.element_id, s)} title="Una fase más en este proceso (pintura, pulido, secado…), con el nombre que le pongas">+ Otra fase</button>
                  </div>
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

function Fila({ t, soloTotal, fechas, proveedores, contratistas = [], otras, etiqueta, onPon, onQuita, onSube, onBaja }) {
  const tipo = TIPO_DE[t.etapa];
  const lista = proveedores.filter((p) => p.tipo === tipo || p.id === t.proveedor_id);
  /* El responsable es UNO: proveedor o contratista (Mike, 6-oct). El valor
   * del menú lleva de quién se trata, y escoger uno suelta al otro. */
  const responsable = t.proveedor_id ? `prov:${t.proveedor_id}` : t.contratista_id ? `con:${t.contratista_id}` : '';
  const ponResponsable = (v) => onPon(v.startsWith('prov:') ? { proveedor_id: v.slice(5), contratista_id: null } : v.startsWith('con:') ? { proveedor_id: null, contratista_id: v.slice(4) } : { proveedor_id: null, contratista_id: null });
  return (
    <div className="tarea">
      {/* El nombre de la fase se edita aquí mismo (Mike, 6-oct); vacío, vuelve al de su etapa. */}
      <span className="etapa">
        <span className="orden">
          <button className="flecha" disabled={!onSube} onClick={onSube || undefined} title="Subir esta fase" aria-label="Subir">▲</button>
          <button className="flecha" disabled={!onBaja} onClick={onBaja || undefined} title="Bajar esta fase" aria-label="Bajar">▼</button>
        </span>
        <input className="fase-nombre" value={t.nombre || ''} placeholder={soloTotal ? 'Tiempo total' : NOMBRE[t.etapa]} title={`Fase de ${NOMBRE[t.etapa].toLowerCase()}: el nombre se puede cambiar`} onChange={(e) => onPon({ nombre: e.target.value || null })} />
      </span>
      <label className="dias"><input type="number" min="1" step="1" inputMode="numeric" value={t.dias} onChange={(e) => onPon({ dias: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })} /><span>días</span></label>
      <select className="prov" data-responsable value={responsable} onChange={(e) => ponResponsable(e.target.value)} title={tipo === 'materiales' ? 'Quién surte el material' : 'Quién lo hace: el taller, un proveedor de servicios o un contratista de la obra'}>
        <option value="">{tipo === 'materiales' ? '(sin responsable)' : '(el taller)'}</option>
        {lista.length ? <optgroup label="Proveedores">{lista.map((p) => <option key={p.id} value={`prov:${p.id}`}>{p.nombre}</option>)}</optgroup> : null}
        {contratistas.length ? <optgroup label="Contratistas de la obra">{contratistas.map((u) => <option key={u.id} value={`con:${u.id}`}>{u.nombre}{u.empresa ? ` · ${u.empresa}` : ''}</option>)}</optgroup> : null}
      </select>
      <label className="costo" title="Lo que cuesta esta fase. Con un ítem ligado, es un compromiso del proyecto en dash101 y entra al flujo proyectado">$<input type="number" min="0" step="0.01" inputMode="decimal" data-costo value={(Number(t.costo) || 0) / 100} onChange={(e) => onPon({ costo: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)) })} /></label>
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
/* 0.73.0 · Cada fase lleva RESPONSABLE (proveedor o contratista, no los dos)
 * y COSTO en centavos (Mike, 6-oct). El costo nace en el servidor por tipo de
 * ítem; aquí se corrige. */
const tarea = ({ element_id, seccion = '', etapa, nombre = null, pos = null, dias = 1, orden = 0, depende_de = null }) => ({ id: nuevoId(), element_id, seccion, orden, etapa, nombre, pos: Number.isInteger(pos) ? pos : ETAPAS.indexOf(etapa) * 10, dias, proveedor_id: null, contratista_id: null, costo: 0, depende_de, inicio_fijo: null, notas: null });
const limpia = (t) => ({ id: t.id, element_id: t.element_id, seccion: t.seccion || '', orden: t.orden || 0, etapa: t.etapa, nombre: t.nombre || null, pos: Number.isInteger(t.pos) ? t.pos : ETAPAS.indexOf(t.etapa) * 10, dias: t.dias, proveedor_id: t.proveedor_id || null, contratista_id: t.contratista_id || null, costo: Number(t.costo) || 0, depende_de: t.depende_de || null, inicio_fijo: t.inicio_fijo || null, notas: t.notas || null });
const aServidor = (t) => ({ id: t.id, element_id: t.element_id, seccion: t.seccion, orden: t.orden, etapa: t.etapa, nombre: t.nombre || null, pos: posDe(t), dias: Number(t.dias) || 1, proveedor_id: t.proveedor_id, contratista_id: t.contratista_id || null, costo: Math.max(0, Math.round(Number(t.costo) || 0)), depende_de: t.depende_de, inicio_fijo: t.inicio_fijo, notas: t.notas });
/** Pesos con centavos, para leer. */
export const pesos = (centavos) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((Number(centavos) || 0) / 100);
/** Quién responde por la fase: el proveedor o el contratista, por nombre. */
export const responsableDe = (t, c) => (t.proveedor_id ? (c.proveedores.find((p) => p.id === t.proveedor_id) || {}).nombre : t.contratista_id ? (c.contratistas || []).find((u) => u.id === t.contratista_id)?.nombre : '') || '';
/* Las secciones de una pieza, en el orden en que se crearon. */
/** Si algo de ese costo llega a dash101: hace falta una pieza LIGADA a un ítem con costo. */
const costoDeDash = (ts, items) => ts.some((t) => (Number(t.costo) || 0) > 0 && (items.find((e) => e.element_id === t.element_id) || {}).candados?.ligado);
const seccionesDe = (ts) => [...ts].sort((a, b) => (a.orden || 0) - (b.orden || 0)).reduce((acc, t) => (acc.includes(t.seccion) ? acc : [...acc, t.seccion]), []);
