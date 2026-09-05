import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api, leer, escribir, hayRed, fileUrl, elStatus, FASES, fmtD, isLate, rasterizePlan } from './api.js';
import { useApp } from './App.jsx';
import PlanCanvas from './PlanCanvas.jsx';
import ElementPanel from './ElementPanel.jsx';
import { buildReport, REPORT_CSS } from './report.js';

const TYPES = ['Mueble', 'Puerta', 'Instalación', 'Acabado', 'Herrería', 'Carpintería', 'Domótica', 'Otro'];

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
  const [filterOpen, setFilterOpen] = useState(false);
  const [tipo, setTipo] = useState('');   // '' = todos los tipos
  const [fase, setFase] = useState('');   // '' = las dos fases
  const [drawer, setDrawer] = useState(false);
  const [openItems, setOpenItems] = useState(null);
  const [mview, setMview] = useState('plan'); // móvil: plan | pend | elem
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
    const hay = new Set((data?.elements || []).map((e) => e.type).filter(Boolean));
    return [...new Set([...TYPES.filter((t) => hay.has(t)), ...hay])];
  }, [data]);
  const shown = elements
    .filter((e) => !tipo || e.type === tipo)
    .filter((e) => !fase || (e.fase || 'produccion') === fase)
    .filter((e) => !filterOpen || e.n_pend + e.n_proc > 0);
  const enFase = (f) => elements.filter((e) => (e.fase || 'produccion') === f).length;
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
        <button className="logo" onClick={() => go('/')} title="Proyectos"><i /><span>Bitácora</span></button>
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
          <div className="eyebrow">Color del pin</div>
          <div className="legend"><span><i className="dot pend" />Con pendientes</span><span><i className="dot proc" />En proceso</span><span><i className="dot ok" />Resuelto</span><span><i className="dot" />Sin punchlist</span><span><i className="dot hueco" />En producción</span></div>
        </section>
        <section>
          {tipos.length > 1 && (
            <>
              <button className={'item' + (!tipo ? ' on' : '')} onClick={() => setTipo('')}>Todos los tipos <small>{elements.length}</small></button>
              {tipos.map((t) => (
                <button key={t} className={'item' + (tipo === t ? ' on' : '')} onClick={() => setTipo(tipo === t ? '' : t)}>
                  {t} <small>{elements.filter((e) => e.type === t).length}</small>
                </button>
              ))}
            </>
          )}
          <button className={'item' + (fase === 'produccion' ? ' on' : '')} onClick={() => setFase(fase === 'produccion' ? '' : 'produccion')}>En producción <small>{enFase('produccion')}</small></button>
          <button className={'item' + (fase === 'punchlist' ? ' on' : '')} onClick={() => setFase(fase === 'punchlist' ? '' : 'punchlist')}>Entregados <small>{enFase('punchlist')}</small></button>
          <button className={'item' + (filterOpen ? ' on' : '')} onClick={() => setFilterOpen(!filterOpen)}>Sólo pines con pendientes <small>{elements.filter((e) => e.n_pend + e.n_proc > 0).length}</small></button>
          <button className={'item' + (drawer ? ' on' : '')} onClick={() => setDrawer(!drawer)}>Ver lista de pendientes <small>{openTotal}</small></button>
          {staff && <button className="item" onClick={() => go('/admin')}>Usuarios y accesos</button>}
        </section>
      </aside>

      <main className="stage">
        <div className="tools">
          {plan && <span className="btn sm" style={{ fontWeight: 500 }}>{plan.name}{plan.file_name ? ` — ${plan.file_name}` : ''}</span>}
          {data.plans.length > 1 && <select className="btn sm" style={{ width: 'auto' }} value={planId || ''} onChange={(e) => { setPlanId(e.target.value); setSel(null); }}>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <div className="spacer" />
          {tipos.length > 1 && (
            <select className={'btn sm' + (tipo ? ' on' : '')} style={{ width: 'auto' }} value={tipo} onChange={(ev) => setTipo(ev.target.value)} title="Ver solo un tipo de ítem">
              <option value="">Todos los tipos</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <select className={'btn sm' + (fase ? ' on' : '')} style={{ width: 'auto' }} value={fase} onChange={(ev) => setFase(ev.target.value)} title="Ver una sola fase">
            <option value="">Las dos fases</option>
            {Object.entries(FASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className={'btn sm' + (filterOpen ? ' on' : '')} onClick={() => setFilterOpen(!filterOpen)} title="Sólo pines con pendientes">Pendientes {filterOpen ? '●' : '○'}</button>
        </div>
        {(tipo || fase || filterOpen) && !adding && (
          <div className="hint">
            Viendo {shown.length} de {elements.length} ítems{tipo ? ` · solo ${tipo}` : ''}{fase ? ` · ${FASES[fase]}` : ''}{filterOpen ? ' · solo con pendientes' : ''}
            <button className="btn sm" onClick={() => { setTipo(''); setFase(''); setFilterOpen(false); }}>Ver todos</button>
          </div>
        )}
        {adding && <div className="hint">Toca el plano donde va el ítem · <button className="btn sm" onClick={() => setAdding(false)}>Cancelar</button></div>}
        {plan ? (
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
        <button className={mview === 'plan' ? 'on' : ''} onClick={() => { setMview('plan'); setDrawer(false); }}><i dangerouslySetInnerHTML={{ __html: ICO.plan }} />Plano</button>
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
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/></svg>',
  elem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>',
};

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
