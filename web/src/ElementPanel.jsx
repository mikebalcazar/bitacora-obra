import React, { useEffect, useRef, useState } from 'react';
import { api, leer, escribir, fileUrl, FASES, fmtD, fmtT, fmtDay, isLate, ini, ST, ROLES, compressImage, todayISO } from './api.js';
import { useApp } from './App.jsx';

export default function ElementPanel({ elementId, flash, plan, staff, user, members = [], todos = [], onIr, onChanged, onClose }) {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState(!staff || flash ? 'punch' : 'log');
  const [lb, setLb] = useState(null);
  const [edit, setEdit] = useState(false);

  const load = () => elementId && leer(`/elements/${elementId}`).then(setD).catch((e) => toast(e.message));
  useEffect(() => { setD(null); load(); }, [elementId]);
  useEffect(() => { if (flash) setTab('punch'); }, [flash]);
  useEffect(() => { if (flash && d) setTimeout(() => document.querySelector(`[data-k="${flash}"]`)?.scrollIntoView({ block: 'center' }), 50); }, [flash, d]);

  if (!elementId) return <aside className="panel"><div className="empty"><h3>{staff ? 'Selecciona un ítem' : 'Selecciona un pendiente'}</h3>Toca un pin del plano{staff ? ' o crea uno con + Ítem' : '. Solo salen los pines donde tienes algo asignado.'}</div></aside>;
  if (!d) return <aside className="panel"><div className="spin" /></aside>;
  const { element: e, log, punch } = d;
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
          {e.resp && <span>Resp. <b style={{ fontWeight: 500, color: 'var(--ink2)' }}>{e.resp}</b></span>}
          <span>{e.plan_name}</span>
          <span>{e.fase === 'punchlist' && e.entregado_en ? `Entregado ${fmtD(e.entregado_en)}` : `Creado ${fmtD(e.created_at)}`}</span>
        </div>
        <div className="tabs">
          {staff && <button className={'tab' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>Bitácora <span className="n">{log.length}</span></button>}
          <button className={'tab' + (tab === 'punch' ? ' on' : '')} onClick={() => setTab('punch')}>{staff ? 'Punchlist' : 'Lo que me toca'} <span className="n">{open}/{punch.length}</span></button>
        </div>
      </div>
      {tab === 'log' && staff ? <Log e={e} log={log} onChanged={changed} setLb={setLb} user={user} staff={staff} /> : <Punch e={e} punch={punch} flash={flash} onChanged={changed} setLb={setLb} user={user} staff={staff} members={members} onEntregar={entregar} />}
      {lb && <div className="lightbox" onClick={() => setLb(null)}><img src={lb} alt="" /></div>}
      {edit && <EditElement e={e} onClose={() => setEdit(false)} onChanged={() => { changed(); }} onDeleted={() => { onChanged(); onClose(); }} />}
    </aside>
  );
}

function Photos({ photos, setLb, onDelete }) {
  if (!photos?.length) return null;
  return <div className="photos">{photos.map((p) => <div key={p.id} className="ph" onClick={() => setLb(fileUrl(p.r2_key))}><img src={fileUrl(p.r2_key)} alt={p.file_name} loading="lazy" />{onDelete && <button className="rm" onClick={(ev) => { ev.stopPropagation(); onDelete(p); }} title="Quitar foto">×</button>}</div>)}</div>;
}

function usePending() {
  const [pending, setPending] = useState([]);
  const add = async (files) => {
    const out = [];
    for (const f of files) out.push({ file: await compressImage(f), url: URL.createObjectURL(f) });
    setPending((p) => [...p, ...out]);
  };
  const clear = () => { pending.forEach((p) => URL.revokeObjectURL(p.url)); setPending([]); };
  const remove = (i) => setPending((p) => p.filter((_, j) => j !== i));
  return { pending, add, clear, remove };
}
function PhotoInput({ onFiles, label = 'Foto' }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <label className="btn sm">Cámara<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} /></label>
      <label className="btn sm">{label}s<input type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} /></label>
    </div>
  );
}
function PendingStrip({ pending, remove }) {
  if (!pending.length) return null;
  return <div className="photos">{pending.map((p, i) => <div key={i} className="ph" style={{ cursor: 'default' }}><img src={p.url} alt="" /><button className="rm" onClick={() => remove(i)}>×</button></div>)}</div>;
}

function Log({ e, log, onChanged, setLb, user, staff }) {
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
      <div className="compose">
        <div className="row">
          <textarea rows={2} value={txt} onChange={(ev) => setTxt(ev.target.value)} placeholder="Escribe lo que pasó en este ítem…" onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey && window.innerWidth > 900) { ev.preventDefault(); send(); } }} />
        </div>
        <PendingStrip pending={pending} remove={remove} />
        <div className="row"><PhotoInput onFiles={add} /><div className="spacer" /><button className="btn primary sm" disabled={busy || (!txt.trim() && !pending.length)} onClick={send}>{busy ? 'Guardando…' : 'Registrar'}</button></div>
      </div>
    </>
  );
}

function Punch({ e, punch, flash, onChanged, setLb, user, staff, members, onEntregar }) {
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
        {staff && onEntregar && <button className="btn primary block" onClick={() => onEntregar('punchlist')}>Dar por entregado</button>}
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
          {!punch.length && <div className="empty"><h3>Sin pendientes</h3>{staff ? 'Este ítem no tiene detalles abiertos.' : 'Aquí no tienes nada asignado.'}</div>}
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
                    {!staff && k.status !== 'ok' && <button className="btn primary sm" onClick={() => setEvid(k.id)}>Ya quedó — subir evidencia</button>}
                    {!staff && k.status === 'proc' && <span className="muted" style={{ fontSize: 12.5 }}>Esperando revisión del supervisor</span>}
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

function EditElement({ e, onClose, onChanged, onDeleted }) {
  const { toast } = useApp();
  const [f, setF] = useState({ code: e.code, type: e.type, name: e.name, resp: e.resp });
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="ov" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form className="modal" onSubmit={async (ev) => { ev.preventDefault(); await api.patch(`/elements/${e.id}`, f).catch((x) => toast(x.message)); onChanged(); onClose(); }}>
        <h2>Editar ítem</h2>
        <div className="two"><div className="field"><label>Clave</label><input value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value })} /></div><div className="field"><label>Tipo</label><input value={f.type} onChange={(ev) => setF({ ...f, type: ev.target.value })} /></div></div>
        <div className="field"><label>Nombre</label><input required value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></div>
        <div className="field"><label>Responsable</label><input value={f.resp} onChange={(ev) => setF({ ...f, resp: ev.target.value })} /></div>
        {!confirm ? <button type="button" className="btn danger" onClick={() => setConfirm(true)}>Borrar ítem (bitácora y punchlist incluidos)…</button>
          : <button type="button" className="btn danger" onClick={async () => { await api.del(`/elements/${e.id}`).catch((x) => toast(x.message)); onDeleted(); }}>Confirmar borrado definitivo</button>}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar</button></div>
      </form>
    </div>
  );
}
