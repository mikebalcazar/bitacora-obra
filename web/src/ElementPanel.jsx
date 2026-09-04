import React, { useEffect, useRef, useState } from 'react';
import { api, fileUrl, fmtD, fmtT, fmtDay, isLate, ini, ST, compressImage, todayISO } from './api.js';
import { useApp } from './App.jsx';

export default function ElementPanel({ elementId, flash, plan, staff, user, onChanged, onClose }) {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState(flash ? 'punch' : 'log');
  const [lb, setLb] = useState(null);
  const [edit, setEdit] = useState(false);

  const load = () => elementId && api.get(`/elements/${elementId}`).then(setD).catch((e) => toast(e.message));
  useEffect(() => { setD(null); load(); }, [elementId]);
  useEffect(() => { if (flash) setTab('punch'); }, [flash]);
  useEffect(() => { if (flash && d) setTimeout(() => document.querySelector(`[data-k="${flash}"]`)?.scrollIntoView({ block: 'center' }), 50); }, [flash, d]);

  if (!elementId) return <aside className="panel"><div className="empty"><h3>Selecciona un elemento</h3>Toca un pin del plano{staff ? ' o crea uno con + Elemento' : ''}.</div></aside>;
  if (!d) return <aside className="panel"><div className="spin" /></aside>;
  const { element: e, log, punch } = d;
  const open = punch.filter((k) => k.status !== 'ok').length;
  const changed = () => { load(); onChanged(); };

  return (
    <aside className="panel">
      <div className="head">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={onClose} title="Cerrar">←</button>
          <div className="eyebrow">{e.type} · <span style={{ color: 'var(--accent)' }}>{e.code}</span></div>
          <div className="spacer" />
          {staff && <button className="btn sm" onClick={() => setEdit(true)}>Editar</button>}
        </div>
        <h2>{e.name}</h2>
        <div className="meta">{e.resp && <span>Resp. <b style={{ fontWeight: 500, color: 'var(--ink2)' }}>{e.resp}</b></span>}<span>{e.plan_name}</span><span>Creado {fmtD(e.created_at)}</span></div>
        <div className="tabs">
          <button className={'tab' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>Bitácora <span className="n">{log.length}</span></button>
          <button className={'tab' + (tab === 'punch' ? ' on' : '')} onClick={() => setTab('punch')}>Punchlist <span className="n">{open}/{punch.length}</span></button>
        </div>
      </div>
      {tab === 'log' ? <Log e={e} log={log} onChanged={changed} setLb={setLb} user={user} staff={staff} /> : <Punch e={e} punch={punch} flash={flash} onChanged={changed} setLb={setLb} user={user} staff={staff} />}
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
  const [kind, setKind] = useState('trabajo');
  const [busy, setBusy] = useState(false);
  const { pending, add, clear, remove } = usePending();
  const bodyRef = useRef(null);
  useEffect(() => { bodyRef.current && (bodyRef.current.scrollTop = bodyRef.current.scrollHeight); }, [log.length]);

  async function send() {
    if (!txt.trim() && !pending.length) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('kind', kind); fd.append('text', txt.trim());
      pending.forEach((p) => fd.append('photos', p.file));
      await api.form(`/elements/${e.id}/log`, fd);
      setTxt(''); clear(); onChanged();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function delPhoto(p) { if (!confirm('¿Quitar esta foto?')) return; await api.del(`/photos/${p.id}`).catch((x) => toast(x.message)); onChanged(); }

  let lastDay = null;
  return (
    <>
      <div className="body" ref={bodyRef}>
        {!log.length && <div className="empty"><h3>Sin registros</h3>Escribe el primer registro de este elemento.</div>}
        {log.map((m) => {
          const day = fmtDay(m.created_at); const showDay = day !== lastDay; lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="day">{day}</div>}
              <div className="msg">
                <div className={'avatar av' + (m.user_role === 'con' ? ' con' : '')}>{ini(m.user_name)}</div>
                <div>
                  <div className="who"><b>{m.user_name}</b><span className="role">{m.user_role === 'con' ? 'Contratista' : 'Interno'}</span><time>{fmtT(m.created_at)}</time></div>
                  <div className={'txt' + (m.kind === 'acuerdo' ? ' acuerdo' : '')}><span className="kind">{m.kind}</span>{m.text}<Photos photos={m.photos} setLb={setLb} onDelete={staff || m.user_id === user.id ? delPhoto : null} /></div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="compose">
        <div className="row">
          <select value={kind} onChange={(ev) => setKind(ev.target.value)}><option value="trabajo">Trabajo</option><option value="arreglo">Arreglo</option><option value="acuerdo">Acuerdo</option></select>
          <textarea rows={2} value={txt} onChange={(ev) => setTxt(ev.target.value)} placeholder="Registrar trabajo, arreglo o acuerdo…" onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey && window.innerWidth > 900) { ev.preventDefault(); send(); } }} />
        </div>
        <PendingStrip pending={pending} remove={remove} />
        <div className="row"><PhotoInput onFiles={add} /><div className="spacer" /><button className="btn primary sm" disabled={busy || (!txt.trim() && !pending.length)} onClick={send}>{busy ? 'Guardando…' : 'Registrar'}</button></div>
      </div>
    </>
  );
}

function Punch({ e, punch, flash, onChanged, setLb, user, staff }) {
  const { toast } = useApp();
  const [f, setF] = useState({ title: '', resp: e.resp || '', due_date: todayISO(3) });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const { pending, add, clear, remove } = usePending();
  const tot = punch.length, ok = punch.filter((k) => k.status === 'ok').length, pr = punch.filter((k) => k.status === 'proc').length;

  async function cycle(k) {
    const next = k.status === 'pend' ? 'proc' : k.status === 'proc' ? 'ok' : 'pend';
    await api.patch(`/punch/${k.id}`, { status: next }).catch((x) => toast(x.message)); onChanged();
  }
  async function create() {
    if (!f.title.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('title', f.title.trim()); fd.append('resp', f.resp); fd.append('due_date', f.due_date);
      pending.forEach((p) => fd.append('photos', p.file));
      await api.form(`/elements/${e.id}/punch`, fd);
      setF({ ...f, title: '' }); clear(); setAdding(false); onChanged();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function addPhotos(k, files) {
    const fd = new FormData();
    for (const file of files) fd.append('photos', await compressImage(file));
    await api.form(`/punch/${k.id}/photos`, fd).catch((x) => toast(x.message)); onChanged();
  }
  async function delPhoto(p) { if (!confirm('¿Quitar esta foto?')) return; await api.del(`/photos/${p.id}`).catch((x) => toast(x.message)); onChanged(); }
  async function del(k) { if (!confirm('¿Borrar este detalle?')) return; await api.del(`/punch/${k.id}`).catch((x) => toast(x.message)); onChanged(); }

  return (
    <>
      <div className="body">
        {tot > 0 && <div className="plsum"><span>{ok}/{tot} resueltos</span><div className="bar"><i style={{ width: `${(ok / tot) * 100}%`, background: 'var(--ok)' }} /><i style={{ width: `${(pr / tot) * 100}%`, background: 'var(--proc)' }} /></div></div>}
        <div className="pl">
          {!punch.length && <div className="empty"><h3>Sin pendientes</h3>Este elemento no tiene detalles abiertos.</div>}
          {punch.map((k) => (
            <div key={k.id} className={'pi ' + k.status + (k.id === flash ? ' flash' : '')} data-k={k.id}>
              <div className="st" onClick={() => cycle(k)} title="Cambiar estado">{k.status === 'ok' ? '✓' : k.status === 'proc' ? '…' : ''}</div>
              <div>
                <div className="t">{k.title}</div>
                <div className="sub"><span className={'pill ' + k.status}>{ST[k.status]}</span>{isLate(k) && <span className="pill late">Vencido</span>}<span>{k.status === 'ok' ? 'Resuelto ' + fmtD(k.done_at) : 'Límite ' + fmtD(k.due_date)}</span>{k.resp && <span>{k.resp}</span>}</div>
                <Photos photos={k.photos} setLb={setLb} onDelete={staff ? delPhoto : null} />
                <div className="row" style={{ marginTop: 6, gap: 6 }}>
                  <label className="btn sm">+ Foto<input type="file" accept="image/*" capture="environment" multiple hidden onChange={(ev) => { addPhotos(k, [...ev.target.files]); ev.target.value = ''; }} /></label>
                  {staff && <button className="btn sm danger" onClick={() => del(k)}>Borrar</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {adding ? (
          <div className="newpi">
            <div className="eyebrow">Nuevo detalle</div>
            <input autoFocus value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} placeholder="Describe el detalle o tarea…" />
            <div className="two"><input value={f.resp} onChange={(ev) => setF({ ...f, resp: ev.target.value })} placeholder="Responsable" /><input type="date" value={f.due_date} onChange={(ev) => setF({ ...f, due_date: ev.target.value })} /></div>
            <PendingStrip pending={pending} remove={remove} />
            <div className="row"><PhotoInput onFiles={add} /><div className="spacer" /><button className="btn sm" onClick={() => { setAdding(false); clear(); }}>Cancelar</button><button className="btn primary sm" disabled={busy || !f.title.trim()} onClick={create}>{busy ? 'Guardando…' : 'Agregar'}</button></div>
          </div>
        ) : (
          <button className="btn primary block" onClick={() => setAdding(true)}>+ Nuevo detalle</button>
        )}
      </div>
    </>
  );
}

function EditElement({ e, onClose, onChanged, onDeleted }) {
  const { toast } = useApp();
  const [f, setF] = useState({ code: e.code, type: e.type, name: e.name, resp: e.resp });
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="ov" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form className="modal" onSubmit={async (ev) => { ev.preventDefault(); await api.patch(`/elements/${e.id}`, f).catch((x) => toast(x.message)); onChanged(); onClose(); }}>
        <h2>Editar elemento</h2>
        <div className="two"><div className="field"><label>Clave</label><input value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value })} /></div><div className="field"><label>Tipo</label><input value={f.type} onChange={(ev) => setF({ ...f, type: ev.target.value })} /></div></div>
        <div className="field"><label>Nombre</label><input required value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></div>
        <div className="field"><label>Responsable</label><input value={f.resp} onChange={(ev) => setF({ ...f, resp: ev.target.value })} /></div>
        {!confirm ? <button type="button" className="btn danger" onClick={() => setConfirm(true)}>Borrar elemento (bitácora y punchlist incluidos)…</button>
          : <button type="button" className="btn danger" onClick={async () => { await api.del(`/elements/${e.id}`).catch((x) => toast(x.message)); onDeleted(); }}>Confirmar borrado definitivo</button>}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar</button></div>
      </form>
    </div>
  );
}
