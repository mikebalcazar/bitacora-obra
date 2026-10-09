import React, { useEffect, useRef, useState } from 'react';
import { api, leer, escribir, fileUrl, FASES, ALCANCES, MOVIMIENTOS_ALCANCE, TIPOS, enRevision, fmtD, fmtT, fmtDay, isLate, ini, ST, ROLES, compressImage, todayISO } from './api.js';
import { useApp } from './App.jsx';
import { Photos, usePending, PhotoInput, PendingStrip, usePegarYSoltar, Lightbox } from './Fotos.jsx';
import { Duda } from './Dudas.jsx';
import Docs, { idOp, cuentaPaginas } from './DocsItem.jsx';
import { planoDe, nombreDePlanoPegado } from './pegar.js';

// staff = puede escribir. veTodo = puede ver la obra completa. No son lo mismo:
// el trabajador ve todo y no escribe nada, y el contratista ni ve todo ni
// escribe, salvo la evidencia de lo que le tocó.
export default function ElementPanel({ elementId, flash, plan, staff, veTodo = staff, user, members = [], todos = [], onIr, onChanged, onClose, onReubicar, onSubitem }) {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState(!veTodo || flash ? 'punch' : 'log');
  // El proceso no es una pestaña: es el estado del ítem, y se lee de reojo
  // mientras se escribe en la bitácora. Vive en una barra abajo que se abre
  // cuando hay que palomear algo.
  const [proc, setProc] = useState(false);
  const [lb, setLb] = useState(null);
  const [edit, setEdit] = useState(false);

  const load = () => elementId && leer(`/elements/${elementId}`).then(setD).catch((e) => toast(e.message));
  useEffect(() => { setD(null); setProc(false); load(); }, [elementId]);
  useEffect(() => { if (flash) setTab('punch'); }, [flash]);
  useEffect(() => { if (flash && d) setTimeout(() => document.querySelector(`[data-k="${flash}"]`)?.scrollIntoView({ block: 'center' }), 50); }, [flash, d]);

  if (!elementId) return <aside className="panel"><div className="empty"><h3>Selecciona un ítem</h3>Toca un pin del plano{staff ? ' o crea uno con + Ítem' : veTodo ? '.' : '. Los tuyos van resaltados; de los demás sólo ves dónde están.'}</div></aside>;
  if (!d) return <aside className="panel"><div className="spin" /></aside>;
  const { element: e, log, punch, etapas = [], hechas = [], contratistas = [] } = d;
  // El cliente: el ítem para ubicarse y sus puntos por definir (encargo B).
  if (d.cliente) return <ItemCliente d={d} plan={plan} user={user} onClose={onClose} onChanged={() => { load(); onChanged(); }} />;
  // Un ítem que no es suyo: el servidor ya lo recortó a nombre, código y
  // posición. Aquí sólo se dice, sin inventar lo que no vino.
  if (d.recorte) {
    return (
      <aside className="panel">
        <div className="head">
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={onClose} title="Cerrar">←</button>
            <div className="eyebrow">{e.type} · <span style={{ color: 'var(--accent)' }}>{e.code}</span></div>
          </div>
          <h2>{e.name}</h2>
          <div className="meta"><span>{e.plan_name}</span></div>
        </div>
        <div className="recorte">Este ítem <b>no es tuyo</b>: sólo sale para que te ubiques en el plano. Lo que trae —pendientes, bitácora, fotos— es de quien lo lleva.</div>
      </aside>
    );
  }
  const nEtapas = etapas.filter((x) => hechas.some((h) => h.etapa === x.clave)).length;
  const open = punch.filter((k) => k.status !== 'ok').length;
  const changed = () => { load(); onChanged(); };
  /* 0.56.0 · Subítems (Mike, 30-sep): los trabajos complementarios que
   * cuelgan de este ítem, y de cuál cuelga éste. Salen de la lista de la
   * obra, que ya viene con `padre_id`: no hace falta otra llamada. */
  const hijos = todos.filter((t) => t.padre_id === e.id);
  const padre = e.padre_id ? todos.find((t) => t.id === e.padre_id) : null;

  // Entregar es un acto, no un detalle: se pregunta antes, y al devolver a
  // producción se avisa que los pendientes no se borran, solo se guardan.
  async function entregar(a) {
    const yendo = a === 'punchlist';
    const aviso = yendo
      ? `¿Dar por entregado ${e.code || e.name}? A partir de ahí se le levantan pendientes.`
      : `¿Regresar ${e.code || e.name} a producción? Los pendientes que ya tiene no se borran: vuelven a la vista cuando se entregue otra vez.`;
    if (!confirm(aviso)) return;
    await escribir({ ruta: `/elements/${e.id}/fase`, cuerpo: { fase: a } }).catch((x) => toast(x.message));
    changed();
  }

  return (
    <aside className="panel">
      <div className="head">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={onClose} title="Cerrar">←</button>
          <div className="eyebrow">{e.type} · <span style={{ color: 'var(--accent)' }}>{e.code}</span></div>
          <div className="spacer" />
          {staff && <button className="btn sm" onClick={() => setEdit(true)}>Editar</button>}
        </div>
        {/* Saltar de un ítem a otro sin volver al plano. En el celular el plano
            ocupa toda la pantalla, así que revisar diez ítems seguidos eran
            treinta toques; aquí son diez. Los de otro plano también salen, y al
            elegirlos el plano cambia solo. */}
        {todos.length > 1 && onIr && (
          <select
            className="saltar"
            value={e.id}
            onChange={(ev) => {
              const otro = todos.find((x) => x.id === ev.target.value);
              if (otro) onIr(otro.id, otro.plan_id);
            }}
          >
            {todos.map((x) => {
              const abiertos = (x.n_pend || 0) + (x.n_proc || 0);
              return (
                <option key={x.id} value={x.id}>
                  {x.code ? `${x.code} · ` : ''}{x.name}{abiertos ? ` — ${abiertos} pend.` : ''}
                </option>
              );
            })}
          </select>
        )}
        <h2>{e.name}</h2>
        <div className="meta">
          <span className={'pill fase ' + e.fase}>{FASES[e.fase] || 'Producción'}</span>
          {/* El alcance, cuando NO está dentro. Dentro no se pinta: la obra
              es lo que se está fabricando, y una etiqueta que sale siempre
              deja de leerse. Lo dice la API, resuelto (contrato 0.31.0). */}
          {e.alcance && e.alcance !== 'dentro' && (
            <span className="pill fuera">{ALCANCES[e.alcance] || e.alcance}</span>
          )}
          {/* La descripción del ítem: es uno de los cinco campos que Mike
              pidió homologar entre quell, dash y quote (20-sep). Viaja de
              ida y de sólo lectura; se edita en dash101, que es donde vive. */}
          {e.item_descripcion && <span title="Descripción del ítem, de dash101">{e.item_descripcion}</span>}
          {e.resp && <span>Resp. <b style={{ fontWeight: 500, color: 'var(--ink2)' }}>{e.resp}</b></span>}
          {padre && <span data-subitem="padre">Complemento de <button type="button" className="liga" onClick={() => onIr(padre.id, padre.plan_id)}>{padre.code || padre.name}</button></span>}
          {!staff && contratistas.length > 0 && <span>Contratistas: <b style={{ fontWeight: 500, color: 'var(--ink2)' }}>{contratistas.map((c) => c.name).join(', ')}</b></span>}
          <span>{e.plan_name}</span>
          <span>{e.fase === 'punchlist' && e.entregado_en ? `Entregado ${fmtD(e.entregado_en)}` : `Creado ${fmtD(e.created_at)}`}</span>
          {/* Los dos candados del cronograma (Mike, 6-oct-2026): el diseño se
              fecha aquí (en «Editar»); el anticipo se reparte en dash101 al
              registrar el pago. Sin los dos, la pieza corre desde hoy. */}
          {staff && <DisenoDefinido e={e} onChanged={changed} />}
          {staff && <span data-candado="anticipo" className={e.anticipo_fecha ? '' : 'falta'} title={e.item_id ? 'El anticipo se reparte en dash101 al registrar el pago del cliente.' : 'La pieza no está ligada a un ítem de dash101: liga la obra al proyecto para poder registrarle el anticipo.'}>{e.anticipo_fecha ? `Anticipo ${fmtD(e.anticipo_fecha)}` : e.item_id ? 'Sin anticipo' : 'Sin ítem en dash101'}</span>}
        </div>
        {/* EN REVISIÓN. Mike, 22-sep: un requerimiento «sí aparece en mapa, sí
            aparece en ítems, pero está pendiente de cotizarse y autorizarse
            para entrar en producción». Se dice con palabras y no sólo con el
            color del pin: el color se lee de lejos en el plano, pero aquí
            adentro hay que saber POR QUÉ no se puede avanzar. */}
        {enRevision(e.type) && (
          <div className="revision">
            <b>En revisión.</b> Falta cotizarlo y autorizarlo. Cuando se apruebe, edítalo y cámbiale el tipo: entra a producción con todo lo que ya trae.
          </div>
        )}
        {staff && <Contratistas e={e} contratistas={contratistas} members={members} onChanged={changed} />}
        {/* Los subítems de este ítem, y el botón para levantar uno más. Se
            ven para todos los que ven el ítem; sólo quien dirige levanta. */}
        {(hijos.length > 0 || (staff && onSubitem)) && (
          <div className="subitems" data-subitems={hijos.length}>
            <span className="muted" style={{ fontSize: 12 }}>Subítems{hijos.length ? ` (${hijos.length})` : ''}:</span>
            {hijos.map((h) => (
              <button key={h.id} type="button" className="chip subitem" title={h.name} onClick={() => onIr(h.id, h.plan_id)}>
                <b>{h.code}</b> {h.name}{enRevision(h.type) ? <span className="pill gen">en revisión</span> : h.fase === 'punchlist' ? <span className="pill ok">entregado</span> : null}
              </button>
            ))}
            {!hijos.length && <span className="chip">ninguno todavía</span>}
            {staff && onSubitem && <button type="button" className="btn sm" data-subitem="nuevo" onClick={() => onSubitem(e)}>＋ Subítem</button>}
          </div>
        )}
        {e.item_id && <Entrega e={e} staff={staff} onChanged={changed} />}
        {/* Los archivos del ítem. Mike los pidió justo aquí, señalando el
            recuadro azul del encabezado: es donde se está cuando surge la
            duda de «¿cómo era esta pieza?». El contratista también lo ve —es
            el plano de lo que va a fabricar—; lo que no puede es subir ni
            anotar, y eso lo decide la API, no este renglón. */}
        <Docs e={e} staff={staff} />
        {staff && e.item_id && <Alcance e={e} onChanged={changed} />}
        <div className="tabs">
          {veTodo && <button className={'tab' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>Bitácora <span className="n">{log.length}</span></button>}
          <button className={'tab' + (tab === 'punch' ? ' on' : '')} onClick={() => setTab('punch')}>{veTodo ? 'Punchlist' : 'Pendientes del ítem'} <span className="n">{open}/{punch.length}</span></button>
        </div>
      </div>
      {tab === 'log' && veTodo
        ? <Log e={e} log={log} onChanged={changed} setLb={setLb} user={user} staff={staff} />
        : <Punch e={e} punch={punch} flash={flash} onChanged={changed} setLb={setLb} user={user} staff={staff} veTodo={veTodo} members={members} onEntregar={enRevision(e.type) ? null : entregar} onVerProceso={() => setProc(true)} />}
      {/* La barra del proceso se esconde mientras esté en revisión, y las
          palomas se apagan: la API rechaza las dos cosas (contrato 0.43.0),
          así que ofrecerlas sería prometer algo que no se cumple. El permiso
          lo decide el motor; esto es para no hacer picar en balde. */}
      {veTodo && !!etapas.length && !enRevision(e.type) && (
        <BarraProceso e={e} etapas={etapas} hechas={hechas} n={nEtapas} puedeMarcar={staff}
          abierta={proc} onAbrir={() => setProc(!proc)} onChanged={changed} />
      )}
      <Lightbox lb={lb} onClose={() => setLb(null)} />
      {edit && <EditElement e={e} onClose={() => setEdit(false)} onChanged={() => { changed(); }} onDeleted={() => { onChanged(); onClose(); }}
        onReubicar={onReubicar ? () => { setEdit(false); onReubicar(e); } : null} />}
    </aside>
  );
}

// Lo que el cliente ve de un ítem: dónde está, cómo se llama, y los puntos que
// el taller le pidió definir ahí. Contesta cada uno, y puede preguntar sobre
// ese ítem. Ni fase, ni pendientes, ni bitácora: el servidor no los mandó.
//
// Desde el 4-oct-2026 (Mike: «al cliente sí le debe aparecer el precio de cada
// ítem cuando lo selecciona en quell» y «necesito que pueda ver los documentos
// (planos de ítem) de los ítems y su estado del proceso») también ve lo del
// ítem que es suyo —precio, descripción, etapa de fabricación, entrega— y
// abre «Archivos del ítem» de sólo lectura: el mismo visor, sin subir ni anotar.
//
// Las siete etapas son las del taller, las mismas que peek101 le enseña en su
// estado de cuenta (suite101-api/claude/suite101-arquitectura.md §«Las 7
// etapas»); `item_etapa` llega de 0 a 7.
const ETAPAS_SUITE = ['Diseño autorizado', 'Anticipo pagado', 'Compra de materiales', 'Despiece y ensamble', 'Entrega', 'Instalación', 'Cierre'];
const etapaSuite = (n) => (n == null ? null : n <= 0 ? 'Por iniciar' : ETAPAS_SUITE[Math.min(Number(n), 7) - 1]);
const pesosCliente = (c) => '$' + (Number(c) / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function ItemCliente({ d, plan, user, onClose, onChanged }) {
  const { toast } = useApp();
  const { element: e, dudas = [] } = d;
  const pid = plan?.project_id || e.project_id;
  const [lb, setLb] = useState(null);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const { pending, add, clear, remove } = usePending();
  const abiertas = dudas.filter((x) => x.estado === 'abierta');
  const cerradas = dudas.filter((x) => x.estado !== 'abierta');

  async function preguntar() {
    const t = texto.trim();
    if (!t && !pending.length) return;
    setBusy(true);
    try {
      const r = await escribir({ ruta: `/projects/${pid}/dudas`, campos: { texto: t, element_id: e.id }, archivos: pending.map((p) => p.file) });
      setTexto(''); clear();
      if (!r.subido) toast('Sin señal: tu pregunta se manda sola cuando vuelva.');
      onChanged();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }

  return (
    <aside className="panel">
      <div className="head">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={onClose} title="Cerrar">←</button>
          <div className="eyebrow">{e.type} · <span style={{ color: 'var(--accent)' }}>{e.code}</span></div>
        </div>
        <h2>{e.name}</h2>
        <div className="meta"><span>{e.plan_name}</span><span>{abiertas.length ? `${abiertas.length} por definir` : 'Nada por definir'}</span></div>
        {(e.item_monto != null || e.item_descripcion || e.item_etapa != null || e.item_fecha_entrega) && (
          <div className="del-item" data-del-item>
            {e.item_monto != null && <div><span>Precio</span><b>{pesosCliente(e.item_monto)}</b></div>}
            {e.item_etapa != null && <div><span>Etapa</span><b>{etapaSuite(e.item_etapa)}</b></div>}
            {e.item_fecha_entrega && <div><span>Entrega</span><b>{fmtD(e.item_fecha_entrega)}</b></div>}
            {e.item_descripcion && <p>{e.item_descripcion}</p>}
          </div>
        )}
        <Docs e={e} staff={false} />
      </div>
      <div className="puntos">
        {!dudas.length && <div className="empty"><h3>Nada por definir aquí</h3>Si tienes una duda sobre este ítem, pregúntala abajo.</div>}
        {abiertas.map((x) => <Duda key={x.id} d={x} cli user={user} onCambio={onChanged} setLb={setLb} />)}
        {cerradas.map((x) => <Duda key={x.id} d={x} cli user={user} onCambio={onChanged} setLb={setLb} />)}
        <div className="preguntar">
          <textarea rows={2} value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder={`¿Qué quieres preguntar sobre ${e.code || e.name}?`} />
          <PendingStrip pending={pending} remove={remove} />
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <PhotoInput onFiles={add} />
            <div className="spacer" />
            <button className="btn primary sm" disabled={busy || (!texto.trim() && !pending.length)} onClick={preguntar}>{busy ? 'Mandando…' : 'Preguntar'}</button>
          </div>
        </div>
      </div>
      <Lightbox lb={lb} onClose={() => setLb(null)} />
    </aside>
  );
}

// Los contratistas del ítem (encargo D, 18-sep-2026). Los pone quien dirige la
// obra. `elements.resp` (texto libre) se queda como está: esto es aparte y
// liga a cuentas de verdad.
//
// Desde el 30-sep (Mike, en Holcim: «en este ítem no me deja agregar a un
// contratista») el menú trae a TODOS los contratistas de la empresa, no sólo
// a los que ya entran a la obra. Los de la obra van primero; los demás van en
// su propio grupo, y al escoger uno de ésos la API le da acceso a la obra en
// el mismo paso (contrato 0.54.1) y aquí se dice con un aviso. Antes el
// letrero mandaba a «Usuarios y accesos» y de regreso: dos pantallas para una
// cosa.
function Contratistas({ e, contratistas, members, onChanged }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [empresa, setEmpresa] = useState(null); // los contratistas de la empresa; null = no han llegado
  useEffect(() => { let vivo = true; api.get('/contratistas').then((r) => vivo && setEmpresa(r.contratistas || [])).catch(() => vivo && setEmpresa([])); return () => { vivo = false; }; }, []);
  const yaEsta = (id) => contratistas.some((c) => c.id === id);
  const enObra = members.filter((m) => (m.rol_obra === 'con' || m.role === 'con') && !yaEsta(m.id));
  const fuera = (empresa || []).filter((c) => !yaEsta(c.id) && !members.some((m) => m.id === c.id));
  async function guarda(ids) {
    setBusy(true);
    // `escribir` envuelve la respuesta de la API en `.r` cuando subió; sin
    // señal se encola y no hay respuesta que leer (el aviso sale al recargar).
    const hecho = await escribir({ metodo: 'PUT', ruta: `/elements/${e.id}/contratistas`, cuerpo: { user_ids: ids } }).catch((x) => { toast(x.message); return null; });
    const r = hecho && hecho.subido ? hecho.r : null;
    if (r && r.entraron_a_la_obra && r.entraron_a_la_obra.length) {
      const quien = r.entraron_a_la_obra.map((x) => x.name).join(', ');
      toast(r.aviso ? `${quien} ya entra a la obra y quedó en el ítem, pero el correo no salió: ${r.aviso}` : `${quien} ya entra a la obra y quedó en el ítem. Le llegó el correo con cómo entrar.`);
    }
    setBusy(false); onChanged();
  }
  const opcion = (m) => <option key={m.id} value={m.id}>{m.name}{m.company ? ` · ${m.company}` : ''}</option>;
  return (
    <div className="chips" style={{ margin: '6px 0 4px', alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 12 }}>Contratistas:</span>
      {contratistas.map((c) => (
        <span key={c.id} className="chip" title={c.company || ''}>{c.name}
          <button type="button" className="x" disabled={busy} title="Quitar de este ítem" onClick={() => guarda(contratistas.filter((o) => o.id !== c.id).map((o) => o.id))}>×</button>
        </span>
      ))}
      {!contratistas.length && <span className="chip">nadie todavía</span>}
      {enObra.length + fuera.length > 0
        ? <select className="sm" value="" disabled={busy} data-contratistas="asignar" onChange={(ev) => ev.target.value && guarda([...contratistas.map((c) => c.id), ev.target.value])}>
            <option value="">+ asignar…</option>
            {enObra.length > 0 && <optgroup label="Ya entran a esta obra">{enObra.map(opcion)}</optgroup>}
            {fuera.length > 0 && <optgroup label="Otros contratistas de la empresa (entran a la obra al asignarlos)">{fuera.map(opcion)}</optgroup>}
          </select>
        : <span className="muted" style={{ fontSize: 12 }}>{empresa === null ? '' : 'No hay contratistas dados de alta. Primero da de alta uno en «Usuarios y accesos».'}</span>}
    </div>
  );
}

function Log({ e, log, onChanged, setLb, user, staff }) {   // staff: quien no escribe, la lee y ya
  const { toast } = useApp();
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const { pending, add, clear, remove } = usePending();
  // Una foto pegada del portapapeles o arrastrada encima de la caja entra
  // como si se hubiera escogido (Mike, 30-sep-2026).
  const { soltando, onPaste, onDragOver, onDragLeave, onDrop } = usePegarYSoltar(add);
  const bodyRef = useRef(null);
  /* Al fondo, donde está lo más nuevo. En la compu la bitácora se desplaza
   * sola; en el celular es el panel entero el que se desplaza (styles.css,
   * 28-sep), así que se le pide al último renglón que se traiga a la vista y
   * el navegador desplaza al que toque. */
  useEffect(() => {
    const b = bodyRef.current;
    if (!b) return;
    b.scrollTop = b.scrollHeight;
    b.lastElementChild?.scrollIntoView?.({ block: 'end' });
  }, [log.length]);

  async function send() {
    if (!txt.trim() && !pending.length) return;
    setBusy(true);
    try {
      const r = await escribir({
        ruta: `/elements/${e.id}/log`,
        campos: { text: txt.trim() },
        archivos: pending.map((p) => p.file),
        parche: {
          clave: `/elements/${e.id}`,
          fn: (d) => {
            d.log = [...(d.log || []), {
              id: 'local-' + Date.now(), text: txt.trim(), photos: [],
              user_name: user.name, user_role: user.role, user_id: user.id,
              created_at: new Date().toISOString(), __pendiente: true,
            }];
            return d;
          },
        },
      });
      setTxt(''); clear(); onChanged();
      if (!r.subido) toast('Sin señal: se sube solo cuando vuelva.');
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function delPhoto(p) { if (!confirm('¿Quitar esta foto?')) return; await api.del(`/photos/${p.id}`).catch((x) => toast(x.message)); onChanged(); }

  let lastDay = null;
  return (
    <>
      <div className="body" ref={bodyRef}>
        {!log.length && <div className="empty"><h3>Sin registros</h3>Escribe el primer registro de este ítem.</div>}
        {log.map((m) => {
          const day = fmtDay(m.created_at); const showDay = day !== lastDay; lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="day">{day}</div>}
              <div className="msg">
                <div className={'avatar av' + (m.user_role === 'con' ? ' con' : '')}>{ini(m.user_name)}</div>
                <div>
                  <div className="who"><b>{m.user_name}</b><span className="role">{ROLES[m.user_role] || 'Supervisor'}</span><time>{fmtT(m.created_at)}</time></div>
                  <div className="txt">{m.text}<Photos photos={m.photos} setLb={setLb} onDelete={staff || m.user_id === user.id ? delPhoto : null} /></div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {staff && <div className={'compose' + (soltando ? ' soltando' : '')} data-compose="bitacora" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <div className="row">
          <textarea rows={2} value={txt} onChange={(ev) => setTxt(ev.target.value)} onPaste={onPaste} placeholder="Escribe lo que pasó en este ítem… (pega o arrastra una foto aquí)" onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey && window.innerWidth > 900) { ev.preventDefault(); send(); } }} />
        </div>
        {soltando && <div className="suelta-aqui">Suelta la foto aquí</div>}
        <PendingStrip pending={pending} remove={remove} />
        <div className="row"><PhotoInput onFiles={add} /><div className="spacer" /><button className="btn primary sm" disabled={busy || (!txt.trim() && !pending.length)} onClick={send}>{busy ? 'Guardando…' : 'Registrar'}</button></div>
      </div>}
    </>
  );
}

// El camino del ítem antes de entregarse, en una barra pegada al fondo del
// panel: en qué etapa va, siempre a la vista, debajo de donde se escribe.
//
// No es una pestaña porque no es una de las cosas que se hacen con un ítem: es
// lo que el ítem es en este momento. Como pestaña había que acordarse de ir a
// verla; aquí se lee de reojo mientras se escribe en la bitácora, y se abre
// nada más cuando hay algo que palomear.
//
// Se puede palomear cualquier etapa, no solo la siguiente, y palomearla da por
// cumplidas las anteriores; despalomear una tira las que vienen después. Es la
// única forma de que "3 de 5" quiera decir algo: un camino con huecos no se
// puede resumir en un número, y ese número es justo lo que se va a leer en la
// lista general sin abrir un solo ítem.
function BarraProceso({ e, etapas, hechas, n, puedeMarcar = true, abierta, onAbrir, onChanged }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState('');
  const hecha = new Map(hechas.map((h) => [h.etapa, h]));
  const falta = etapas[n];                       // la etapa que toca ahora

  async function marca(etapa, valor) {
    const i = etapas.findIndex((x) => x.clave === etapa.clave);
    const arrastra = valor
      ? etapas.slice(0, i).filter((x) => !hecha.has(x.clave))
      : etapas.slice(i + 1).filter((x) => hecha.has(x.clave));
    const nombres = arrastra.map((x) => x.nombre).join(', ');
    if (arrastra.length && !confirm(valor
      ? `Palomear ${etapa.nombre} da también por cumplida${arrastra.length > 1 ? 's' : ''} ${nombres}. ¿Seguir?`
      : `Quitar ${etapa.nombre} deja pendiente${arrastra.length > 1 ? 's' : ''} también ${nombres}. ¿Seguir?`)) return;
    // Entregar es la bisagra del ítem: de un lado se fabrica, del otro se
    // corrige. Se pregunta aparte aunque no arrastre a nadie.
    if (etapa.abre_punchlist && !arrastra.length && !confirm(valor
      ? `¿Dar por entregado ${e.code || e.name}? A partir de ahí se le levantan pendientes.`
      : `¿Regresar ${e.code || e.name} a producción? Los pendientes que ya tiene no se borran: vuelven a la vista cuando se entregue otra vez.`)) return;
    setBusy(etapa.clave);
    try {
      await escribir({
        ruta: `/elements/${e.id}/etapas`, cuerpo: { clave: etapa.clave, hecha: valor },
        parche: {
          clave: `/elements/${e.id}`,
          fn: (d) => {
            const toca = new Set((valor ? etapas.slice(0, i + 1) : etapas.slice(i)).map((x) => x.clave));
            const resto = (d.hechas || []).filter((h) => !toca.has(h.etapa));
            const ahora = new Date().toISOString();
            d.hechas = valor ? [...resto, ...[...toca].map((c) => ({ etapa: c, hecha_en: ahora }))] : resto;
            const bisagra = etapas.find((x) => x.abre_punchlist);
            if (bisagra && toca.has(bisagra.clave)) {
              d.element = { ...d.element, fase: valor ? 'punchlist' : 'produccion', entregado_en: valor ? ahora : null };
            }
            return d;
          },
        },
      });
      onChanged();
    } catch (x) { toast(x.message); } finally { setBusy(''); }
  }

  return (
    <div className={'barproc' + (abierta ? ' abierta' : '')}>
      {abierta && (
        <div className="proc">
          {etapas.map((x, i) => {
            const h = hecha.get(x.clave);
            const sig = !h && i === n;
            return (
              <button key={x.clave} className={'pstep' + (h ? ' ok' : '') + (sig ? ' sig' : '') + (x.abre_punchlist ? ' bisagra' : '')}
                disabled={!puedeMarcar || busy === x.clave} onClick={() => marca(x, !h)}>
                <i className="caja">{h ? '✓' : ''}</i>
                <div>
                  <div className="t">{x.nombre}{!!x.abre_punchlist && <span className="pill acu">abre punchlist</span>}</div>
                  <div className="sub">
                    {h ? <>Cumplida {fmtD(h.hecha_en)}{h.hecha_por_nombre ? ` · ${h.hecha_por_nombre}` : ''}</>
                       : sig ? 'Es la que sigue' : 'Pendiente'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <button className="resumen" onClick={onAbrir} aria-expanded={abierta}
        title={abierta ? 'Cerrar el proceso' : 'Abrir el proceso para palomear'}>
        <span className="pipe">{etapas.map((x, i) => <i key={x.clave} className={(i < n ? 'ok' : '') + (x.abre_punchlist ? ' bisagra' : '')} />)}</span>
        <span className="donde">{falta ? <><b>Sigue:</b> {falta.nombre}</> : <b>Entregado</b>}</span>
        <span className="cuantas">{n}/{etapas.length}</span>
        <span className="flecha">{abierta ? '▾' : '▴'}</span>
      </button>
    </div>
  );
}

function Punch({ e, punch, flash, onChanged, setLb, user, staff, veTodo = staff, members, onEntregar, onVerProceso }) {
  const { toast } = useApp();
  const [f, setF] = useState({ title: '', resp: e.resp || '', due_date: todayISO(3), assignee_id: '' });
  const [evid, setEvid] = useState(null);          // el pendiente que se está dando por terminado
  const contratistas = (members || []).filter((m) => m.role === 'con');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const { pending, add, clear, remove } = usePending();
  const tot = punch.length, ok = punch.filter((k) => k.status === 'ok').length, pr = punch.filter((k) => k.status === 'proc').length;

  async function cycle(k) {
    if (!staff) return;   // el contratista marca terminado con evidencia, no a dedo
    const next = k.status === 'pend' ? 'proc' : k.status === 'proc' ? 'ok' : 'pend';
    await escribir({
      metodo: 'PATCH', ruta: `/punch/${k.id}`, cuerpo: { status: next },
      parche: { clave: `/elements/${e.id}`, fn: (d) => { d.punch = (d.punch || []).map((x) => x.id === k.id ? { ...x, status: next, __pendiente: true } : x); return d; } },
    }).catch((x) => toast(x.message));
    onChanged();
  }
  async function create() {
    if (!f.title.trim()) return;
    setBusy(true);
    try {
      const r = await escribir({
        ruta: `/elements/${e.id}/punch`,
        campos: { title: f.title.trim(), resp: f.resp, due_date: f.due_date, ...(f.assignee_id ? { assignee_id: f.assignee_id } : {}) },
        archivos: pending.map((p) => p.file),
        parche: {
          clave: `/elements/${e.id}`,
          fn: (d) => {
            d.punch = [...(d.punch || []), {
              id: 'local-' + Date.now(), title: f.title.trim(), status: 'pend', resp: f.resp,
              due_date: f.due_date, photos: [], created_at: new Date().toISOString(), __pendiente: true,
            }];
            return d;
          },
        },
      });
      setF({ ...f, title: '' }); clear(); setAdding(false); onChanged();
      if (!r.subido) toast('Sin señal: el pendiente se sube solo cuando vuelva.');
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function addPhotos(k, files) {
    const fd = new FormData();
    for (const file of files) fd.append('photos', await compressImage(file));
    await api.form(`/punch/${k.id}/photos`, fd).catch((x) => toast(x.message)); onChanged();
  }
  async function delPhoto(p) { if (!confirm('¿Quitar esta foto?')) return; await api.del(`/photos/${p.id}`).catch((x) => toast(x.message)); onChanged(); }
  async function del(k) { if (!confirm('¿Borrar este detalle?')) return; await api.del(`/punch/${k.id}`).catch((x) => toast(x.message)); onChanged(); }

  // En producción no hay punchlist: todavía no se ha entregado nada que
  // corregir. En vez de una lista vacía sin explicación, se dice por qué y se
  // ofrece el único paso que la abre.
  if (e.fase !== 'punchlist') {
    return (
      <div className="body">
        <div className="empty">
          <h3>Sigue en producción</h3>
          Mientras se fabrica o se instala, lo que pasa se escribe en el muro del ítem.
          Los pendientes se levantan cuando ya está entregado y hay algo que corregir.
          {!!punch.length && <div style={{ marginTop: 10 }}>Tiene {punch.length} {punch.length === 1 ? 'pendiente guardado' : 'pendientes guardados'} de antes; vuelven a la vista al entregarlo.</div>}
        </div>
        {staff && onVerProceso && <button className="btn primary block" onClick={onVerProceso}>Ver el proceso del ítem</button>}
      </div>
    );
  }

  return (
    <>
      <div className="body">
        {staff && onEntregar && (
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onEntregar('produccion')}>Regresar a producción</button>
        )}
        {tot > 0 && <div className="plsum"><span>{ok}/{tot} resueltos</span><div className="bar"><i style={{ width: `${(ok / tot) * 100}%`, background: 'var(--ok)' }} /><i style={{ width: `${(pr / tot) * 100}%`, background: 'var(--proc)' }} /></div></div>}
        <div className="pl">
          {!punch.length && <div className="empty"><h3>Sin pendientes</h3>{veTodo ? 'Este ítem no tiene detalles abiertos.' : 'Aquí no tienes nada asignado.'}</div>}
          {punch.map((k) => (
            <div key={k.id} className={'pi ' + k.status + (k.id === flash ? ' flash' : '')} data-k={k.id}>
              <div className="st" onClick={() => cycle(k)} title="Cambiar estado">{k.status === 'ok' ? '✓' : k.status === 'proc' ? '…' : ''}</div>
              <div>
                <div className="t">{k.title}</div>
                <div className="sub"><span className={'pill ' + k.status}>{ST[k.status]}</span>{k.__pendiente && <span className="pill">Por subir</span>}{isLate(k) && <span className="pill late">Vencido</span>}<span>{k.status === 'ok' ? 'Resuelto ' + fmtD(k.done_at) : 'Límite ' + fmtD(k.due_date)}</span>{staff && k.assignee_name && <span>{k.assignee_name}{k.assignee_company ? ` · ${k.assignee_company}` : ''}</span>}{!k.assignee_name && k.resp && <span>{k.resp}</span>}</div>
                <Photos photos={k.photos} setLb={setLb} onDelete={staff ? delPhoto : null} />
                {evid === k.id ? (
                  <Evidencia k={k} onListo={() => { setEvid(null); onChanged(); }} onCancel={() => setEvid(null)} />
                ) : (
                  <div className="row" style={{ marginTop: 6, gap: 6 }}>
                    {staff && <label className="btn sm">+ Foto<input type="file" accept="image/*" capture="environment" multiple hidden onChange={(ev) => { addPhotos(k, [...ev.target.files]); ev.target.value = ''; }} /></label>}
                    {!veTodo && k.status !== 'ok' && <button className="btn primary sm" onClick={() => setEvid(k.id)}>Ya quedó — subir evidencia</button>}
                    {!veTodo && k.status === 'proc' && <span className="muted" style={{ fontSize: 12.5 }}>Esperando revisión del supervisor</span>}
                    {staff && <button className="btn sm danger" onClick={() => del(k)}>Borrar</button>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {adding ? (
          <div className="newpi">
            <div className="eyebrow">Nuevo detalle</div>
            <input autoFocus value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} placeholder="Describe el detalle o tarea…" />
            <div className="two">
              {contratistas.length
                ? <select value={f.assignee_id} onChange={(ev) => setF({ ...f, assignee_id: ev.target.value })}>
                    <option value="">Sin asignar</option>
                    {contratistas.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
                  </select>
                : <input value={f.resp} onChange={(ev) => setF({ ...f, resp: ev.target.value })} placeholder="Responsable" />}
              <input type="date" value={f.due_date} onChange={(ev) => setF({ ...f, due_date: ev.target.value })} />
            </div>
            {!contratistas.length && <div className="muted" style={{ fontSize: 12.5 }}>Para asignárselo a alguien, agrégalo primero a la obra en Usuarios y accesos.</div>}
            {!!contratistas.length && !f.assignee_id && <div className="muted" style={{ fontSize: 12.5 }}>Sin asignar, nadie lo va a ver en su lista.</div>}
            <PendingStrip pending={pending} remove={remove} />
            <div className="row"><PhotoInput onFiles={add} /><div className="spacer" /><button className="btn sm" onClick={() => { setAdding(false); clear(); }}>Cancelar</button><button className="btn primary sm" disabled={busy || !f.title.trim()} onClick={create}>{busy ? 'Guardando…' : 'Agregar'}</button></div>
          </div>
        ) : (
          staff && <button className="btn primary block" onClick={() => setAdding(true)}>+ Nuevo detalle</button>
        )}
      </div>
    </>
  );
}

// Lo único que el contratista empuja: la foto de que ya quedó y, si quiere, una
// nota. El pendiente pasa a "en proceso" y queda anotado en la bitácora del
// ítem con su nombre y la hora. Quien lo cierra es el supervisor.
function Evidencia({ k, onListo, onCancel }) {
  const { toast } = useApp();
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const { pending, add, clear, remove } = usePending();

  async function enviar() {
    if (!nota.trim() && !pending.length) return;
    setBusy(true);
    try {
      const r = await escribir({
        ruta: `/punch/${k.id}/evidencia`,
        campos: { nota: nota.trim() },
        archivos: pending.map((p) => p.file),
      });
      clear(); onListo();
      if (!r.subido) toast('Sin señal: tu evidencia se sube sola cuando vuelva.');
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="newpi" style={{ marginTop: 8 }}>
      <div className="eyebrow">Evidencia de que ya quedó</div>
      <textarea rows={2} value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Qué hiciste (opcional si subes foto)…" />
      <PendingStrip pending={pending} remove={remove} />
      <div className="row">
        <PhotoInput onFiles={add} />
        <div className="spacer" />
        <button className="btn sm" onClick={() => { clear(); onCancel(); }}>Cancelar</button>
        <button className="btn primary sm" disabled={busy || (!nota.trim() && !pending.length)} onClick={enviar}>{busy ? 'Subiendo…' : 'Marcar terminado'}</button>
      </div>
    </div>
  );
}

/* El diseño definido de la pieza, con su archivo (Mike, 9-oct-2026: «desde
 * quell quiero poder marcar que el diseño ya está definido y poder adjuntar
 * un plano (pdf) o imagen del diseño definido»). Con botones escogió que el
 * archivo vaya APARTE: entra como archivo de soporte marcado como diseño y
 * el plano principal no se toca. Uno vivo por pieza; uno nuevo archiva el
 * anterior (API 0.90.0). La fecha sigue siendo el candado del cronograma.
 *
 * La fecha llega como AAAA-MM-DD: se lee a mediodía para que en la Ciudad
 * de México no salga el día anterior. */
const diaDe = (f) => fmtD(`${f}T12:00:00`);
function DisenoDefinido({ e, onChanged }) {
  const [abierto, setAbierto] = useState(false);
  const doc = e.diseno_doc;
  return (
    <>
      <span data-candado="diseno" className={e.diseno_definido ? '' : 'falta'} title="La fecha en que quedó definido el diseño, con su plano o imagen. Es uno de los dos candados del cronograma.">
        <button type="button" className="liga" data-diseno="marcar" onClick={() => setAbierto(true)}>Diseño {e.diseno_definido ? `definido ${diaDe(e.diseno_definido)}` : 'sin definir'}</button>
        {doc && <> · <a className="liga" data-diseno="ver" href={fileUrl(doc.r2_key)} target="_blank" rel="noreferrer" title={doc.nombre}>ver diseño</a></>}
      </span>
      {abierto && <MarcarDiseno e={e} onClose={() => setAbierto(false)} onChanged={onChanged} />}
    </>
  );
}

function MarcarDiseno({ e, onClose, onChanged }) {
  const { toast } = useApp();
  const [fecha, setFecha] = useState(e.diseno_definido || todayISO());
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [soltando, setSoltando] = useState(false);
  const doc = e.diseno_doc;
  // Pegar (Ctrl-V) o arrastrar, igual que el plano principal.
  const toma = (dt) => {
    const f = planoDe(dt);
    if (!f) return false;
    const nombre = nombreDePlanoPegado(f);
    setFile(f.name === nombre ? f : new File([f], nombre, { type: f.type }));
    return true;
  };
  useEffect(() => {
    const onPaste = (ev) => { if (toma(ev.clipboardData)) ev.preventDefault(); };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  async function guardar(ev) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (file) {
        const fd = new FormData();
        fd.append('archivo', file);
        fd.append('op_id', idOp());
        fd.append('nombre', file.name);
        fd.append('paginas', String(await cuentaPaginas(file)));
        fd.append('diseno', '1');
        fd.append('diseno_definido', fecha);
        const r = await api.form(`/elements/${e.id}/docs`, fd);
        toast(r.archivada ? 'Diseño guardado. El archivo anterior quedó archivado.' : 'Diseño guardado.');
      } else {
        await api.patch(`/elements/${e.id}`, { diseno_definido: fecha });
        toast('Diseño marcado como definido.');
      }
      onChanged();
      onClose();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function quitar() {
    setBusy(true);
    try {
      await api.patch(`/elements/${e.id}`, { diseno_definido: null });
      toast('El diseño quedó sin definir. Su archivo sigue en «Archivos del ítem».');
      onChanged();
      onClose();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="ov" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form className="modal" data-diseno="cuadro" onSubmit={guardar}>
        <h2>Diseño definido</h2>
        <div className="field"><label>Definido el</label><input type="date" required value={fecha} onChange={(ev) => setFecha(ev.target.value)} /></div>
        <div
          className={'field diseno-archivo' + (soltando ? ' soltando' : '')}
          onDragOver={(ev) => { ev.preventDefault(); setSoltando(true); }}
          onDragLeave={() => setSoltando(false)}
          onDrop={(ev) => { ev.preventDefault(); setSoltando(false); toma(ev.dataTransfer); }}
        >
          <label>Plano o imagen del diseño <small className="muted">(PDF o imagen; también se pega o se arrastra)</small></label>
          <label className="btn sm">{file ? 'Cambiar archivo' : 'Escoger archivo'}<input type="file" accept=".pdf,application/pdf,image/*" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) setFile(f); ev.target.value = ''; }} /></label>
          {file && <div className="muted" data-diseno="escogido">{file.name}</div>}
          {doc && <div className="muted">Ahora: <a className="liga" href={fileUrl(doc.r2_key)} target="_blank" rel="noreferrer">{doc.nombre}</a>{doc.version > 1 ? ` (v${doc.version})` : ''}.{file ? ' Al guardar, éste queda archivado.' : ''}</div>}
          <div className="muted">Va aparte del plano principal, que no se toca. Se ve también en «Archivos del ítem».</div>
        </div>
        {e.diseno_definido && <button type="button" className="btn" disabled={busy} onClick={quitar}>Quitar la marca (diseño sin definir)</button>}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || !fecha}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </div>
  );
}

function EditElement({ e, onClose, onChanged, onDeleted, onReubicar }) {
  const { toast } = useApp();
  const [f, setF] = useState({ code: e.code, type: e.type, name: e.name, resp: e.resp, diseno_definido: e.diseno_definido || '' });
  const [confirm, setConfirm] = useState(false);
  // Un ítem viejo con un tipo que ya no está en la lista conserva el suyo.
  const tipos = [...TIPOS.map((t) => t.clave), ...(TIPOS.some((t) => t.clave === e.type) ? [] : [e.type])];
  return (
    <div className="ov" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form className="modal" onSubmit={async (ev) => { ev.preventDefault(); await api.patch(`/elements/${e.id}`, f).catch((x) => toast(x.message)); onChanged(); onClose(); }}>
        <h2>Editar ítem</h2>
        <div className="two"><div className="field"><label>Clave</label><input value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value })} /></div><div className="field"><label>Tipo</label><select value={f.type} onChange={(ev) => setF({ ...f, type: ev.target.value })}>{tipos.map((t) => <option key={t}>{t}</option>)}</select></div></div>
        <div className="field"><label>Nombre</label><input required value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></div>
        <div className="field"><label>Responsable <small className="muted">(texto, como siempre; los contratistas con cuenta van arriba)</small></label><input value={f.resp} onChange={(ev) => setF({ ...f, resp: ev.target.value })} /></div>
        {/* Mike, 6-oct-2026: «poder marcar en el ítem la fecha de definición de
            diseño, y si hay cambios, poder editarla. Esa edición (…) movería
            todo el ítem dentro del cronograma». Vacía = sin definir. */}
        <div className="field"><label>Diseño definido el <small className="muted">(candado del cronograma; vacío = sin definir)</small></label><input type="date" value={f.diseno_definido} onChange={(ev) => setF({ ...f, diseno_definido: ev.target.value })} /></div>
        {onReubicar && <button type="button" className="btn" onClick={onReubicar}>Reubicar en el plano…</button>}
        {!confirm ? <button type="button" className="btn danger" onClick={() => setConfirm(true)}>Borrar ítem (bitácora y punchlist incluidos)…</button>
          : <button type="button" className="btn danger" onClick={async () => { await api.del(`/elements/${e.id}`).catch((x) => toast(x.message)); onDeleted(); }}>Confirmar borrado definitivo</button>}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar</button></div>
      </form>
    </div>
  );
}

/* Sacar un ítem del alcance, o agregarlo, desde la obra.
 *
 * Mike, 20-sep: «se debe poder cancelar algún ítem ya sea desde quell o
 * desde dash, y se refleja en los 2». Se refleja solo: es el MISMO ítem en
 * la misma base de la empresa, no hay nada que sincronizar.
 *
 * Mike, 2-oct: «solo existirá "en alcance" o "fuera de alcance" (…) solo en
 * la bitácora sí aparecerá como "se sacó del alcance" y si se agrega de nuevo
 * aparecerá después "se agregó al alcance" con su fecha y quién la agregó».
 * Así que ya no hay un tercer estado: dos botones y, debajo, la
 * bitácora que manda la suite en `item_alcance_movimientos`.
 *
 * En dos pasos y con motivo: sacar quita el ítem del precio de venta del
 * proyecto, y «por qué se cayó esto» no tiene otra respuesta tres meses
 * después. */
/* La fecha de entrega del ítem y cuántos días faltan (contrato 0.40.0).
 *
 * Mike, 21-sep: «hay que agregar un campo en el ítem de fecha de entrega y un
 * contador de cuántos días quedan para la entrega».
 *
 * LA CUENTA NO SE HACE AQUÍ. Viene resuelta de la API, en
 * `item_entrega_falta`, por dos razones: tres apps contando días son tres
 * maneras de que una diga «faltan 3» y otra «faltan 2», y una cuenta hecha en
 * el navegador hereda el reloj del aparato —un celular de obra con la fecha
 * mal puesta diría que hay margen cuando ya se venció—.
 *
 * LA FECHA TAMPOCO ES DE AQUÍ: se guarda en el ítem, que es el mismo que ve
 * dash101 y el que el portal ya le enseña al cliente. Se fija desde la obra
 * porque es donde se sabe, no porque haya una copia.
 *
 * Sin fecha no se pinta una alarma sino un botón: «todavía no se sabe» es un
 * estado legítimo de una obra, y tratarlo como un descuido llena la pantalla
 * de rojo que nadie atiende.
 */
function Entrega({ e, staff, onChanged }) {
  const [abierto, setAbierto] = React.useState(false);
  const [fecha, setFecha] = React.useState(e.item_fecha_entrega || '');
  const [yendo, setYendo] = React.useState(false);
  const falta = e.item_entrega_falta;

  React.useEffect(() => { setFecha(e.item_fecha_entrega || ''); }, [e.id, e.item_fecha_entrega]);

  const guardar = async (valor) => {
    setYendo(true);
    try {
      await escribir({ ruta: `/elements/${e.id}/entrega`, cuerpo: { fecha: valor } });
      setAbierto(false);
      onChanged();
    } catch (err) {
      alert(err.message || 'No se pudo guardar la fecha.');
    } finally {
      setYendo(false);
    }
  };

  if (abierto) {
    return (
      <div className="entrega editando">
        <label>Se entrega el</label>
        <input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
        <button className="btn sm" disabled={yendo} onClick={() => guardar(fecha)}>{yendo ? 'Guardando…' : 'Guardar'}</button>
        {e.item_fecha_entrega && (
          <button className="btn sm" disabled={yendo} onClick={() => guardar('')} title="Dejarla sin fecha">Quitar</button>
        )}
        <button className="btn sm" disabled={yendo} onClick={() => { setAbierto(false); setFecha(e.item_fecha_entrega || ''); }}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="entrega">
      {falta ? (
        <>
          <span className={'pill entrega' + (falta.tarde ? ' tarde' : falta.dias <= 3 ? ' cerca' : '')}>{falta.dice}</span>
          <span className="cuando">Se entrega el {fmtDay(e.item_fecha_entrega)}</span>
        </>
      ) : (
        <span className="cuando">Sin fecha de entrega</span>
      )}
      {staff && (
        <button className="btn sm" onClick={() => setAbierto(true)}>
          {e.item_fecha_entrega ? 'Cambiar' : 'Poner fecha'}
        </button>
      )}
    </div>
  );
}

function Alcance({ e, onChanged }) {
  const [abierto, setAbierto] = React.useState(false);
  const [motivo, setMotivo] = React.useState('');
  const [yendo, setYendo] = React.useState(false);
  const [dicho, setDicho] = React.useState('');
  const fuera = (e.alcance || 'dentro') !== 'dentro';

  const movimientos = e.item_alcance_movimientos || [];

  const mover = async (que) => {
    setYendo(true);
    try {
      const r = await api.post(`/items/${e.item_id}/${que}`, que === 'sacar' ? { motivo } : {});
      const como = r?.data?.alcance;
      setDicho(como === 'dentro'
        ? 'Se agregó al alcance: ya cuenta en el precio de venta del proyecto.'
        : 'Se sacó del alcance: ya no cuenta en el precio de venta del proyecto.');
      setAbierto(false); setMotivo('');
      onChanged();
    } catch (err) {
      setDicho(err.message || 'No se pudo.');
    } finally {
      setYendo(false);
    }
  };

  return (
    <div className="alcance">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '4px 0 4px' }}>
        {fuera ? (
          <button className="btn sm" disabled={yendo} onClick={() => mover('aprobar')}>
            {yendo ? 'Un momento…' : 'Agregar al alcance'}
          </button>
        ) : !abierto ? (
          <button className="btn sm" onClick={() => setAbierto(true)}>Sacar del alcance</button>
        ) : (
          <>
            <input className="inp sm" style={{ width: 160 }} value={motivo} placeholder="¿Por qué?"
              onChange={(ev) => setMotivo(ev.target.value)} aria-label="Motivo" />
            <button className="btn sm danger" disabled={yendo} onClick={() => mover('sacar')}>
              {yendo ? 'Un momento…' : 'Confirmar'}
            </button>
            <button className="btn sm" onClick={() => setAbierto(false)}>Mejor no</button>
          </>
        )}
        {dicho && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{dicho}</span>}
      </div>
      {/* La bitácora del alcance: cada entrada y salida con fecha y quién.
          Viene de la suite ya resuelta; aquí no se deduce nada. Un ítem
          sin movimientos es un requerimiento que nadie ha decidido todavía. */}
      {movimientos.length > 0 && (
        <ul className="alcance-bitacora" aria-label="Bitácora del alcance">
          {[...movimientos].reverse().map((m) => (
            <li key={m.id} className={m.accion}>
              <b>{MOVIMIENTOS_ALCANCE[m.accion] || m.accion}</b>
              {' · '}{fmtD(m.at)} {fmtT(m.at)}
              {m.quien ? <> · {m.quien}</> : <> · <i>sin registro de quién</i></>}
              {m.app ? <> · desde {m.app}</> : null}
              {m.motivo ? <span className="motivo">«{m.motivo}»</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
