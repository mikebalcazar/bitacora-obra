import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useApp } from './App.jsx';

export default function Home() {
  const { user, go, logout, toast } = useApp();
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: '', client: '' });
  const staff = user.role !== 'con';
  const [pinAbierto, setPin] = useState(false);

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
        <div className="row" style={{ gap: 10, fontWeight: 600, fontSize: 15 }}><i className="dot" style={{ background: 'var(--accent)' }} />Bitácora de Obra</div>
        <div className="spacer" />
        {staff && <button className="btn sm" onClick={() => go('/admin')}>Usuarios y accesos</button>}
        <button className="btn sm" onClick={() => setPin(true)}>Mi PIN</button>
        <button className="btn sm" onClick={logout} title={user.email}>Salir</button>
      </div>
      <div className="row"><h1 style={{ fontSize: 20 }}>Proyectos</h1><div className="spacer" />{staff && <button className="btn primary sm" onClick={() => setCreating(true)}>+ Proyecto</button>}</div>
      {!projects && <div className="spin" />}
      {projects && !projects.length && <div className="empty"><h3>Sin proyectos</h3>{staff ? 'Crea el primero con + Proyecto.' : 'Pide al supervisor que te agregue a un proyecto.'}</div>}
      {projects && projects.map((p) => (
        <button key={p.id} className="card" onClick={() => go(`/p/${p.id}`)}>
          <div style={{ flex: 1 }}><h3>{p.name}</h3><div className="muted">{p.client}{p.status === 'cerrado' ? ' · cerrado' : ''}</div></div>
          <div style={{ textAlign: 'right' }}><div className={'n' + (p.open_count ? '' : ' zero')}>{p.open_count}</div><div className="muted" style={{ fontSize: 11 }}>pendientes</div></div>
        </button>
      ))}
      {pinAbierto && <CambiarPin onClose={() => setPin(false)} />}
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

// Cambiar el PIN sin salir: se pide el nuevo dos veces, y el servidor rechaza
// los que se adivinan de una.
function CambiarPin({ onClose }) {
  const { toast } = useApp();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const limpio = (v) => v.replace(/\D/g, '').slice(0, 6);

  async function guardar(e) {
    e.preventDefault();
    if (a !== b) return toast('Los dos PIN no son iguales.');
    setBusy(true);
    try { await api.post('/pin', { pin: a }); toast('PIN cambiado'); onClose(); }
    catch (x) { toast(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={guardar}>
        <h2>Cambiar mi PIN</h2>
        <div className="field"><label>PIN nuevo</label><input className="code" inputMode="numeric" autoFocus required value={a} onChange={(e) => setA(limpio(e.target.value))} /></div>
        <div className="field"><label>Otra vez</label><input className="code" inputMode="numeric" required value={b} onChange={(e) => setB(limpio(e.target.value))} /></div>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Seis dígitos. Nada de 123456 ni seis veces el mismo número.</p>
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || a.length !== 6 || b.length !== 6}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </div>
  );
}
