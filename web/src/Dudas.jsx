import React, { useEffect, useState } from 'react';
import { leer, escribir, fmtD, fmtT, ini, ROLES, fileUrl } from './api.js';
import { useApp } from './App.jsx';
import { Photos, usePending, PhotoInput, PendingStrip } from './Fotos.jsx';

// Las dudas de la obra.
//
// Quien anda en la obra pregunta; quien la dirige contesta y cierra. Para el que
// pregunta esto es un buzón: escribe y ve qué le contestaron. Para el que
// contesta es una fila de trabajo —la más vieja arriba, una por una— y por eso
// las resueltas se van abajo y se pliegan: lo que importa es cuántas faltan.
//
// El estado es de la duda entera y no de cada respuesta. Lo que se resuelve es
// la pregunta, aunque haya hecho falta un ida y vuelta para entenderla.
// La cara de cliente (encargo B, 18-sep-2026) vive aquí mismo, con `cli`: las
// mismas dudas, pero sólo las marcadas para el cliente —el servidor no manda
// otras—, que para él son «puntos por definir». Contesta y el punto se cierra
// solo; el taller puede reabrirlo. Y el taller marca «para el cliente» al
// preguntar, o le avisa por correo con un botón cuando hay puntos abiertos.
export default function Dudas({ pid, staff, user, onIr, cli = false }) {
  const { toast } = useApp();
  const [dudas, setDudas] = useState(null);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [verCerradas, setVerCerradas] = useState(false);
  const [lb, setLb] = useState(null);
  const [paraCliente, setParaCliente] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const { pending, add, clear, remove } = usePending();

  const load = () => leer(`/projects/${pid}/dudas`).then((r) => setDudas(r.dudas)).catch((e) => toast(e.message));
  useEffect(() => { setDudas(null); load(); }, [pid]);

  async function preguntar() {
    const t = texto.trim();
    if (!t && !pending.length) return;
    setBusy(true);
    try {
      const r = await escribir({ ruta: `/projects/${pid}/dudas`, campos: { texto: t, ...(staff && paraCliente ? { para: 'cliente' } : {}) }, archivos: pending.map((p) => p.file) });
      setTexto(''); clear();
      if (!r.subido) toast(cli ? 'Sin señal: tu pregunta se manda sola cuando vuelva.' : 'Sin señal: la duda se manda sola cuando vuelva.');
      load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  // Un solo correo al cliente, cuando el taller lo decide (decisión 8).
  async function avisar() {
    setAvisando(true);
    try {
      const r = await escribir({ ruta: `/projects/${pid}/avisar-cliente`, cuerpo: {} });
      if (!r.subido) toast('Sin señal: el aviso sale cuando vuelva.');
      else toast(r.r?.aviso ? `Se avisó a ${r.r.enviados}, pero: ${r.r.aviso}` : `Le avisamos al cliente: ${r.r?.puntos} ${r.r?.puntos === 1 ? 'punto' : 'puntos'} por definir.`);
    } catch (e) { toast(e.message); } finally { setAvisando(false); }
  }

  if (!dudas) return <div className="dudas"><div className="spin" /></div>;

  const abiertas = dudas.filter((d) => d.estado === 'abierta');
  const cerradas = dudas.filter((d) => d.estado !== 'abierta');
  const delCliente = abiertas.filter((d) => d.para === 'cliente').length;

  return (
    <div className="dudas">
      <div className="preguntar">
        <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={cli ? '¿Qué quieres preguntarle al taller?' : staff ? (paraCliente ? 'Qué necesitas que el cliente defina…' : 'Levanta una duda de esta obra…') : '¿Qué necesitas preguntarle al supervisor?'} />
        <PendingStrip pending={pending} remove={remove} />
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <PhotoInput onFiles={add} />
          {staff && (
            <label className="para-cliente"><input type="checkbox" checked={paraCliente} onChange={(e) => setParaCliente(e.target.checked)} />Para el cliente</label>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            {cli ? 'Le llega al taller; te contestan aquí.' : staff ? (paraCliente ? 'Le llega al cliente como punto por definir. Se cierra con su respuesta.' : 'Se le va a la fila de dudas de la obra.') : 'Le llega al supervisor de la obra.'}
          </span>
          <div className="spacer" />
          <button className="btn primary sm" disabled={busy || (!texto.trim() && !pending.length)} onClick={preguntar}>
            {busy ? 'Mandando…' : 'Preguntar'}
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="eyebrow">
          {cli
            ? (abiertas.length ? `${abiertas.length} ${abiertas.length === 1 ? 'punto por definir' : 'puntos por definir'}` : 'Nada por definir')
            : (abiertas.length ? `${abiertas.length} ${abiertas.length === 1 ? 'duda esperando respuesta' : 'dudas esperando respuesta'}${delCliente ? ` · ${delCliente} del cliente` : ''}` : 'Nada esperando respuesta')}
        </div>
        <div className="spacer" />
        {staff && delCliente > 0 && (
          <button className="btn sm" disabled={avisando} onClick={avisar}>{avisando ? 'Avisando…' : 'Avisar al cliente por correo'}</button>
        )}
      </div>
      {!abiertas.length && !cerradas.length && (
        <div className="empty"><h3>{cli ? 'Nada por definir' : 'Sin dudas'}</h3>{cli ? 'Cuando el taller necesite que definas algo, aparece aquí. Y aquí puedes preguntar tú.' : staff ? 'Nadie ha preguntado nada en esta obra.' : 'Aquí van a quedar tus preguntas y lo que te contesten.'}</div>
      )}
      {abiertas.map((d) => <Duda key={d.id} d={d} staff={staff} cli={cli} user={user} onCambio={load} onIr={onIr} setLb={setLb} />)}

      {!!cerradas.length && (
        <>
          <button className="btn sm" onClick={() => setVerCerradas(!verCerradas)}>
            {verCerradas ? 'Ocultar' : 'Ver'} {cerradas.length} {cerradas.length === 1 ? 'resuelta' : 'resueltas'}
          </button>
          {verCerradas && cerradas.map((d) => <Duda key={d.id} d={d} staff={staff} cli={cli} user={user} onCambio={load} onIr={onIr} setLb={setLb} />)}
        </>
      )}
      {lb && <div className="lightbox" onClick={() => setLb(null)}><img src={lb} alt="" /></div>}
    </div>
  );
}

export function Duda({ d, staff, cli = false, user, onCambio, onIr, setLb }) {
  const { toast } = useApp();
  const [resp, setResp] = useState('');
  const [busy, setBusy] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const { pending, add, clear, remove } = usePending();
  const cerrada = d.estado !== 'abierta';
  // Contesta quien dirige la obra, y también quien preguntó: media respuesta
  // casi siempre necesita una aclaración de vuelta. El cliente contesta todo
  // lo que le llega: eso es definir.
  const puedeResponder = staff || cli || d.user_id === user.id;

  async function responder() {
    const t = resp.trim();
    if (!t && !pending.length) return;
    setBusy(true);
    try {
      const r = await escribir({ ruta: `/dudas/${d.id}/respuestas`, campos: { texto: t }, archivos: pending.map((p) => p.file) });
      setResp(''); clear(); setAbierto(false); onCambio();
      if (r.subido && r.r?.cerrada) toast(cli ? 'Listo: el punto quedó definido con tu respuesta.' : 'El punto del cliente quedó cerrado con tu respuesta.');
      else if (!r.subido) toast('Sin señal: tu respuesta sube sola cuando vuelva.');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function cerrar(estado) {
    await escribir({ ruta: `/dudas/${d.id}/estado`, cuerpo: { estado } }).catch((e) => toast(e.message));
    onCambio();
  }

  return (
    <div className={'duda' + (cerrada ? ' cerrada' : '')}>
      <div className="quien">
        <div className={'avatar' + (d.quien_rol === 'con' ? ' con' : d.quien_rol === 'cli' ? ' cli' : '')}>{ini(d.quien)}</div>
        <div className="min">
          <b>{d.quien}</b>
          {d.quien_empresa ? <span className="muted"> · {d.quien_empresa}</span> : null}
          <time>{fmtD(d.created_at)} {fmtT(d.created_at)}</time>
        </div>
        {!cli && d.para === 'cliente' && <span className="pill cli">Cliente</span>}
        {cerrada
          ? <span className="pill ok">{cli ? 'Definido' : 'Resuelta'}{d.resuelta_por_nombre ? ` · ${d.resuelta_por_nombre}` : ''}</span>
          : <span className="pill pend">{cli ? 'Por definir' : 'Esperando'}</span>}
      </div>
      {d.texto && <div className="pregunta">{d.texto}</div>}
      <Photos photos={d.photos} setLb={setLb} />
      {d.element_id && (
        <button className="btn sm liga" onClick={() => onIr && onIr(d.element_id, d.plan_id)}>
          Sobre {d.element_code ? `${d.element_code} · ` : ''}{d.element_name}
        </button>
      )}

      {d.respuestas.map((r) => (
        <div key={r.id} className="respuesta">
          <div className="min"><b>{r.quien}</b><span className="role">{ROLES[r.quien_rol] || ''}</span><time>{fmtD(r.created_at)} {fmtT(r.created_at)}</time></div>
          {r.texto && <div>{r.texto}</div>}
          <Photos photos={r.photos} setLb={setLb} />
        </div>
      ))}

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {puedeResponder && !abierto && <button className="btn sm" onClick={() => setAbierto(true)}>Responder</button>}
        {staff && !cerrada && <button className="btn primary sm" onClick={() => cerrar('resuelta')}>Marcar resuelta</button>}
        {staff && cerrada && <button className="btn sm" onClick={() => cerrar('abierta')}>Reabrir</button>}
      </div>
      {abierto && (
        <div className="responder">
          <textarea rows={2} autoFocus value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Contesta…" />
          <PendingStrip pending={pending} remove={remove} />
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <PhotoInput onFiles={add} />
            <button className="btn sm" onClick={() => { setAbierto(false); setResp(''); clear(); }}>Cancelar</button>
            <div className="spacer" />
            <button className="btn primary sm" disabled={busy || (!resp.trim() && !pending.length)} onClick={responder}>{busy ? 'Enviando…' : 'Enviar'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
