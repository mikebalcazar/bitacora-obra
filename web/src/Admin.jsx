import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useApp } from './App.jsx';

const ROLES = { admin: 'Administrador', int: 'Interno', con: 'Contratista' };

export default function Admin() {
  const { user, go, toast } = useApp();
  const [users, setUsers] = useState(null);
  const [projects, setProjects] = useState([]);
  const [f, setF] = useState({ email: '', name: '', role: 'con', company: '' });
  const [pid, setPid] = useState('');
  const [members, setMembers] = useState([]);
  const admin = user.role === 'admin';

  const load = () => { if (admin) api.get('/users').then((r) => setUsers(r.users)).catch((e) => toast(e.message)); api.get('/projects').then((r) => { setProjects(r.projects); if (!pid && r.projects[0]) setPid(r.projects[0].id); }); };
  useEffect(load, []);
  useEffect(() => { if (pid) api.get(`/projects/${pid}`).then((r) => setMembers(r.members)).catch(() => setMembers([])); }, [pid, users]);

  async function create(e) { e.preventDefault(); await api.post('/users', f).then(() => { setF({ email: '', name: '', role: 'con', company: '' }); load(); toast('Usuario creado'); }).catch((x) => toast(x.message)); }
  async function toggle(u) { await api.patch(`/users/${u.id}`, { active: !u.active }).catch((x) => toast(x.message)); load(); }
  async function setRole(u, role) { await api.patch(`/users/${u.id}`, { role }).catch((x) => toast(x.message)); load(); }
  async function addMember(uid) { if (!uid) return; await api.post(`/projects/${pid}/members`, { user_id: uid }).catch((x) => toast(x.message)); setMembers((m) => [...m]); api.get(`/projects/${pid}`).then((r) => setMembers(r.members)); }
  async function rmMember(uid) { await api.del(`/projects/${pid}/members/${uid}`).catch((x) => toast(x.message)); api.get(`/projects/${pid}`).then((r) => setMembers(r.members)); }

  const contractors = users ? users.filter((u) => u.role === 'con' && u.active) : [];
  return (
    <div className="home">
      <div className="row"><button className="btn sm" onClick={() => go('/')}>← Proyectos</button><h1 style={{ fontSize: 20 }}>Usuarios y accesos</h1></div>
      <p className="muted" style={{ margin: 0 }}>Internos y administradores ven todos los proyectos. Contratistas sólo los proyectos donde estén agregados.</p>

      {admin && (
        <form className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }} onSubmit={create}>
          <b>Dar de alta</b>
          <div className="two"><input type="email" required placeholder="correo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><input placeholder="nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="two"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><input placeholder="empresa (Taller 101, Eléctrica Rangel…)" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
          <button className="btn primary">Crear usuario</button>
        </form>
      )}

      {admin && users && (
        <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <b>Usuarios ({users.length})</b>
          <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Empresa</th><th></th></tr></thead><tbody>
            {users.map((u) => <tr key={u.id} style={{ opacity: u.active ? 1 : .45 }}><td>{u.name}</td><td>{u.email}</td><td><select value={u.role} disabled={u.id === user.id} onChange={(e) => setRole(u, e.target.value)} style={{ padding: '4px 6px', width: 'auto' }}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td><td>{u.company}</td><td>{u.id !== user.id && <button className="btn sm" onClick={() => toggle(u)}>{u.active ? 'Desactivar' : 'Activar'}</button>}</td></tr>)}
          </tbody></table></div>
        </div>
      )}

      <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <b>Contratistas por proyecto</b>
        <select value={pid} onChange={(e) => setPid(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {members.filter((m) => m.role === 'con').map((m) => <div key={m.id} className="row"><span style={{ flex: 1 }}>{m.name} <span className="muted">· {m.company || m.email}</span></span><button className="btn sm" onClick={() => rmMember(m.id)}>Quitar</button></div>)}
        {!members.filter((m) => m.role === 'con').length && <div className="muted">Sin contratistas en este proyecto.</div>}
        {admin ? <select value="" onChange={(e) => addMember(e.target.value)}><option value="">+ Agregar contratista…</option>{contractors.filter((c) => !members.some((m) => m.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company || c.email}</option>)}</select>
          : <div className="muted">Sólo el administrador agrega contratistas.</div>}
      </div>
    </div>
  );
}
