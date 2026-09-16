import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { ponerPin } from './suite.js';
import { useApp } from './App.jsx';
import Marca from './Marca.jsx';

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
        <Marca alto={19} />
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
            ? 'Seis dígitos. Nada de 123456 ni seis veces el mismo número. Es el PIN de tu cuenta de la suite: el mismo con el que entras a todas las aplicaciones.'
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
