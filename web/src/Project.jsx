import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api, leer, escribir, hayRed, fileUrl, elStatus, FASES, TIPOS, colorTipo, fmtD, isLate, rasterizePlan, avance } from './api.js';
import { useApp } from './App.jsx';
import PlanCanvas from './PlanCanvas.jsx';
import ElementPanel from './ElementPanel.jsx';
import Marca from './Marca.jsx';
import { buildReport, REPORT_CSS } from './report.js';

const TYPES = TIPOS.map((t) => t.clave);

export default function Project({ id }) {
  const { user, go, logout, toast } = useApp();
  const staff = user.role !== 'con';
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [planId, setPlanId] = useState(null);
  const [sel, setSel] = useState(null);
  const [flash, setFlash] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newAt, setNewAt] = useState(null);
  // Los tipos apagados, no los prendidos: así un tipo nuevo aparece solo, sin
  // que nadie tenga que acordarse de encenderlo.
  const [apagados, setApagados] = useState(() => new Set());
  const [fase, setFase] = useState('');   // '' = las dos fases
  const [drawer, setDrawer] = useState(false);
  const [openItems, setOpenItems] = useState(null);
  const [mview, setMview] = useState('plan'); // móvil: plan | pend | elem
  // El plano contesta "dónde"; la lista contesta "cómo van". Son la misma obra
  // vista de dos maneras y comparten los mismos filtros, así que apagar un tipo
  // en una lo apaga en la otra.
  const [vista, setVista] = useState('plan');   // plan | lista
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [repView, setRepView] = useState(null);
  useEffect(() => { const f = (e) => setRepView(e.detail); window.addEventListener('bo:report', f); return () => window.removeEventListener('bo:report', f); }, []);

  const load = useCallback(async () => {
    try {
      const r = await leer(`/projects/${id}`);
      setData(r);
      setPlanId((p) => (p && r.plans.some((x) => x.id === p) ? p : r.plans[0]?.id || null));
    } catch (e) { toast(e.message); go('/'); }
  }, [id]);
  useEffect(() => { load(); leer('/projects').then((r) => setProjects(r.projects)).catch(() => {}); }, [load]);

  // Bajar los planos de la obra en cuanto se abre, con señal. Se quedan en la
  // caché del navegador, así que el día que se entre al sótano el plano ya está
  // ahí. Un plano que no se puede abrir en obra no sirve de nada.
  useEffect(() => {
    if (!data || !hayRed()) return;
    let vivo = true;
    (async () => {
      for (const p of data.plans) {
        if (!vivo) return;
        for (const llave of [p.image_key, p.source_key]) {
          if (!llave) continue;
          try { await fetch(fileUrl(llave), { credentials: 'same-origin' }); } catch {}
        }
      }
    })();
    return () => { vivo = false; };
  }, [data?.plans?.length, data?.project?.id]);
  useEffect(() => { if (drawer) leer(`/projects/${id}/punch`).then((r) => setOpenItems(r.items)).catch((e) => toast(e.message)); }, [drawer, data]);

  const plan = data?.plans.find((p) => p.id === planId) || null;
  const elements = useMemo(() => (data ? data.elements.filter((e) => e.plan_id === planId) : []), [data, planId]);
  // Los tipos que se pueden elegir salen de la lista de siempre más los que de
  // verdad hay en la obra: un ítem viejo con un tipo que ya no está en la lista
  // seguiría siendo invisible en el filtro, y desaparecer del plano sin que
  // nadie sepa por qué es peor que no filtrar.
  const tipos = useMemo(() => {
    const hay = new Set((data?.elements || []).map((e) => e.type || 'Otro'));
    return [...new Set([...TYPES, ...hay])];
  }, [data]);
  const filtra = (lista) => lista
    .filter((e) => !apagados.has(e.type || 'Otro'))
    .filter((e) => !fase || (e.fase || 'produccion') === fase);
  const shown = filtra(elements);
  // La lista es de toda la obra y no de un plano: un ítem se atora en compras
  // sin que importe en qué hoja está dibujado.
  const listados = useMemo(() => filtra(data?.elements || []), [data, apagados, fase]);
  const etapas = data?.etapas || [];
  const enFase = (f) => elements.filter((e) => (e.fase || 'produccion') === f).length;
  const prende = (t) => setApagados((s0) => { const n = new Set(s0); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const openTotal = data ? data.elements.reduce((a, e) => a + e.n_pend + e.n_proc, 0) : 0;
  const lateTotal = openItems ? openItems.filter(isLate).length : null;

  function selectEl(eid, opts = {}) {
    setSel(eid); setFlash(opts.flash || null);
    if (opts.planId && opts.planId !== planId) setPlanId(opts.planId);
    if (opts.mobile !== false) setMview('elem');
  }
  function onPlanClick(x, y) {
    if (!adding) return;
    setAdding(false); setNewAt({ x, y });
  }
  async function createElement(f) {
    const punto = { ...f, x: newAt.x, y: newAt.y };
    const r = await escribir({
      ruta: `/plans/${planId}/elements`,
      cuerpo: punto,
      // Sin señal el pin aparece igual, con sus ceros: para quien lo clavó ya
      // está puesto, y pedírselo otra vez mañana es la manera de que no lo haga.
      parche: {
        clave: `/projects/${id}`,
        fn: (d) => {
          d.elements = [...(d.elements || []), {
            ...punto, id: 'local-' + Date.now(), plan_id: planId,
            n_pend: 0, n_proc: 0, n_total: 0, n_log: 0, created_at: new Date().toISOString(), __pendiente: true,
          }];
          return d;
        },
      },
    }).catch((e) => { toast(e.message); return null; });
    if (!r) return;
    setNewAt(null); await load();
    if (r.subido && r.r?.id) selectEl(r.r.id);
    else toast('Sin señal: el ítem se sube solo cuando vuelva.');
  }
  async function uploadPlan(file, name) {
    setUploading(true);
    try {
      const { blob, width, height } = await rasterizePlan(file);
      const fd = new FormData();
      fd.append('name', name || file.name.replace(/\.\w+$/, ''));
      fd.append('file_name', file.name);
      fd.append('width', width); fd.append('height', height);
      fd.append('image', new File([blob], 'plan.png', { type: blob.type }));
      if (file.size < 25 * 1024 * 1024) fd.append('source', file);
      const r = await api.form(`/projects/${id}/plans`, fd);
      await load(); setPlanId(r.id); toast('Plano cargado');
    } catch (e) { toast('No se pudo cargar el plano: ' + e.message); } finally { setUploading(false); }
  }
  async function generateReport(opts) {
    setReport(false); toast('Generando reporte…');
    try {
      const rep = await api.get(`/projects/${id}/report`);
      await buildReport({ project: data.project, plans: data.plans, elements: data.elements, ...rep, user, opts: { ...opts, planId, elementId: sel } });
    } catch (e) { toast(e.message); }
  }

  if (!data) return <div className="center"><div className="spin" /></div>;

  const cls = 'app' + (mview === 'elem' && sel ? ' view-elem' : '');
  return (
    <div className={cls}>
      <div className="top">
        {/* La casa manda al menú de obras. Antes ese trabajo lo hacía el nombre
            de la aplicación, que nadie pica porque parece un rótulo, no un
            botón; y en el celular quedaba reducido a un punto de color. */}
        <button className="casa" onClick={() => go('/')} title="Ir a mis obras" aria-label="Ir a mis obras"
          dangerouslySetInnerHTML={{ __html: ICO.casa }} />
        <span className="marca hide-m"><Marca alto={17} /></span>
        <select value={id} onChange={(e) => go(`/p/${e.target.value}`)}>
          {(projects.length ? projects : [data.project]).map((p) => <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</option>)}
        </select>
        <div className="spacer" />
        {staff && <button className="btn sm hide-m" onClick={() => setReport(true)} disabled={!plan}>Generar reporte</button>}
        {staff && <button className="btn primary sm" onClick={() => { if (!plan) return toast('Primero sube un plano'); setAdding(true); setMview('plan'); }}>+ Ítem</button>}
        <button className="avatar hide-m" onClick={logout} title={`${user.name} · salir`}>{user.name.slice(0, 2).toUpperCase()}</button>
      </div>

      <aside className="rail">
        <section>
          <div className="eyebrow">Planos</div>
          {data.plans.map((p) => <button key={p.id} className={'item' + (p.id === planId ? ' on' : '')} onClick={() => { setPlanId(p.id); setSel(null); }}><span>{p.name}</span><small>{data.elements.filter((e) => e.plan_id === p.id).length} ítems</small></button>)}
          {staff && <label className="btn sm" style={{ justifyContent: 'flex-start' }}>{uploading ? 'Procesando…' : '+ Subir plano (PDF / imagen)'}<input type="file" accept="application/pdf,image/*" hidden disabled={uploading} onChange={(e) => e.target.files[0] && uploadPlan(e.target.files[0])} /></label>}
          {staff && plan && <button className="btn sm" style={{ justifyContent: 'flex-start' }} onClick={() => setEditPlan(true)}>Renombrar / borrar plano</button>}
        </section>
        <section>
          <div className="eyebrow">Resumen del plano</div>
          <div className="stats">
            <div className="stat"><b>{elements.length}</b><span>ítems</span></div>
            <div className="stat"><b>{enFase('produccion')}</b><span>en producción</span></div>
            <div className="stat"><b>{elements.reduce((a, e) => a + e.n_pend + e.n_proc, 0)}</b><span>pendientes</span></div>
            <div className="stat"><b>{data.elements.length}</b><span>en la obra</span></div>
          </div>
        </section>
        <section>
          <div className="eyebrow">Cómo leer un pin</div>
          <div className="legend">
            <span><i className="dot" style={{ background: colorTipo('Mueble') }} />El relleno es el tipo</span>
            <span><i className="dot aro pend" />Aro rojo: con pendientes</span>
            <span><i className="dot aro proc" />Aro ámbar: en proceso</span>
            <span><i className="dot aro ok" />Aro verde: todo resuelto</span>
            <span><i className="dot hueco" />Hueco: en producción</span>
          </div>
        </section>
        <section>
          {tipos.map((t) => (
            <button key={t} className={'item swatch fila' + (apagados.has(t) ? ' off' : '')} onClick={() => prende(t)} style={{ ['--tinte']: colorTipo(t) }}>
              <i />{t} <small>{elements.filter((e) => (e.type || 'Otro') === t).length}</small>
            </button>
          ))}
          <button className={'item' + (fase === 'produccion' ? ' on' : '')} onClick={() => setFase(fase === 'produccion' ? '' : 'produccion')}>En producción <small>{enFase('produccion')}</small></button>
          <button className={'item' + (fase === 'punchlist' ? ' on' : '')} onClick={() => setFase(fase === 'punchlist' ? '' : 'punchlist')}>Punchlist <small>{enFase('punchlist')}</small></button>
          <button className={'item' + (vista === 'lista' ? ' on' : '')} onClick={() => setVista(vista === 'lista' ? 'plan' : 'lista')}>Ver la obra en lista <small>{data.elements.length}</small></button>
          <button className={'item' + (drawer ? ' on' : '')} onClick={() => setDrawer(!drawer)}>Ver lista de pendientes <small>{openTotal}</small></button>
          {staff && <button className="item" onClick={() => go('/admin')}>Usuarios y accesos</button>}
        </section>
      </aside>

      <main className={'stage' + (vista === 'lista' ? ' enlista' : '')}>
        <div className="tools">
          <div className="segm">
            <button className={vista === 'plan' ? 'on' : ''} onClick={() => setVista('plan')}>Plano</button>
            <button className={vista === 'lista' ? 'on' : ''} onClick={() => { setVista('lista'); setDrawer(false); setMview('plan'); }}>Lista</button>
          </div>
          {vista === 'plan' && plan && <span className="btn sm hide-m" style={{ fontWeight: 500 }}>{plan.name}{plan.file_name ? ` — ${plan.file_name}` : ''}</span>}
          {vista === 'plan' && data.plans.length > 1 && <select className="btn sm" style={{ width: 'auto' }} value={planId || ''} onChange={(e) => { setPlanId(e.target.value); setSel(null); }}>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <div className="spacer" />
          {/* En escritorio los interruptores viven en la barra lateral, a la
              vista siempre; repetirlos aquí arriba era decir dos veces lo
              mismo y quitarle aire al plano. En el celular no hay barra
              lateral, así que aquí es donde tienen que estar. */}
          <div className="swatches solo-m">
            {tipos.map((t) => (
              <button key={t} className={'swatch' + (apagados.has(t) ? ' off' : '')} onClick={() => prende(t)}
                style={{ ['--tinte']: colorTipo(t) }} title={apagados.has(t) ? `Mostrar ${t}` : `Ocultar ${t}`}>
                <i />{t}<small>{elements.filter((e) => (e.type || 'Otro') === t).length}</small>
              </button>
            ))}
          </div>
          <select className={'btn sm' + (fase ? ' on' : '')} style={{ width: 'auto' }} value={fase} onChange={(ev) => setFase(ev.target.value)} title="Ver una sola fase">
            <option value="">Las dos fases</option>
            {Object.entries(FASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {(apagados.size > 0 || fase) && !adding && (
          <div className="hint">
            Viendo {vista === 'lista' ? listados.length : shown.length} de {vista === 'lista' ? data.elements.length : elements.length} ítems{apagados.size ? ` · sin ${[...apagados].join(', ').toLowerCase()}` : ''}{fase ? ` · ${FASES[fase]}` : ''}
            <button className="btn sm" onClick={() => { setApagados(new Set()); setFase(''); }}>Ver todos</button>
          </div>
        )}
        {adding && <div className="hint">Toca el plano donde va el ítem · <button className="btn sm" onClick={() => setAdding(false)}>Cancelar</button></div>}
        {vista === 'lista' ? (
          <Lista items={listados} etapas={etapas} plans={data.plans} sel={sel}
            onIr={(e) => { selectEl(e.id, { planId: e.plan_id }); if (window.innerWidth <= 900) setMview('elem'); }} />
        ) : plan ? (
          <PlanCanvas plan={plan} elements={shown} sel={sel} flash={flash} adding={adding} onPick={(eid) => selectEl(eid)} onClick={onPlanClick} />
        ) : (
          <div className="center" style={{ position: 'absolute', inset: 0 }}>
            <div className="empty"><h3>Sin planos</h3>{staff ? <label className="btn primary">{uploading ? 'Procesando…' : 'Subir plano (PDF o imagen)'}<input type="file" accept="application/pdf,image/*" hidden disabled={uploading} onChange={(e) => e.target.files[0] && uploadPlan(e.target.files[0])} /></label> : 'El supervisor aún no ha cargado planos.'}</div>
          </div>
        )}
        {drawer && (
          <div className="drawer">
            <div className="dh"><span>Pendientes · {openItems ? openItems.length : '…'}{lateTotal ? <span className="pill late" style={{ marginLeft: 8 }}>{lateTotal} vencidos</span> : null}</span><button className="btn sm" onClick={() => setDrawer(false)}>×</button></div>
            {openItems && !openItems.length && <div className="empty">Sin pendientes abiertos.</div>}
            {openItems && openItems.map((k) => (
              <button key={k.id} className={'drow' + (flash === k.id ? ' on' : '')} onClick={() => { selectEl(k.element_id, { flash: k.id, planId: k.plan_id }); if (window.innerWidth <= 900) setDrawer(false); }}>
                <i className={'dot ' + k.status} /><div><div className="t">{k.title}</div><div className="s">{k.element_code} · {k.element_name} · {k.plan_name}</div></div>
                <span className={'due' + (isLate(k) ? ' late' : '')}>{isLate(k) ? 'Vencido ' : ''}{fmtD(k.due_date)}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <ElementPanel key={sel || 'none'} elementId={sel} flash={flash} plan={plan} staff={staff} user={user} members={data.members} todos={data.elements} onIr={(eid, pid) => selectEl(eid, { planId: pid })} onChanged={load} onClose={() => { setSel(null); setMview('plan'); }} />

      <nav className="mnav">
        <button className={mview === 'plan' && vista === 'plan' ? 'on' : ''} onClick={() => { setMview('plan'); setVista('plan'); setDrawer(false); }}><i dangerouslySetInnerHTML={{ __html: ICO.plan }} />Plano</button>
        <button className={vista === 'lista' ? 'on' : ''} onClick={() => { setMview('plan'); setVista('lista'); setDrawer(false); }}><i dangerouslySetInnerHTML={{ __html: ICO.tabla }} />Lista</button>
        <button className={drawer ? 'on' : ''} onClick={() => { setMview('plan'); setDrawer(!drawer); }}><i dangerouslySetInnerHTML={{ __html: ICO.list }} />Pendientes{openTotal ? <span className="badge">{openTotal}</span> : null}</button>
        <button className={mview === 'elem' ? 'on' : ''} disabled={!sel} onClick={() => sel && setMview('elem')} style={{ opacity: sel ? 1 : .4 }}><i dangerouslySetInnerHTML={{ __html: ICO.elem }} />Ítem</button>
        {staff && <button onClick={() => plan && setReport(true)}><i dangerouslySetInnerHTML={{ __html: ICO.doc }} />Reporte</button>}
      </nav>

      {newAt && <NewElementModal n={data.elements.length + 1} members={data.members} onCancel={() => setNewAt(null)} onOk={createElement} />}
      {report && <ReportModal hasSel={!!sel} onCancel={() => setReport(false)} onOk={generateReport} />}
      {repView && <ReportView {...repView} onClose={() => setRepView(null)} />}
      {editPlan && plan && <EditPlanModal plan={plan} onClose={() => setEditPlan(false)} onChanged={load} />}
    </div>
  );
}

const ICO = {
  casa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/></svg>',
  tabla: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 10v9"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/></svg>',
  elem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>',
};

// La obra entera en una lista: qué es cada ítem, en qué etapa va y qué le falta.
//
// El plano contesta dónde está cada cosa; para saber cómo van hay que picar pin
// por pin. Aquí se ve de un jalón, y arriba el embudo dice cuántos ítems han
// pasado cada etapa: ahí es donde se nota que catorce se atoraron en flete.
function Lista({ items, etapas, plans, sel, onIr }) {
  const nombrePlan = (id) => (plans.find((p) => p.id === id) || {}).name || '';
  // Cuántos ítems llevan cumplida cada etapa. Como el camino no tiene huecos,
  // basta con comparar contra el número de etapas que lleva cada uno.
  const embudo = etapas.map((x, i) => ({ ...x, n: items.filter((e) => (e.n_etapas || 0) > i).length }));
  const orden = [...items].sort((a, b) => (a.code || '').localeCompare(b.code || '', 'es', { numeric: true }) || a.name.localeCompare(b.name, 'es'));

  return (
    <div className="lista">
      {!!etapas.length && (
        <div className="embudo">
          {embudo.map((x) => (
            <div key={x.clave} className={'ecol' + (x.abre_punchlist ? ' bisagra' : '')}>
              <b>{x.n}</b>
              <span>{x.nombre}</span>
              <i style={{ width: items.length ? `${(x.n / items.length) * 100}%` : 0 }} />
            </div>
          ))}
          <div className="ecol total"><b>{items.length}</b><span>ítems</span></div>
        </div>
      )}
      {!orden.length && <div className="empty"><h3>Sin ítems</h3>Ninguno cumple con los filtros de arriba.</div>}
      {orden.map((e) => {
        const av = avance(e, etapas);
        const abiertos = (e.n_pend || 0) + (e.n_proc || 0);
        const etapaActual = av.hechas >= av.total ? 'Entregado' : (etapas[av.hechas] || {}).nombre || '—';
        return (
          <button key={e.id} className={'lrow' + (e.id === sel ? ' on' : '')} onClick={() => onIr(e)}>
            <i className="tipo" style={{ background: colorTipo(e.type || 'Otro') }} title={e.type} />
            <div className="id">
              <div className="t">{e.code ? <b>{e.code}</b> : null} {e.name}</div>
              <div className="s">{e.type || 'Otro'} · {nombrePlan(e.plan_id)}{e.resp ? ` · ${e.resp}` : ''}</div>
            </div>
            <div className="pipe" title={`${av.hechas} de ${av.total} etapas`}>
              {etapas.map((x, i) => (
                <i key={x.clave} className={(i < av.hechas ? 'ok' : '') + (x.abre_punchlist ? ' bisagra' : '')} />
              ))}
            </div>
            <div className="pct">
              <span>{av.pct}%</span>
              <small>{etapaActual}</small>
            </div>
            <div className="pend">
              {(e.fase || 'produccion') === 'punchlist'
                ? (e.n_total
                    ? <span className={'pill ' + (e.n_pend ? 'pend' : e.n_proc ? 'proc' : 'ok')}>{abiertos ? `${abiertos} abierto${abiertos > 1 ? 's' : ''}` : 'Todo resuelto'}</span>
                    : <span className="pill gen">Sin pendientes</span>)
                : <span className="pill gen">En producción</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function NewElementModal({ n, members, onCancel, onOk }) {
  const [f, setF] = useState({ code: `E-${String(n).padStart(2, '0')}`, type: 'Mueble', name: '', resp: '' });
  const resps = [...new Set(members.map((m) => m.company || m.name).filter(Boolean))];
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onOk(f); }}>
        <div><div className="eyebrow">Nuevo ítem</div><h2>Ubicado en el plano</h2></div>
        <div className="two">
          <div className="field"><label>Clave</label><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
          <div className="field"><label>Tipo</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div className="field"><label>Nombre</label><input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Cocina — isla central" /></div>
        <div className="field"><label>Responsable</label><input list="resps" value={f.resp} onChange={(e) => setF({ ...f, resp: e.target.value })} placeholder="Taller 101 / contratista" /><datalist id="resps">{resps.map((r) => <option key={r} value={r} />)}</datalist></div>
        <div className="acts"><button type="button" className="btn" onClick={onCancel}>Cancelar</button><button className="btn primary">Crear ítem</button></div>
      </form>
    </div>
  );
}

function ReportModal({ hasSel, onCancel, onOk }) {
  const [o, setO] = useState({ type: 'punch', scope: hasSel ? 'elem' : 'plano', status: 'abiertos', from: '', to: '', dest: '' });
  const Seg = ({ k, opts }) => <div className="seg">{opts.map(([v, l]) => <button key={v} type="button" className={o[k] === v ? 'on' : ''} onClick={() => setO({ ...o, [k]: v })}>{l}</button>)}</div>;
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onOk(o); }}>
        <div><div className="eyebrow">Reporte</div><h2>¿Qué reporte necesitas?</h2></div>
        <div className="field"><label>Tipo</label><Seg k="type" opts={[['bitacora', 'Bitácora'], ['punch', 'Punchlist'], ['ambos', 'Ambos']]} /></div>
        <div className="field"><label>Alcance</label><Seg k="scope" opts={[...(hasSel ? [['elem', 'Este ítem']] : []), ['plano', 'Este plano'], ['proj', 'Todo el proyecto']]} /></div>
        {o.type !== 'punch' && <div className="two"><div className="field"><label>Desde</label><input type="date" value={o.from} onChange={(e) => setO({ ...o, from: e.target.value })} /></div><div className="field"><label>Hasta</label><input type="date" value={o.to} onChange={(e) => setO({ ...o, to: e.target.value })} /></div></div>}
        {o.type !== 'bitacora' && <div className="field"><label>Punchlist: incluir</label><Seg k="status" opts={[['abiertos', 'Sólo abiertos'], ['todos', 'Todos']]} /></div>}
        <div className="field"><label>Para (nombre del destinatario, opcional)</label><input value={o.dest} onChange={(e) => setO({ ...o, dest: e.target.value })} placeholder="Arq. Rodríguez — Constructora" /></div>
        <div className="acts"><button type="button" className="btn" onClick={onCancel}>Cancelar</button><button className="btn primary">Generar</button></div>
      </form>
    </div>
  );
}

function EditPlanModal({ plan, onClose, onChanged }) {
  const { toast } = useApp();
  const [name, setName] = useState(plan.name);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={async (e) => { e.preventDefault(); await api.patch(`/plans/${plan.id}`, { name }).catch((x) => toast(x.message)); onChanged(); onClose(); }}>
        <h2>Plano</h2>
        <div className="field"><label>Nombre</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        {!confirm ? <button type="button" className="btn danger" onClick={() => setConfirm(true)}>Borrar plano y todos sus ítems…</button>
          : <button type="button" className="btn danger" onClick={async () => { await api.del(`/plans/${plan.id}`).catch((x) => toast(x.message)); onChanged(); onClose(); }}>Confirmar borrado definitivo</button>}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar</button></div>
      </form>
    </div>
  );
}

function ReportView({ html, title, onClose }) {
  return (
    <div className="report">
      <style>{REPORT_CSS}</style>
      <div className="rbar"><button className="btn sm" onClick={onClose}>← Volver</button><b>{title}</b><div className="spacer" /><button className="btn primary sm" onClick={() => window.print()}>Imprimir / Guardar PDF</button></div>
      <div className="sheet" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
