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
  /* Archivar y borrar (Mike, 29-sep-2026): «Borrar elimina la info completa.
   * Archivar lo quita de la pantalla home pero se queda guardada la info, es
   * para cuando un proyecto se termina. Y debe haber un botón para ver todo
   * el archivo». Archivar es el `status: 'cerrado'` que la obra ya tenía en
   * la base; aquí se le llama archivo porque es la palabra que usa quien
   * abre esta pantalla. Borrar es del dueño y lo decide la API. */
  const [verArchivo, setVerArchivo] = useState(false);
  const [borrando, setBorrando] = useState(null); // la obra que se va a borrar

  const load = () => api.get('/projects').then((r) => setProjects(r.projects)).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);

  const archivadas = (projects || []).filter((p) => p.status === 'cerrado');
  const activas = (projects || []).filter((p) => p.status !== 'cerrado');
  const lista = verArchivo ? archivadas : activas;

  async function archivar(p, si) {
    if (si && !confirm(`¿Archivar «${p.name}»? Se quita del inicio; toda su información se queda guardada y se puede volver a abrir desde el archivo.`)) return;
    try { await api.patch(`/projects/${p.id}`, { status: si ? 'cerrado' : 'activo' }); toast(si ? 'Archivado.' : 'De vuelta en el inicio.'); load(); }
    catch (x) { toast(x.message); }
  }

  /* Mike, 6-oct: «Cree un nuevo proyecto en Quell, con un cliente nuevo.
   * Pero no me aparece ni el cliente ni el proyecto ni en quote ni en dash.»
   * Desde la API 0.77.0 el proyecto nace también en la suite (`suite: true`):
   * con el cliente que se escoja de la lista, o uno nuevo con lo que se
   * escriba. El mismo nombre es el mismo cliente, sin duplicarlo. */
  async function create(e) {
    e.preventDefault();
    const ya = clienteIgual(clientes, f.client);
    const r = await api.post('/projects', { name: f.name, client: f.client, suite: true, ...(ya ? { cliente_id: ya.id } : {}) }).catch((x) => toast(x.message));
    if (!r) return;
    if (r.proyecto_id) toast(r.cliente_nuevo ? `Listo: el cliente «${f.client.trim()}» y el proyecto ya están en dash101 y quote101.` : 'Listo: el proyecto ya está en dash101 y quote101.');
    setCreating(false); setF({ name: '', client: '' }); go(`/p/${r.id}`);
  }

  // Los clientes de la suite, para escoger uno en «+ Proyecto».
  const [clientes, setClientes] = useState([]);
  useEffect(() => {
    if (!creating || !staff) return;
    api.get('/clientes-suite').then((r) => setClientes(r.clientes || [])).catch(() => setClientes([]));
  }, [creating]);

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
      {/* El archivo: las obras terminadas. Se quitan del inicio y se ven aquí.
          Sólo el taller lo abre; a un contratista o a un cliente una obra
          archivada simplemente ya no le aparece. */}
      {staff && projects && (archivadas.length > 0 || verArchivo) && (
        <div className="row archivo-barra">
          <button className={'btn sm' + (verArchivo ? ' on' : '')} data-archivo={verArchivo ? 'abierto' : 'cerrado'} onClick={() => setVerArchivo(!verArchivo)}>
            {verArchivo ? '← Volver al inicio' : `Ver el archivo (${archivadas.length})`}
          </button>
          {verArchivo && <span className="muted">Proyectos archivados. Su información sigue completa; se pueden volver a abrir.</span>}
        </div>
      )}
      {projects && !lista.length && (
        verArchivo
          ? <div className="empty"><h3>El archivo está vacío</h3>Cuando un proyecto termine, archívalo desde el inicio y aparecerá aquí.</div>
          : <div className="empty"><h3>{cli ? 'Sin obras todavía' : 'Sin proyectos'}</h3>{cli ? 'El taller todavía no te ha invitado a ninguna obra.' : staff ? 'Crea el primero con + Proyecto.' : 'Pide al supervisor que te agregue a un proyecto.'}</div>
      )}
      {projects && lista.map((p) => (
        /* La tarjeta era un <button>; ahora lleva botones adentro (archivar,
           borrar) y un botón no puede traer otros. Es un div que se pica. */
        <div key={p.id} className={'card' + (p.status === 'cerrado' ? ' archivada' : '')} role="button" tabIndex={0}
          onClick={() => go(`/p/${p.id}`)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(`/p/${p.id}`); } }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{p.name}</h3>
            <div className="muted">{p.client}{p.status === 'cerrado' ? <span className="pill gen" style={{ marginLeft: 6 }}>archivado</span> : null}</div>
          </div>
          <div style={{ textAlign: 'right' }}><div className={'n' + (p.open_count ? '' : ' zero')}>{p.open_count}</div><div className="muted" style={{ fontSize: 11 }}>{cli ? 'por definir' : 'pendientes'}</div></div>
          {staff && (
            <div className="card-acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {p.status === 'cerrado'
                ? <button className="btn sm" data-accion="desarchivar" onClick={() => archivar(p, false)} title="Regresarlo al inicio">Desarchivar</button>
                : <button className="btn sm" data-accion="archivar" onClick={() => archivar(p, true)} title="Quitarlo del inicio sin borrar nada">Archivar</button>}
              {dueno && <button className="btn sm danger" data-accion="borrar" onClick={() => setBorrando(p)} title="Borrar la obra con todo lo que trae. No hay papelera.">Borrar</button>}
            </div>
          )}
        </div>
      ))}
      {borrando && <BorrarObra p={borrando} onClose={() => setBorrando(null)} onBorrada={() => { setBorrando(null); load(); }} />}
      {pinAbierto && <CambiarPin onClose={() => setPin(false)} />}
      {invitando && <InvitarCliente projects={projects || []} onClose={() => setInvitando(false)} />}
      {creating && (
        <div className="ov" onClick={(e) => e.target === e.currentTarget && setCreating(false)}>
          <form className="modal" onSubmit={create}>
            <h2>Nuevo proyecto</h2>
            <div className="field"><label>Nombre</label><input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Casa Lomas 214" /></div>
            <div className="field"><label>Cliente</label>
              <input list="clientes-suite" data-campo="cliente" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="Escoge uno o escribe uno nuevo" />
              <datalist id="clientes-suite">{clientes.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
              <AvisoCliente clientes={clientes} nombre={f.client} />
            </div>
            <div className="acts"><button type="button" className="btn" onClick={() => setCreating(false)}>Cancelar</button><button className="btn primary">Crear</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

// Mismas reglas que la suite (`normalizar`): sin acentos, sin mayúsculas, sin
// espacios de más. Así se dice aquí lo mismo que va a hacer la API.
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clienteIgual = (clientes, nombre) => { const n = normalizar(nombre); return n ? clientes.find((c) => normalizar(c.nombre) === n) : null; };

// Lo que va a pasar con el cliente, dicho antes de crear: el que ya existe, uno
// nuevo (y si se parece a otro, cuál, para no duplicarlo por un «S.A.»), o
// nada, que deja la obra sin proyecto en dash101 y quote101.
function AvisoCliente({ clientes, nombre }) {
  const n = normalizar(nombre);
  if (!n) return <small className="muted" data-aviso-cliente="vacio">Sin cliente, la obra no llega a dash101 ni a quote101 hasta que se active allá.</small>;
  const ya = clienteIgual(clientes, nombre);
  if (ya) return <small className="muted" data-aviso-cliente="existe">Se usa el cliente que ya existe: <b>{ya.nombre}</b>.</small>;
  const parecidos = n.length >= 3 ? clientes.filter((c) => { const o = normalizar(c.nombre); return o.length >= 3 && (o.includes(n) || n.includes(o)); }) : [];
  return (
    <small className="muted" data-aviso-cliente="nuevo">
      Cliente nuevo: se da de alta en dash101 y quote101.
      {parecidos.length > 0 && <> Se parece a {parecidos.slice(0, 3).map((c, i) => <React.Fragment key={c.id}>{i ? ', ' : ''}<b>{c.nombre}</b></React.Fragment>)}; si es el mismo, escógelo de la lista.</>}
    </small>
  );
}

// Borrar una obra: se va TODO —planos, ítems, bitácora, pendientes, dudas,
// archivos— y no hay papelera. Por eso no basta un «¿seguro?»: se teclea el
// nombre de la obra. Quien borra por error una obra de verdad no pierde un
// renglón, pierde semanas de trabajo de la gente de obra. La API sólo se lo
// permite al dueño; esta pantalla no le enseña el botón a nadie más.
function BorrarObra({ p, onClose, onBorrada }) {
  const { toast } = useApp();
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const coincide = nombre.trim() === p.name.trim();

  async function borrar(e) {
    e.preventDefault();
    if (!coincide) return;
    setBusy(true);
    try {
      const r = await api.del(`/projects/${p.id}`);
      toast(`Borrado «${p.name}»${r?.archivos ? ` y sus ${r.archivos} archivos` : ''}.`);
      onBorrada();
    } catch (x) { toast(x.message); setBusy(false); }
  }

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={borrar}>
        <h2>Borrar «{p.name}»</h2>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Se borra la obra completa: planos, ítems, bitácora, pendientes, dudas y todos sus archivos. No hay papelera ni forma de recuperarla.
          Si lo que quieres es quitarla del inicio porque ya terminó, mejor archívala.
        </p>
        <div className="field"><label>Escribe el nombre de la obra para confirmar</label>
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={p.name} data-confirma="nombre" /></div>
        <div className="acts">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn danger" disabled={!coincide || busy}>{busy ? 'Borrando…' : 'Borrar para siempre'}</button>
        </div>
      </form>
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
  // El correo es de UN cliente en toda la suite (contrato 0.65.0). Mike,
  // 4-oct-2026: «avisar que ya existe un cliente, presentar su info y
  // preguntar si es ese cliente el que estás buscando y ya usarlo o si quieres
  // crear uno nuevo con otro email». Si la suite contesta 409 correo_en_uso,
  // aquí se guarda a quién es el correo y se pregunta antes de seguir.
  const [conEseCorreo, setConEseCorreo] = useState(null);
  const carga = () => api.get('/clientes').then((r) => setClientes(r.clientes)).catch(() => setClientes([]));
  useEffect(() => { carga(); }, []);
  const toca = (id) => setElegidas((s0) => { const n = new Set(s0); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function manda(usarExistente) {
    setBusy(true);
    try {
      const r = await api.post('/clientes/invitar', { email: f.email, name: f.name, project_ids: [...elegidas], ...(usarExistente ? { usar_existente: true } : {}) });
      toast(r.aviso ? 'Quedó invitado, pero el correo no salió: ' + r.aviso : r.nuevo ? 'Invitado. Le llegó el correo con cómo entrar.' : 'Ya estaba: se le pusieron las obras y se le volvió a mandar el correo.');
      setF({ email: '', name: '' }); setElegidas(new Set()); setConEseCorreo(null); carga();
    } catch (x) {
      if (x.status === 409 && x.message === 'correo_en_uso') { setConEseCorreo(x.data?.cliente || { correo: f.email }); return; }
      toast(x.message);
    } finally { setBusy(false); }
  }
  async function invitar(e) {
    e.preventDefault();
    if (!elegidas.size) return toast('Elige al menos una obra.');
    await manda(false);
  }

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={invitar}>
        <h2>Invitar cliente</h2>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Va a ver el plano de su obra y los puntos que le pidas definir; contesta ahí mismo y puede preguntar.
          No ve pendientes, bitácora ni nada interno. Entra con la misma cuenta que usa para su estado de cuenta.
        </p>
        <div className="field"><label>Correo</label><input type="email" required autoFocus id="correo-cliente-invitado" value={f.email} onChange={(e) => { setF({ ...f, email: e.target.value }); setConEseCorreo(null); }} placeholder="cliente@correo.com" /></div>
        <div className="field"><label>Nombre (como va a aparecer aquí)</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Fam. Ortega" /></div>
        {conEseCorreo && (
          <div className="aviso-correo" data-con-ese-correo role="status">
            <p>Ya hay un cliente con el correo <b>{conEseCorreo.correo || f.email}</b>. ¿Es éste el que buscas?</p>
            <p className="quien"><b>{conEseCorreo.nombre || '(sin nombre)'}</b>{conEseCorreo.telefono ? ` · ${conEseCorreo.telefono}` : ''}{conEseCorreo.rfc ? ` · ${conEseCorreo.rfc}` : ''}{conEseCorreo.portal_activo ? ' · con portal' : ''}</p>
            <div className="acts">
              <button type="button" className="btn" onClick={() => { setConEseCorreo(null); document.getElementById('correo-cliente-invitado')?.focus(); }}>No, es otro: cambio el correo</button>
              <button type="button" className="btn primary" disabled={busy} onClick={() => manda(true)}>{busy ? 'Invitando…' : 'Sí, es ése: invitarlo'}</button>
            </div>
          </div>
        )}
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
