import React, { useEffect, useState } from 'react';
import { api, esCliente, esDueno } from './api.js';
import { ponerPin } from './suite.js';
import { useApp } from './App.jsx';
import Marca from './Marca.jsx';

export default function Home() {
  const { user, go, logout, toast } = useApp();
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: '', client: '' });
  const cli = esCliente(user);
  const staff = !cli && user.role !== 'con';
  const dueno = esDueno(user);
  const [pinAbierto, setPin] = useState(false);
  const [invitando, setInvitando] = useState(false);

  const load = () => api.get('/projects').then((r) => setProjects(r.projects)).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    const r = await api.post('/projects', f).catch((x) => toast(x.message));
    if (r) { setCreating(false); setF({ name: '', client: '' }); go(`/p/${r.id}`); }
  }

  return (
    <div className="home">
      <div className="row">
        <Marca alto={19} />
        <div className="spacer" />
        {staff && <button className="btn sm" onClick={() => go('/admin')}>Usuarios y accesos</button>}
        {/* Desde el 16-sep-2026 el navegador entra con contraseña, no con PIN
            (encargo de Mike: Google o correo y contraseña en todas las apps).
            Este botón se queda porque el APK de Android que la gente de obra
            ya tiene instalado lleva su propia pantalla adentro, con PIN, y sin
            esto no habría dónde ponerlo. Se va cuando ese APK se rearme. */}
        {!cli && <button className="btn sm" onClick={() => setPin(true)}>PIN de la app de Android</button>}
        <button className="btn sm" onClick={logout} title={user.email}>Salir</button>
      </div>
      <div className="row">
        <h1 style={{ fontSize: 20 }}>{cli ? 'Tus obras' : 'Proyectos'}</h1><div className="spacer" />
        {/* Invitar al cliente va aquí, en el inicio, y no en «Usuarios y
            accesos» (decisión de Mike, 18-sep): correo, cómo se va a llamar
            aquí, y a qué obras entra. */}
        {dueno && <button className="btn sm" onClick={() => setInvitando(true)}>Invitar cliente</button>}
        {staff && <button className="btn primary sm" onClick={() => setCreating(true)}>+ Proyecto</button>}
      </div>
      {!projects && <div className="spin" />}
      {projects && !projects.length && <div className="empty"><h3>{cli ? 'Sin obras todavía' : 'Sin proyectos'}</h3>{cli ? 'El taller todavía no te ha invitado a ninguna obra.' : staff ? 'Crea el primero con + Proyecto.' : 'Pide al supervisor que te agregue a un proyecto.'}</div>}
      {projects && projects.map((p) => (
        <button key={p.id} className="card" onClick={() => go(`/p/${p.id}`)}>
          <div style={{ flex: 1 }}><h3>{p.name}</h3><div className="muted">{p.client}{p.status === 'cerrado' ? ' · cerrado' : ''}</div></div>
          <div style={{ textAlign: 'right' }}><div className={'n' + (p.open_count ? '' : ' zero')}>{p.open_count}</div><div className="muted" style={{ fontSize: 11 }}>{cli ? 'por definir' : 'pendientes'}</div></div>
        </button>
      ))}
      {pinAbierto && <CambiarPin onClose={() => setPin(false)} />}
      {invitando && <InvitarCliente projects={projects || []} onClose={() => setInvitando(false)} />}
      {creating && (
        <div className="ov" onClick={(e) => e.target === e.currentTarget && setCreating(false)}>
          <form className="modal" onSubmit={create}>
            <h2>Nuevo proyecto</h2>
            <div className="field"><label>Nombre</label><input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Casa Lomas 214" /></div>
            <div className="field"><label>Cliente</label><input value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="Fam. Ortega" /></div>
            <div className="acts"><button type="button" className="btn" onClick={() => setCreating(false)}>Cancelar</button><button className="btn primary">Crear</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

// Invitar a un cliente del taller a ver su obra (encargo B, 18-sep-2026). La
// suite lo deja entrar como cliente —la misma cuenta de peek101—, esta
// bitácora lo apunta en las obras elegidas y le manda el correo. Abajo se ve
// a quién ya se invitó, para no invitar dos veces.
function InvitarCliente({ projects, onClose }) {
  const { toast } = useApp();
  const [f, setF] = useState({ email: '', name: '' });
  const [elegidas, setElegidas] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [clientes, setClientes] = useState(null);
  const carga = () => api.get('/clientes').then((r) => setClientes(r.clientes)).catch(() => setClientes([]));
  useEffect(() => { carga(); }, []);
  const toca = (id) => setElegidas((s0) => { const n = new Set(s0); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function invitar(e) {
    e.preventDefault();
    if (!elegidas.size) return toast('Elige al menos una obra.');
    setBusy(true);
    try {
      const r = await api.post('/clientes/invitar', { email: f.email, name: f.name, project_ids: [...elegidas] });
      toast(r.aviso ? 'Quedó invitado, pero el correo no salió: ' + r.aviso : r.nuevo ? 'Invitado. Le llegó el correo con cómo entrar.' : 'Ya estaba: se le pusieron las obras y se le volvió a mandar el correo.');
      setF({ email: '', name: '' }); setElegidas(new Set()); carga();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={invitar}>
        <h2>Invitar cliente</h2>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Va a ver el plano de su obra y los puntos que le pidas definir; contesta ahí mismo y puede preguntar.
          No ve pendientes, bitácora ni nada interno. Entra con la misma cuenta que usa para su estado de cuenta.
        </p>
        <div className="field"><label>Correo</label><input type="email" required autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="cliente@correo.com" /></div>
        <div className="field"><label>Nombre (como va a aparecer aquí)</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Fam. Ortega" /></div>
        <div className="field"><label>Obras a las que entra</label>
          <div className="obras-check">
            {projects.filter((p) => p.status !== 'cerrado').map((p) => (
              <label key={p.id}><input type="checkbox" checked={elegidas.has(p.id)} onChange={() => toca(p.id)} />{p.name}{p.client ? <span className="muted"> · {p.client}</span> : null}</label>
            ))}
            {!projects.length && <span className="muted">No hay obras todavía.</span>}
          </div>
        </div>
        {clientes && clientes.length > 0 && (
          <div className="field"><label>Ya invitados</label>
            <div className="lista-clientes">
              {clientes.map((c) => <div key={c.id}><b>{c.name}</b><span className="muted">{c.email}</span><span className="muted">{c.obras || 'sin obras'}</span>{!c.active && <span className="pill gen">inactivo</span>}</div>)}
            </div>
          </div>
        )}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cerrar</button><button className="btn primary" disabled={busy}>{busy ? 'Invitando…' : 'Invitar'}</button></div>
      </form>
    </div>
  );
}

// Cambiar el PIN sin salir. Igual que al darse de alta: se teclea, se pasa de
// pantalla y se vuelve a teclear de memoria, con los números ocultos. Confirmar
// teniendo el primero a la vista no confirma nada.
function CambiarPin({ onClose }) {
  const { toast } = useApp();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [paso, setPaso] = useState('elige');
  const [busy, setBusy] = useState(false);
  const limpio = (v) => v.replace(/\D/g, '').slice(0, 6);

  async function enviar(e) {
    e.preventDefault();
    if (paso === 'elige') { setB(''); setPaso('confirma'); return; }
    if (a !== b) {
      setA(''); setB(''); setPaso('elige');
      return toast('No coincidieron. Vamos otra vez.');
    }
    setBusy(true);
    // A la suite, no a la bitácora. Hasta el 16-sep esto guardaba un PIN en la
    // base de la bitácora y decía «PIN cambiado» — y desde la mudanza al login
    // de la suite ese PIN ya no abría nada. La pantalla cumplía y no servía.
    try { await ponerPin(a); toast('PIN cambiado'); onClose(); }
    catch (x) { toast(x.message); setA(''); setB(''); setPaso('elige'); }
    finally { setBusy(false); }
  }

  const eligiendo = paso === 'elige';
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={enviar}>
        <h2>{eligiendo ? 'Tu PIN nuevo' : 'Otra vez'}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          {eligiendo
            ? 'Seis dígitos. Nada de 123456 ni seis veces el mismo número. Sirve para entrar desde la aplicación de Android que ya tienes instalada; en el navegador se entra con tu contraseña.'
            : 'Tecléalo de nuevo, de memoria. Así sabemos que te lo vas a acordar mañana.'}
        </p>
        <input
          key={paso}
          className="code"
          type="password"
          inputMode="numeric"
          autoFocus
          required
          value={eligiendo ? a : b}
          onChange={(e) => (eligiendo ? setA(limpio(e.target.value)) : setB(limpio(e.target.value)))}
        />
        <div className="acts">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy || (eligiendo ? a.length !== 6 : b.length !== 6)}>
            {busy ? 'Guardando…' : eligiendo ? 'Continuar' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
