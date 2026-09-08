import React, { useEffect, useState } from 'react';
import { leer, escribir, fmtD, fmtT, ini, ROLES } from './api.js';
import { useApp } from './App.jsx';

// Las dudas de la obra.
//
// Quien anda en la obra pregunta; quien la dirige contesta y cierra. Para el que
// pregunta esto es un buzón: escribe y ve qué le contestaron. Para el que
// contesta es una fila de trabajo —la más vieja arriba, una por una— y por eso
// las resueltas se van abajo y se pliegan: lo que importa es cuántas faltan.
//
// El estado es de la duda entera y no de cada respuesta. Lo que se resuelve es
// la pregunta, aunque haya hecho falta un ida y vuelta para entenderla.
export default function Dudas({ pid, staff, user, onIr }) {
  const { toast } = useApp();
  const [dudas, setDudas] = useState(null);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [verCerradas, setVerCerradas] = useState(false);

  const load = () => leer(`/projects/${pid}/dudas`).then((r) => setDudas(r.dudas)).catch((e) => toast(e.message));
  useEffect(() => { setDudas(null); load(); }, [pid]);

  async function preguntar() {
    const t = texto.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await escribir({ ruta: `/projects/${pid}/dudas`, cuerpo: { texto: t } });
      setTexto('');
      if (!r.subido) toast('Sin señal: la duda se manda sola cuando vuelva.');
      load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  if (!dudas) return <div className="dudas"><div className="spin" /></div>;

  const abiertas = dudas.filter((d) => d.estado === 'abierta');
  const cerradas = dudas.filter((d) => d.estado !== 'abierta');

  return (
    <div className="dudas">
      <div className="preguntar">
        <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={staff ? 'Levanta una duda de esta obra…' : '¿Qué necesitas preguntarle al supervisor?'} />
        <div className="row">
          <span className="muted" style={{ fontSize: 12 }}>
            {staff ? 'Se le va a la fila de dudas de la obra.' : 'Le llega al supervisor de la obra.'}
          </span>
          <div className="spacer" />
          <button className="btn primary sm" disabled={busy || !texto.trim()} onClick={preguntar}>
            {busy ? 'Mandando…' : 'Preguntar'}
          </button>
        </div>
      </div>

      <div className="eyebrow">
        {abiertas.length ? `${abiertas.length} ${abiertas.length === 1 ? 'duda esperando respuesta' : 'dudas esperando respuesta'}` : 'Nada esperando respuesta'}
      </div>
      {!abiertas.length && !cerradas.length && (
        <div className="empty"><h3>Sin dudas</h3>{staff ? 'Nadie ha preguntado nada en esta obra.' : 'Aquí van a quedar tus preguntas y lo que te contesten.'}</div>
      )}
      {abiertas.map((d) => <Duda key={d.id} d={d} staff={staff} user={user} onCambio={load} onIr={onIr} />)}

      {!!cerradas.length && (
        <>
          <button className="btn sm" onClick={() => setVerCerradas(!verCerradas)}>
            {verCerradas ? 'Ocultar' : 'Ver'} {cerradas.length} {cerradas.length === 1 ? 'resuelta' : 'resueltas'}
          </button>
          {verCerradas && cerradas.map((d) => <Duda key={d.id} d={d} staff={staff} user={user} onCambio={load} onIr={onIr} />)}
        </>
      )}
    </div>
  );
}

function Duda({ d, staff, user, onCambio, onIr }) {
  const { toast } = useApp();
  const [resp, setResp] = useState('');
  const [busy, setBusy] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const cerrada = d.estado !== 'abierta';
  // Contesta quien dirige la obra, y también quien preguntó: media respuesta
  // casi siempre necesita una aclaración de vuelta.
  const puedeResponder = staff || d.user_id === user.id;

  async function responder() {
    const t = resp.trim();
    if (!t) return;
    setBusy(true);
    try {
      await escribir({ ruta: `/dudas/${d.id}/respuestas`, cuerpo: { texto: t } });
      setResp(''); setAbierto(false); onCambio();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function cerrar(estado) {
    await escribir({ ruta: `/dudas/${d.id}/estado`, cuerpo: { estado } }).catch((e) => toast(e.message));
    onCambio();
  }

  return (
    <div className={'duda' + (cerrada ? ' cerrada' : '')}>
      <div className="quien">
        <div className={'avatar' + (d.quien_rol === 'con' ? ' con' : '')}>{ini(d.quien)}</div>
        <div className="min">
          <b>{d.quien}</b>
          {d.quien_empresa ? <span className="muted"> · {d.quien_empresa}</span> : null}
          <time>{fmtD(d.created_at)} {fmtT(d.created_at)}</time>
        </div>
        {cerrada
          ? <span className="pill ok">Resuelta{d.resuelta_por_nombre ? ` · ${d.resuelta_por_nombre}` : ''}</span>
          : <span className="pill pend">Esperando</span>}
      </div>
      <div className="pregunta">{d.texto}</div>
      {d.element_id && (
        <button className="btn sm liga" onClick={() => onIr && onIr(d.element_id, d.plan_id)}>
          Sobre {d.element_code ? `${d.element_code} · ` : ''}{d.element_name}
        </button>
      )}

      {d.respuestas.map((r) => (
        <div key={r.id} className="respuesta">
          <div className="min"><b>{r.quien}</b><span className="role">{ROLES[r.quien_rol] || ''}</span><time>{fmtD(r.created_at)} {fmtT(r.created_at)}</time></div>
          <div>{r.texto}</div>
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
          <div className="row">
            <button className="btn sm" onClick={() => { setAbierto(false); setResp(''); }}>Cancelar</button>
            <div className="spacer" />
            <button className="btn primary sm" disabled={busy || !resp.trim()} onClick={responder}>{busy ? 'Enviando…' : 'Enviar'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
