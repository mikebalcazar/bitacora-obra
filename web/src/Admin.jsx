import React, { useEffect, useState } from 'react';
import { api, ROLES, ROLES_OBRA, esDueno, dirige } from './api.js';
import { useApp } from './App.jsx';

// Qué puede cada quien, dicho como se diría de viva voz. Se muestra en pantalla
// para que quien da de alta a alguien sepa qué le está entregando.
const QUE_PUEDE = {
  admin: 'Todo lo del supervisor, y además da de alta gente y reparte roles.',
  int: 'Crea y edita obras, planos, ítems y pendientes. Es quien cierra un pendiente cuando ya quedó.',
  con: 'Ve nada más los pendientes que traen su nombre. Sube la evidencia de que los arregló y los marca terminados. No edita nada ni cierra.',
};

export default function Admin() {
  const { user, go, toast } = useApp();
  const [users, setUsers] = useState(null);
  const [projects, setProjects] = useState([]);
  const [f, setF] = useState({ email: '', name: '', role: 'con', company: '' });
  const [pid, setPid] = useState('');
  const [members, setMembers] = useState([]);
  const dueno = esDueno(user);
  const manda = dirige(user);

  const load = () => {
    if (dueno) api.get('/users').then((r) => setUsers(r.users)).catch((e) => toast(e.message));
    api.get('/projects').then((r) => { setProjects(r.projects); if (!pid && r.projects[0]) setPid(r.projects[0].id); });
  };
  useEffect(load, []);
  useEffect(() => { if (pid) api.get(`/projects/${pid}`).then((r) => setMembers(r.members)).catch(() => setMembers([])); }, [pid, users]);

  const recargaMiembros = () => api.get(`/projects/${pid}`).then((r) => setMembers(r.members)).catch(() => {});

  async function create(e) {
    e.preventDefault();
    await api.post('/users', f)
      .then(() => { setF({ email: '', name: '', role: 'con', company: '' }); load(); toast('Usuario dado de alta'); })
      .catch((x) => toast(x.message));
  }
  async function toggle(u) { await api.patch(`/users/${u.id}`, { active: !u.active }).catch((x) => toast(x.message)); load(); }
  async function setRole(u, role) { await api.patch(`/users/${u.id}`, { role }).catch((x) => toast(x.message)); load(); }
  async function addMember(id, rol = 'con') { if (!id) return; await api.post(`/projects/${pid}/members`, { user_id: id, rol }).catch((x) => toast(x.message)); recargaMiembros(); }
  // Cambiar de rol es volver a agregarlo: la misma llamada, otro rol.
  async function setRolObra(id, rol) { await api.post(`/projects/${pid}/members`, { user_id: id, rol }).catch((x) => toast(x.message)); recargaMiembros(); }
  async function rmMember(id) { await api.del(`/projects/${pid}/members/${id}`).catch((x) => toast(x.message)); recargaMiembros(); }

  const enObra = members.filter((m) => m.role === 'con');
  const fuera = users ? users.filter((u) => u.role === 'con' && u.active && !members.some((m) => m.id === u.id)) : [];
  const [rolNuevo, setRolNuevo] = useState('con');

  return (
    <div className="home">
      <div className="row"><button className="btn sm" onClick={() => go('/')}>← Obras</button><h1 style={{ fontSize: 20 }}>Usuarios y accesos</h1></div>
      <p className="muted" style={{ margin: 0 }}>
        Dueños y supervisores ven todas las obras. Los demás ven nada más las obras donde estén agregados, y lo que ven
        adentro depende del rol con que se les agregó: el contratista, solo los pendientes que traen su nombre; el
        trabajador, la obra completa sin poder editar nada.
      </p>

      {dueno && (
        <form className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }} onSubmit={create}>
          <b>Dar de alta</b>
          <div className="two">
            <input type="email" required placeholder="correo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input placeholder="nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="two">
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input placeholder="empresa (Taller 101, Eléctrica Rangel…)" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>{QUE_PUEDE[f.role]}</div>
          <button className="btn primary">Crear usuario</button>
        </form>
      )}

      {dueno && users && (
        <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <b>Usuarios ({users.length})</b>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Empresa</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : .45 }}>
                    <td>{u.name}{u.id === user.id && <span className="muted"> · tú</span>}</td>
                    <td>{u.email}</td>
                    <td>
                      <select value={u.role} disabled={u.id === user.id} onChange={(e) => setRole(u, e.target.value)} style={{ padding: '4px 6px', width: 'auto' }}>
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td>{u.company}</td>
                    <td>{u.id !== user.id && <button className="btn sm" onClick={() => toggle(u)}>{u.active ? 'Desactivar' : 'Activar'}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            A ti mismo no te puedes cambiar el rol ni desactivarte: si el último dueño se baja, ya nadie puede dar de alta a nadie.
            Desactivar no borra nada — lo que esa persona registró se queda.
          </div>
        </div>
      )}

      {/* El rol vive en la membresía y no en la persona: la misma se agrega como
          contratista a una obra y como trabajador a otra. Por eso se elige aquí,
          obra por obra, y no arriba al darla de alta. */}
      <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <b>Quién entra a cada obra</b>
        <div className="muted" style={{ fontSize: 13 }}>
          Agregar a alguien aquí lo deja entrar a esta obra. Lo que ve adentro depende de con qué rol lo agregues.
        </div>
        <select value={pid} onChange={(e) => setPid(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {enObra.map((m) => (
          <div key={m.id} className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span style={{ flex: 1, minWidth: 140 }}>{m.name} <span className="muted">· {m.company || m.email}</span></span>
            {manda
              ? <select value={m.rol_obra || 'con'} onChange={(e) => setRolObra(m.id, e.target.value)} style={{ padding: '4px 6px', width: 'auto' }}>
                  {Object.entries(ROLES_OBRA).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
                </select>
              : <span className="pill gen">{(ROLES_OBRA[m.rol_obra || 'con'] || {}).nombre}</span>}
            {manda && <button className="btn sm" onClick={() => rmMember(m.id)}>Quitar</button>}
          </div>
        ))}
        {!enObra.length && <div className="muted">Nadie de fuera entra a esta obra todavía.</div>}
        {manda ? (
          <>
            <div className="row" style={{ gap: 6 }}>
              <select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value)} style={{ width: 'auto' }}>
                {Object.entries(ROLES_OBRA).map(([k, v]) => <option key={k} value={k}>Como {v.nombre.toLowerCase()}</option>)}
              </select>
              <select value="" onChange={(e) => addMember(e.target.value, rolNuevo)} style={{ flex: 1 }}>
                <option value="">+ Agregar a la obra…</option>
                {fuera.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company || c.email}</option>)}
              </select>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>{(ROLES_OBRA[rolNuevo] || {}).que}</div>
          </>
        ) : <div className="muted">Solo el dueño o un supervisor agregan gente a la obra.</div>}
        {dueno && users && !fuera.length && !!enObra.length && <div className="muted" style={{ fontSize: 13 }}>Ya están todos en esta obra. Para meter a alguien más, primero dalo de alta arriba.</div>}
      </div>
    </div>
  );
}
