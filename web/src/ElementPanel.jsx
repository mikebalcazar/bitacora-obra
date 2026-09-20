import React, { useEffect, useRef, useState } from 'react';
import { api, leer, escribir, fileUrl, FASES, ALCANCES, TIPOS, fmtD, fmtT, fmtDay, isLate, ini, ST, ROLES, compressImage, todayISO } from './api.js';
import { useApp } from './App.jsx';
import { Photos, usePending, PhotoInput, PendingStrip } from './Fotos.jsx';
import { Duda } from './Dudas.jsx';

// staff = puede escribir. veTodo = puede ver la obra completa. No son lo mismo:
// el trabajador ve todo y no escribe nada, y el contratista ni ve todo ni
// escribe, salvo la evidencia de lo que le tocó.
export default function ElementPanel({ elementId, flash, plan, staff, veTodo = staff, user, members = [], todos = [], onIr, onChanged, onClose, onReubicar }) {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState(!veTodo || flash ? 'punch' : 'log');
  // El proceso no es una pestaña: es el estado del ítem, y se lee de reojo
  // mientras se escribe en la bitácora. Vive en una barra abajo que se abre
  // cuando hay que palomear algo.
  const [proc, setProc] = useState(false);
  const [lb, setLb] = useState(null);
  const [edit, setEdit] = useState(false);

  const load = () => elementId && leer(`/elements/${elementId}`).then(setD).catch((e) => toast(e.message));
  useEffect(() => { setD(null); setProc(false); load(); }, [elementId]);
  useEffect(() => { if (flash) setTab('punch'); }, [flash]);
  useEffect(() => { if (flash && d) setTimeout(() => document.querySelector(`[data-k="${flash}"]`)?.scrollIntoView({ block: 'center' }), 50); }, [flash, d]);

  if (!elementId) return <aside className="panel"><div className="empty"><h3>Selecciona un ítem</h3>Toca un pin del plano{staff ? ' o crea uno con + Ítem' : veTodo ? '.' : '. Los tuyos van resaltados; de los demás sólo ves dónde están.'}</div></aside>;
  if (!d) return <aside className="panel"><div className="spin" /></aside>;
  const { element: e, log, punch, etapas = [], hechas = [], contratistas = [] } = d;
  // El cliente: el ítem para ubicarse y sus puntos por definir (encargo B).
  if (d.cliente) return <ItemCliente d={d} plan={plan} user={user} onClose={onClose} onChanged={() => { load(); onChanged(); }} />;
  // Un ítem que no es suyo: el servidor ya lo recortó a nombre, código y
  // posición. Aquí sólo se dice, sin inventar lo que no vino.
  if (d.recorte) {
    return (
      <aside className="panel">
        <div className="head">
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={onClose} title="Cerrar">←</button>
            <div className="eyebrow">{e.type} · <span style={{ color: 'var(--accent)' }}>{e.code}</span></div>
          </div>
          <h2>{e.name}</h2>
          <div className="meta"><span>{e.plan_name}</span></div>
        </div>
        <div className="recorte">Este ítem <b>no es tuyo</b>: sólo sale para que te ubiques en el plano. Lo que trae —pendientes, bitácora, fotos— es de quien lo lleva.</div>
      </aside>
    );
  }
  const nEtapas = etapas.filter((x) => hechas.some((h) => h.etapa === x.clave)).length;
  const open = punch.filter((k) => k.status !== 'ok').length;
  const changed = () => { load(); onChanged(); };

  // Entregar es un acto, no un detalle: se pregunta antes, y al devolver a
  // producción se avisa que los pendientes no se borran, solo se guardan.
  async function entregar(a) {
    const yendo = a === 'punchlist';
    const aviso = yendo
      ? `¿Dar por entregado ${e.code || e.name}? A partir de ahí se le levantan pendientes.`
      : `¿Regresar ${e.code || e.name} a producción? Los pendientes que ya tiene no se borran: vuelven a la vista cuando se entregue otra vez.`;
    if (!confirm(aviso)) return;
    await escribir({ ruta: `/elements/${e.id}/fase`, cuerpo: { fase: a } }).catch((x) => toast(x.message));
    changed();
  }

  return (
    <aside className="panel">
      <div className="head">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={onClose} title="Cerrar">←</button>
          <div className="eyebrow">{e.type} · <span style={{ color: 'var(--accent)' }}>{e.code}</span></div>
          <div className="spacer" />
          {staff && <button className="btn sm" onClick={() => setEdit(true)}>Editar</button>}
        </div>
        {/* Saltar de un ítem a otro sin volver al plano. En el celular el plano
            ocupa toda la pantalla, así que revisar diez ítems seguidos eran
            treinta toques; aquí son diez. Los de otro plano también salen, y al
            elegirlos el plano cambia solo. */}
        {todos.length > 1 && onIr && (
          <select
            className="saltar"
            value={e.id}
            onChange={(ev) => {
              const otro = todos.find((x) => x.id === ev.target.value);
              if (otro) onIr(otro.id, otro.plan_id);
            }}
          >
            {todos.map((x) => {
              const abiertos = (x.n_pend || 0) + (x.n_proc || 0);
              return (
                <option key={x.id} value={x.id}>
                  {x.code ? `${x.code} · ` : ''}{x.name}{abiertos ? ` — ${abiertos} pend.` : ''}
                </option>
              );
            })}
          </select>
        )}
        <h2>{e.name}</h2>
        <div className="meta">
          <span className={'pill fase ' + e.fase}>{FASES[e.fase] || 'Producción'}</span>
          {/* El alcance, cuando NO está dentro. Dentro no se pinta: la obra
              es lo que se está fabricando, y una etiqueta que sale siempre
              deja de leerse. Lo dice la API, resuelto (contrato 0.31.0). */}
          {e.alcance && e.alcance !== 'dentro' && (
            <span className="pill fuera">{ALCANCES[e.alcance] || e.alcance}</span>
          )}
          {/* La descripción del ítem: es uno de los cinco campos que Mike
              pidió homologar entre quell, dash y quote (20-sep). Viaja de
              ida y de sólo lectura; se edita en dash101, que es donde vive. */}
          {e.item_descripcion && <span title="Descripción del ítem, de dash101">{e.item_descripcion}</span>}
          {e.resp && <span>Resp. <b style={{ fontWeight: 500, color: 'var(--ink2)' }}>{e.resp}</b></span>}
          {!staff && contratistas.length > 0 && <span>Contratistas: <b style={{ fontWeight: 500, color: 'var(--ink2)' }}>{contratistas.map((c) => c.name).join(', ')}</b></span>}
          <span>{e.plan_name}</span>
          <span>{e.fase === 'punchlist' && e.entregado_en ? `Entregado ${fmtD(e.entregado_en)}` : `Creado ${fmtD(e.created_at)}`}</span>
        </div>
        {staff && <Contratistas e={e} contratistas={contratistas} members={members} onChanged={changed} />}
        {staff && e.item_id && <Alcance e={e} onChanged={changed} />}
        <div className="tabs">
          {veTodo && <button className={'tab' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>Bitácora <span className="n">{log.length}</span></button>}
          <button className={'tab' + (tab === 'punch' ? ' on' : '')} onClick={() => setTab('punch')}>{veTodo ? 'Punchlist' : 'Pendientes del ítem'} <span className="n">{open}/{punch.length}</span></button>
        </div>
      </div>
      {tab === 'log' && veTodo
        ? <Log e={e} log={log} onChanged={changed} setLb={setLb} user={user} staff={staff} />
        : <Punch e={e} punch={punch} flash={flash} onChanged={changed} setLb={setLb} user={user} staff={staff} veTodo={veTodo} members={members} onEntregar={entregar} onVerProceso={() => setProc(true)} />}
      {veTodo && !!etapas.length && (
        <BarraProceso e={e} etapas={etapas} hechas={hechas} n={nEtapas} puedeMarcar={staff}
          abierta={proc} onAbrir={() => setProc(!proc)} onChanged={changed} />
      )}
      {lb && <div className="lightbox" onClick={() => setLb(null)}><img src={lb} alt="" /></div>}
      {edit && <EditElement e={e} onClose={() => setEdit(false)} onChanged={() => { changed(); }} onDeleted={() => { onChanged(); onClose(); }}
        onReubicar={onReubicar ? () => { setEdit(false); onReubicar(e); } : null} />}
    </aside>
  );
}

// Lo que el cliente ve de un ítem: dónde está, cómo se llama, y los puntos que
// el taller le pidió definir ahí. Contesta cada uno, y puede preguntar sobre
// ese ítem. Ni fase, ni pendientes, ni bitácora: el servidor no los mandó.
function ItemCliente({ d, plan, user, onClose, onChanged }) {
  const { toast } = useApp();
  const { element: e, dudas = [] } = d;
  const pid = plan?.project_id || e.project_id;
  const [lb, setLb] = useState(null);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const { pending, add, clear, remove } = usePending();
  const abiertas = dudas.filter((x) => x.estado === 'abierta');
  const cerradas = dudas.filter((x) => x.estado !== 'abierta');

  async function preguntar() {
    const t = texto.trim();
    if (!t && !pending.length) return;
    setBusy(true);
    try {
      const r = await escribir({ ruta: `/projects/${pid}/dudas`, campos: { texto: t, element_id: e.id }, archivos: pending.map((p) => p.file) });
      setTexto(''); clear();
      if (!r.subido) toast('Sin señal: tu pregunta se manda sola cuando vuelva.');
      onChanged();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }

  return (
    <aside className="panel">
      <div className="head">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={onClose} title="Cerrar">←</button>
          <div className="eyebrow">{e.type} · <span style={{ color: 'var(--accent)' }}>{e.code}</span></div>
        </div>
        <h2>{e.name}</h2>
        <div className="meta"><span>{e.plan_name}</span><span>{abiertas.length ? `${abiertas.length} por definir` : 'Nada por definir'}</span></div>
      </div>
      <div className="puntos">
        {!dudas.length && <div className="empty"><h3>Nada por definir aquí</h3>Si tienes una duda sobre este ítem, pregúntala abajo.</div>}
        {abiertas.map((x) => <Duda key={x.id} d={x} cli user={user} onCambio={onChanged} setLb={setLb} />)}
        {cerradas.map((x) => <Duda key={x.id} d={x} cli user={user} onCambio={onChanged} setLb={setLb} />)}
        <div className="preguntar">
          <textarea rows={2} value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder={`¿Qué quieres preguntar sobre ${e.code || e.name}?`} />
          <PendingStrip pending={pending} remove={remove} />
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <PhotoInput onFiles={add} />
            <div className="spacer" />
            <button className="btn primary sm" disabled={busy || (!texto.trim() && !pending.length)} onClick={preguntar}>{busy ? 'Mandando…' : 'Preguntar'}</button>
          </div>
        </div>
      </div>
      {lb && <div className="lightbox" onClick={() => setLb(null)}><img src={lb} alt="" /></div>}
    </aside>
  );
}

// Los contratistas del ítem (encargo D, 18-sep-2026). Los pone quien dirige la
// obra, de entre la gente que ya tiene acceso a ella con rol de contratista.
// `elements.resp` (texto libre) se queda como está: esto es aparte y liga a
// cuentas de verdad.
function Contratistas({ e, contratistas, members, onChanged }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const candidatos = members.filter((m) => (m.rol_obra === 'con' || m.role === 'con') && !contratistas.some((c) => c.id === m.id));
  async function guarda(ids) {
    setBusy(true);
    await escribir({ metodo: 'PUT', ruta: `/elements/${e.id}/contratistas`, cuerpo: { user_ids: ids } }).catch((x) => toast(x.message));
    setBusy(false); onChanged();
  }
  return (
    <div className="chips" style={{ margin: '6px 0 4px', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 12 }}>Contratistas:</span>
      {contratistas.map((c) => (
        <span key={c.id} className="chip" title={c.company || ''}>{c.name}
          <button type="button" className="x" disabled={busy} title="Quitar de este ítem" onClick={() => guarda(contratistas.filter((o) => o.id !== c.id).map((o) => o.id))}>×</button>
        </span>
      ))}
      {!contratistas.length && <span className="chip">nadie todavía</span>}
      {candidatos.length > 0
        ? <select className="sm" value="" disabled={busy} onChange={(ev) => ev.target.value && guarda([...contratistas.map((c) => c.id), ev.target.value])}>
            <option value="">+ asignar…</option>
            {candidatos.map((m) => <option key={m.id} value={m.id}>{m.name}{m.company ? ` · ${m.company}` : ''}</option>)}
          </select>
        : <span className="muted" style={{ fontSize: 12 }}>{members.some((m) => m.rol_obra === 'con' || m.role === 'con') ? '' : 'Primero dale acceso a la obra a un contratista.'}</span>}
    </div>
  );
}

function Log({ e, log, onChanged, setLb, user, staff }) {   // staff: quien no escribe, la lee y ya
  const { toast } = useApp();
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const { pending, add, clear, remove } = usePending();
  const bodyRef = useRef(null);
  useEffect(() => { bodyRef.current && (bodyRef.current.scrollTop = bodyRef.current.scrollHeight); }, [log.length]);

  async function send() {
    if (!txt.trim() && !pending.length) return;
    setBusy(true);
    try {
      const r = await escribir({
        ruta: `/elements/${e.id}/log`,
        campos: { text: txt.trim() },
        archivos: pending.map((p) => p.file),
        parche: {
          clave: `/elements/${e.id}`,
          fn: (d) => {
            d.log = [...(d.log || []), {
              id: 'local-' + Date.now(), text: txt.trim(), photos: [],
              user_name: user.name, user_role: user.role, user_id: user.id,
              created_at: new Date().toISOString(), __pendiente: true,
            }];
            return d;
          },
        },
      });
      setTxt(''); clear(); onChanged();
      if (!r.subido) toast('Sin señal: se sube solo cuando vuelva.');
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function delPhoto(p) { if (!confirm('¿Quitar esta foto?')) return; await api.del(`/photos/${p.id}`).catch((x) => toast(x.message)); onChanged(); }

  let lastDay = null;
  return (
    <>
      <div className="body" ref={bodyRef}>
        {!log.length && <div className="empty"><h3>Sin registros</h3>Escribe el primer registro de este ítem.</div>}
        {log.map((m) => {
          const day = fmtDay(m.created_at); const showDay = day !== lastDay; lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="day">{day}</div>}
              <div className="msg">
                <div className={'avatar av' + (m.user_role === 'con' ? ' con' : '')}>{ini(m.user_name)}</div>
                <div>
                  <div className="who"><b>{m.user_name}</b><span className="role">{ROLES[m.user_role] || 'Supervisor'}</span><time>{fmtT(m.created_at)}</time></div>
                  <div className="txt">{m.text}<Photos photos={m.photos} setLb={setLb} onDelete={staff || m.user_id === user.id ? delPhoto : null} /></div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {staff && <div className="compose">
        <div className="row">
          <textarea rows={2} value={txt} onChange={(ev) => setTxt(ev.target.value)} placeholder="Escribe lo que pasó en este ítem…" onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey && window.innerWidth > 900) { ev.preventDefault(); send(); } }} />
        </div>
        <PendingStrip pending={pending} remove={remove} />
        <div className="row"><PhotoInput onFiles={add} /><div className="spacer" /><button className="btn primary sm" disabled={busy || (!txt.trim() && !pending.length)} onClick={send}>{busy ? 'Guardando…' : 'Registrar'}</button></div>
      </div>}
    </>
  );
}

// El camino del ítem antes de entregarse, en una barra pegada al fondo del
// panel: en qué etapa va, siempre a la vista, debajo de donde se escribe.
//
// No es una pestaña porque no es una de las cosas que se hacen con un ítem: es
// lo que el ítem es en este momento. Como pestaña había que acordarse de ir a
// verla; aquí se lee de reojo mientras se escribe en la bitácora, y se abre
// nada más cuando hay algo que palomear.
//
// Se puede palomear cualquier etapa, no solo la siguiente, y palomearla da por
// cumplidas las anteriores; despalomear una tira las que vienen después. Es la
// única forma de que "3 de 5" quiera decir algo: un camino con huecos no se
// puede resumir en un número, y ese número es justo lo que se va a leer en la
// lista general sin abrir un solo ítem.
function BarraProceso({ e, etapas, hechas, n, puedeMarcar = true, abierta, onAbrir, onChanged }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState('');
  const hecha = new Map(hechas.map((h) => [h.etapa, h]));
  const falta = etapas[n];                       // la etapa que toca ahora

  async function marca(etapa, valor) {
    const i = etapas.findIndex((x) => x.clave === etapa.clave);
    const arrastra = valor
      ? etapas.slice(0, i).filter((x) => !hecha.has(x.clave))
      : etapas.slice(i + 1).filter((x) => hecha.has(x.clave));
    const nombres = arrastra.map((x) => x.nombre).join(', ');
    if (arrastra.length && !confirm(valor
      ? `Palomear ${etapa.nombre} da también por cumplida${arrastra.length > 1 ? 's' : ''} ${nombres}. ¿Seguir?`
      : `Quitar ${etapa.nombre} deja pendiente${arrastra.length > 1 ? 's' : ''} también ${nombres}. ¿Seguir?`)) return;
    // Entregar es la bisagra del ítem: de un lado se fabrica, del otro se
    // corrige. Se pregunta aparte aunque no arrastre a nadie.
    if (etapa.abre_punchlist && !arrastra.length && !confirm(valor
      ? `¿Dar por entregado ${e.code || e.name}? A partir de ahí se le levantan pendientes.`
      : `¿Regresar ${e.code || e.name} a producción? Los pendientes que ya tiene no se borran: vuelven a la vista cuando se entregue otra vez.`)) return;
    setBusy(etapa.clave);
    try {
      await escribir({
        ruta: `/elements/${e.id}/etapas`, cuerpo: { clave: etapa.clave, hecha: valor },
        parche: {
          clave: `/elements/${e.id}`,
          fn: (d) => {
            const toca = new Set((valor ? etapas.slice(0, i + 1) : etapas.slice(i)).map((x) => x.clave));
            const resto = (d.hechas || []).filter((h) => !toca.has(h.etapa));
            const ahora = new Date().toISOString();
            d.hechas = valor ? [...resto, ...[...toca].map((c) => ({ etapa: c, hecha_en: ahora }))] : resto;
            const bisagra = etapas.find((x) => x.abre_punchlist);
            if (bisagra && toca.has(bisagra.clave)) {
              d.element = { ...d.element, fase: valor ? 'punchlist' : 'produccion', entregado_en: valor ? ahora : null };
            }
            return d;
          },
        },
      });
      onChanged();
    } catch (x) { toast(x.message); } finally { setBusy(''); }
  }

  return (
    <div className={'barproc' + (abierta ? ' abierta' : '')}>
      {abierta && (
        <div className="proc">
          {etapas.map((x, i) => {
            const h = hecha.get(x.clave);
            const sig = !h && i === n;
            return (
              <button key={x.clave} className={'pstep' + (h ? ' ok' : '') + (sig ? ' sig' : '') + (x.abre_punchlist ? ' bisagra' : '')}
                disabled={!puedeMarcar || busy === x.clave} onClick={() => marca(x, !h)}>
                <i className="caja">{h ? '✓' : ''}</i>
                <div>
                  <div className="t">{x.nombre}{!!x.abre_punchlist && <span className="pill acu">abre punchlist</span>}</div>
                  <div className="sub">
                    {h ? <>Cumplida {fmtD(h.hecha_en)}{h.hecha_por_nombre ? ` · ${h.hecha_por_nombre}` : ''}</>
                       : sig ? 'Es la que sigue' : 'Pendiente'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <button className="resumen" onClick={onAbrir} aria-expanded={abierta}
        title={abierta ? 'Cerrar el proceso' : 'Abrir el proceso para palomear'}>
        <span className="pipe">{etapas.map((x, i) => <i key={x.clave} className={(i < n ? 'ok' : '') + (x.abre_punchlist ? ' bisagra' : '')} />)}</span>
        <span className="donde">{falta ? <><b>Sigue:</b> {falta.nombre}</> : <b>Entregado</b>}</span>
        <span className="cuantas">{n}/{etapas.length}</span>
        <span className="flecha">{abierta ? '▾' : '▴'}</span>
      </button>
    </div>
  );
}

function Punch({ e, punch, flash, onChanged, setLb, user, staff, veTodo = staff, members, onEntregar, onVerProceso }) {
  const { toast } = useApp();
  const [f, setF] = useState({ title: '', resp: e.resp || '', due_date: todayISO(3), assignee_id: '' });
  const [evid, setEvid] = useState(null);          // el pendiente que se está dando por terminado
  const contratistas = (members || []).filter((m) => m.role === 'con');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const { pending, add, clear, remove } = usePending();
  const tot = punch.length, ok = punch.filter((k) => k.status === 'ok').length, pr = punch.filter((k) => k.status === 'proc').length;

  async function cycle(k) {
    if (!staff) return;   // el contratista marca terminado con evidencia, no a dedo
    const next = k.status === 'pend' ? 'proc' : k.status === 'proc' ? 'ok' : 'pend';
    await escribir({
      metodo: 'PATCH', ruta: `/punch/${k.id}`, cuerpo: { status: next },
      parche: { clave: `/elements/${e.id}`, fn: (d) => { d.punch = (d.punch || []).map((x) => x.id === k.id ? { ...x, status: next, __pendiente: true } : x); return d; } },
    }).catch((x) => toast(x.message));
    onChanged();
  }
  async function create() {
    if (!f.title.trim()) return;
    setBusy(true);
    try {
      const r = await escribir({
        ruta: `/elements/${e.id}/punch`,
        campos: { title: f.title.trim(), resp: f.resp, due_date: f.due_date, ...(f.assignee_id ? { assignee_id: f.assignee_id } : {}) },
        archivos: pending.map((p) => p.file),
        parche: {
          clave: `/elements/${e.id}`,
          fn: (d) => {
            d.punch = [...(d.punch || []), {
              id: 'local-' + Date.now(), title: f.title.trim(), status: 'pend', resp: f.resp,
              due_date: f.due_date, photos: [], created_at: new Date().toISOString(), __pendiente: true,
            }];
            return d;
          },
        },
      });
      setF({ ...f, title: '' }); clear(); setAdding(false); onChanged();
      if (!r.subido) toast('Sin señal: el pendiente se sube solo cuando vuelva.');
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function addPhotos(k, files) {
    const fd = new FormData();
    for (const file of files) fd.append('photos', await compressImage(file));
    await api.form(`/punch/${k.id}/photos`, fd).catch((x) => toast(x.message)); onChanged();
  }
  async function delPhoto(p) { if (!confirm('¿Quitar esta foto?')) return; await api.del(`/photos/${p.id}`).catch((x) => toast(x.message)); onChanged(); }
  async function del(k) { if (!confirm('¿Borrar este detalle?')) return; await api.del(`/punch/${k.id}`).catch((x) => toast(x.message)); onChanged(); }

  // En producción no hay punchlist: todavía no se ha entregado nada que
  // corregir. En vez de una lista vacía sin explicación, se dice por qué y se
  // ofrece el único paso que la abre.
  if (e.fase !== 'punchlist') {
    return (
      <div className="body">
        <div className="empty">
          <h3>Sigue en producción</h3>
          Mientras se fabrica o se instala, lo que pasa se escribe en el muro del ítem.
          Los pendientes se levantan cuando ya está entregado y hay algo que corregir.
          {!!punch.length && <div style={{ marginTop: 10 }}>Tiene {punch.length} {punch.length === 1 ? 'pendiente guardado' : 'pendientes guardados'} de antes; vuelven a la vista al entregarlo.</div>}
        </div>
        {staff && onVerProceso && <button className="btn primary block" onClick={onVerProceso}>Ver el proceso del ítem</button>}
      </div>
    );
  }

  return (
    <>
      <div className="body">
        {staff && onEntregar && (
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onEntregar('produccion')}>Regresar a producción</button>
        )}
        {tot > 0 && <div className="plsum"><span>{ok}/{tot} resueltos</span><div className="bar"><i style={{ width: `${(ok / tot) * 100}%`, background: 'var(--ok)' }} /><i style={{ width: `${(pr / tot) * 100}%`, background: 'var(--proc)' }} /></div></div>}
        <div className="pl">
          {!punch.length && <div className="empty"><h3>Sin pendientes</h3>{veTodo ? 'Este ítem no tiene detalles abiertos.' : 'Aquí no tienes nada asignado.'}</div>}
          {punch.map((k) => (
            <div key={k.id} className={'pi ' + k.status + (k.id === flash ? ' flash' : '')} data-k={k.id}>
              <div className="st" onClick={() => cycle(k)} title="Cambiar estado">{k.status === 'ok' ? '✓' : k.status === 'proc' ? '…' : ''}</div>
              <div>
                <div className="t">{k.title}</div>
                <div className="sub"><span className={'pill ' + k.status}>{ST[k.status]}</span>{k.__pendiente && <span className="pill">Por subir</span>}{isLate(k) && <span className="pill late">Vencido</span>}<span>{k.status === 'ok' ? 'Resuelto ' + fmtD(k.done_at) : 'Límite ' + fmtD(k.due_date)}</span>{staff && k.assignee_name && <span>{k.assignee_name}{k.assignee_company ? ` · ${k.assignee_company}` : ''}</span>}{!k.assignee_name && k.resp && <span>{k.resp}</span>}</div>
                <Photos photos={k.photos} setLb={setLb} onDelete={staff ? delPhoto : null} />
                {evid === k.id ? (
                  <Evidencia k={k} onListo={() => { setEvid(null); onChanged(); }} onCancel={() => setEvid(null)} />
                ) : (
                  <div className="row" style={{ marginTop: 6, gap: 6 }}>
                    {staff && <label className="btn sm">+ Foto<input type="file" accept="image/*" capture="environment" multiple hidden onChange={(ev) => { addPhotos(k, [...ev.target.files]); ev.target.value = ''; }} /></label>}
                    {!veTodo && k.status !== 'ok' && <button className="btn primary sm" onClick={() => setEvid(k.id)}>Ya quedó — subir evidencia</button>}
                    {!veTodo && k.status === 'proc' && <span className="muted" style={{ fontSize: 12.5 }}>Esperando revisión del supervisor</span>}
                    {staff && <button className="btn sm danger" onClick={() => del(k)}>Borrar</button>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {adding ? (
          <div className="newpi">
            <div className="eyebrow">Nuevo detalle</div>
            <input autoFocus value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} placeholder="Describe el detalle o tarea…" />
            <div className="two">
              {contratistas.length
                ? <select value={f.assignee_id} onChange={(ev) => setF({ ...f, assignee_id: ev.target.value })}>
                    <option value="">Sin asignar</option>
                    {contratistas.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
                  </select>
                : <input value={f.resp} onChange={(ev) => setF({ ...f, resp: ev.target.value })} placeholder="Responsable" />}
              <input type="date" value={f.due_date} onChange={(ev) => setF({ ...f, due_date: ev.target.value })} />
            </div>
            {!contratistas.length && <div className="muted" style={{ fontSize: 12.5 }}>Para asignárselo a alguien, agrégalo primero a la obra en Usuarios y accesos.</div>}
            {!!contratistas.length && !f.assignee_id && <div className="muted" style={{ fontSize: 12.5 }}>Sin asignar, nadie lo va a ver en su lista.</div>}
            <PendingStrip pending={pending} remove={remove} />
            <div className="row"><PhotoInput onFiles={add} /><div className="spacer" /><button className="btn sm" onClick={() => { setAdding(false); clear(); }}>Cancelar</button><button className="btn primary sm" disabled={busy || !f.title.trim()} onClick={create}>{busy ? 'Guardando…' : 'Agregar'}</button></div>
          </div>
        ) : (
          staff && <button className="btn primary block" onClick={() => setAdding(true)}>+ Nuevo detalle</button>
        )}
      </div>
    </>
  );
}

// Lo único que el contratista empuja: la foto de que ya quedó y, si quiere, una
// nota. El pendiente pasa a "en proceso" y queda anotado en la bitácora del
// ítem con su nombre y la hora. Quien lo cierra es el supervisor.
function Evidencia({ k, onListo, onCancel }) {
  const { toast } = useApp();
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const { pending, add, clear, remove } = usePending();

  async function enviar() {
    if (!nota.trim() && !pending.length) return;
    setBusy(true);
    try {
      const r = await escribir({
        ruta: `/punch/${k.id}/evidencia`,
        campos: { nota: nota.trim() },
        archivos: pending.map((p) => p.file),
      });
      clear(); onListo();
      if (!r.subido) toast('Sin señal: tu evidencia se sube sola cuando vuelva.');
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="newpi" style={{ marginTop: 8 }}>
      <div className="eyebrow">Evidencia de que ya quedó</div>
      <textarea rows={2} value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Qué hiciste (opcional si subes foto)…" />
      <PendingStrip pending={pending} remove={remove} />
      <div className="row">
        <PhotoInput onFiles={add} />
        <div className="spacer" />
        <button className="btn sm" onClick={() => { clear(); onCancel(); }}>Cancelar</button>
        <button className="btn primary sm" disabled={busy || (!nota.trim() && !pending.length)} onClick={enviar}>{busy ? 'Subiendo…' : 'Marcar terminado'}</button>
      </div>
    </div>
  );
}

function EditElement({ e, onClose, onChanged, onDeleted, onReubicar }) {
  const { toast } = useApp();
  const [f, setF] = useState({ code: e.code, type: e.type, name: e.name, resp: e.resp });
  const [confirm, setConfirm] = useState(false);
  // Un ítem viejo con un tipo que ya no está en la lista conserva el suyo.
  const tipos = [...TIPOS.map((t) => t.clave), ...(TIPOS.some((t) => t.clave === e.type) ? [] : [e.type])];
  return (
    <div className="ov" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form className="modal" onSubmit={async (ev) => { ev.preventDefault(); await api.patch(`/elements/${e.id}`, f).catch((x) => toast(x.message)); onChanged(); onClose(); }}>
        <h2>Editar ítem</h2>
        <div className="two"><div className="field"><label>Clave</label><input value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value })} /></div><div className="field"><label>Tipo</label><select value={f.type} onChange={(ev) => setF({ ...f, type: ev.target.value })}>{tipos.map((t) => <option key={t}>{t}</option>)}</select></div></div>
        <div className="field"><label>Nombre</label><input required value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></div>
        <div className="field"><label>Responsable <small className="muted">(texto, como siempre; los contratistas con cuenta van arriba)</small></label><input value={f.resp} onChange={(ev) => setF({ ...f, resp: ev.target.value })} /></div>
        {onReubicar && <button type="button" className="btn" onClick={onReubicar}>Reubicar en el plano…</button>}
        {!confirm ? <button type="button" className="btn danger" onClick={() => setConfirm(true)}>Borrar ítem (bitácora y punchlist incluidos)…</button>
          : <button type="button" className="btn danger" onClick={async () => { await api.del(`/elements/${e.id}`).catch((x) => toast(x.message)); onDeleted(); }}>Confirmar borrado definitivo</button>}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar</button></div>
      </form>
    </div>
  );
}

/* Sacar un ítem del alcance, o meterlo, desde la obra.
 *
 * Mike, 20-sep: «se debe poder cancelar algún ítem ya sea desde quell o
 * desde dash, y se refleja en los 2». Se refleja solo: es el MISMO ítem en
 * la misma base de la empresa, no hay nada que sincronizar.
 *
 * La regla de qué queda CANCELADO y qué DESCARTADO —«para considerarse
 * cancelado tiene que haber estado aprobado primero»— la aplica la suite y
 * la contesta; aquí se dice la palabra que ella devuelve, no se vuelve a
 * sacar la cuenta.
 *
 * En dos pasos y con motivo: cancelar saca el ítem del precio de venta del
 * proyecto, y «por qué se cayó esto» no tiene otra respuesta tres meses
 * después. */
function Alcance({ e, onChanged }) {
  const [abierto, setAbierto] = React.useState(false);
  const [motivo, setMotivo] = React.useState('');
  const [yendo, setYendo] = React.useState(false);
  const [dicho, setDicho] = React.useState('');
  const fuera = (e.alcance || 'dentro') !== 'dentro';

  const mover = async (que) => {
    setYendo(true);
    try {
      const r = await api.post(`/items/${e.item_id}/${que}`, que === 'cancelar' ? { motivo } : {});
      const como = r?.data?.alcance;
      setDicho(que === 'aprobar'
        ? 'Aprobado: vuelve al alcance de la obra.'
        : como === 'descartado'
          ? 'Descartado: nunca estuvo aprobado, así que no cuenta como cancelado.'
          : 'Cancelado: sale del precio de venta del proyecto.');
      setAbierto(false); setMotivo('');
      onChanged();
    } catch (err) {
      setDicho(err.message || 'No se pudo.');
    } finally {
      setYendo(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '4px 0 8px' }}>
      {fuera ? (
        <button className="btn sm" disabled={yendo} onClick={() => mover('aprobar')}>
          {yendo ? 'Un momento…' : 'Regresar al alcance'}
        </button>
      ) : !abierto ? (
        <button className="btn sm" onClick={() => setAbierto(true)}>Sacar del alcance</button>
      ) : (
        <>
          <input className="inp sm" style={{ width: 160 }} value={motivo} placeholder="¿Por qué?"
            onChange={(ev) => setMotivo(ev.target.value)} aria-label="Motivo" />
          <button className="btn sm danger" disabled={yendo} onClick={() => mover('cancelar')}>
            {yendo ? 'Un momento…' : 'Confirmar'}
          </button>
          <button className="btn sm" onClick={() => setAbierto(false)}>Cancelar</button>
        </>
      )}
      {dicho && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{dicho}</span>}
    </div>
  );
}
