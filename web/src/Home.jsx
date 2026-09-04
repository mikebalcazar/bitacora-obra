import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useApp } from './App.jsx';

export default function Home() {
  const { user, go, logout, toast } = useApp();
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: '', client: '' });
  const staff = user.role !== 'con';

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
