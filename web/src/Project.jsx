import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api, leer, escribir, hayRed, fileUrl, FASES, ALCANCES, TIPOS, colorTipo, aguado, enRevision, fmtD, isLate, rasterizePlan, avance, veTodoEn, esCliente } from './api.js';
import { HONDURA, irA, sellar, useEncima } from './navegar.js';
import Dudas from './Dudas.jsx';
import Cronograma from './Cronograma.jsx';
import { useApp } from './App.jsx';
import PlanCanvas from './PlanCanvas.jsx';
import ElementPanel from './ElementPanel.jsx';
import Marca from './Marca.jsx';
import { buildReport, REPORT_CSS } from './report.js';
import { siguienteCodigo } from './codigos.js';
import { BotonCompartir } from './Fotos.jsx';
import { archivoDelPlano, entregar, puedeCompartir } from './compartir.js';
import { armarPdf, nombreDelReporte } from './reportePdf.js';

const TYPES = TIPOS.map((t) => t.clave);

export default function Project({ id, sub }) {
  const { user, go, logout, toast } = useApp();
  // El cliente (encargo B): ve el plano con sus ítems para ubicarse y los
  // puntos por definir. Lo demás de esta pantalla no le sale, y el servidor
  // tampoco se lo manda.
  const cli = esCliente(user);
  const staff = !cli && user.role !== 'con';
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [planId, setPlanId] = useState(null);
  /* DÓNDE ESTÁS lo dice la dirección, no una variable (22-sep-2026).
   *
   * `sub` es lo que sigue de `#/p/OBRA`: '' el plano, 'lista', 'dudas', o
   * 'e/ITEM' con un ítem abierto. Antes eran dos `useState` y por eso el
   * «atrás» del navegador no sabía nada de ellos y sacaba de la app.
   *
   * Derivarlos en vez de duplicarlos es lo que impide que la pantalla y la
   * barra de direcciones se contradigan: no hay dos copias que sincronizar. */
  const trozos = (sub || '').split('/').filter(Boolean);
  /* El ítem abierto va DESPUÉS de la vista (6-oct-2026): «…/cronograma/e/ITEM».
   * Mike: «cuando dé click en el ítem desde otra ubicación no quiero que me
   * regrese a la pantalla de plano, quiero sólo que me abra la barra lateral
   * con la info del ítem, sin que la ventana central se salga de lo que
   * estoy trabajando». Antes la dirección del ítem era sólo «…/e/ITEM» y por
   * eso abrir uno siempre era volver al plano. «…/e/ITEM» sigue sirviendo:
   * es el ítem sobre el plano, como las ligas que ya se mandaron. */
  const enE = trozos.indexOf('e');
  const sel = enE >= 0 ? trozos[enE + 1] || null : null;
  const deVista = enE === 0 ? null : trozos[0];
  /* 'cronograma' sólo existe para quien dirige la obra (5-oct-2026); para
   * los demás esa dirección es el plano. */
  const vista = ['lista', 'dudas'].includes(deVista) || (deVista === 'cronograma' && staff) ? deVista : 'plan';
  /* A esta pantalla también se llega sin navegar: por una liga que alguien
   * mandó, o recargando. Ahí el navegador deja el estado en nulo y el
   * módulo creería que estamos en el inicio, así que el primer paso
   * apilaría una entrada de más. Se sella al llegar y al cambiar. */
  useEffect(() => {
    sellar(sel ? HONDURA.item : vista !== 'plan' ? HONDURA.seccion : HONDURA.obra);
  }, [sel, vista]);
  const rutaDe = (v) => `/p/${id}${v && v !== 'plan' ? '/' + v : ''}`;
  const irSeccion = (v) => irA(rutaDe(v), v && v !== 'plan' ? HONDURA.seccion : HONDURA.obra);
  const [flash, setFlash] = useState(null);
  const [adding, setAdding] = useState(false);
  /* Con qué tipo nace el ítem que se está clavando. `null` es el alta de
   * siempre; 'Requerimiento' viene del botón aparte que pidió Mike. Es un
   * dato del alta y no un modo distinto: el formulario es el mismo, y quien
   * levanta un requerimiento puede cambiarle el tipo ahí mismo si se dio
   * cuenta de que ya estaba vendido. */
  const [tipoNuevo, setTipoNuevo] = useState(null);
  const [newAt, setNewAt] = useState(null);
  /* 0.56.0 · Subítem (Mike, 30-sep): un requerimiento que nace colgado de
   * una pieza. Se guarda de qué pieza es mientras el modal está abierto; el
   * pin nace junto al padre, en su mismo plano, y se puede reubicar después. */
  const [padreNuevo, setPadreNuevo] = useState(null);
  // Reubicar un ítem ya colocado: se pica desde «Editar ítem», se toca el
  // nuevo punto y se confirma (encargo A.4). Va por la fila, como el alta.
  const [moviendo, setMoviendo] = useState(null);   // { id, code } o null
  // Los tipos apagados, no los prendidos: así un tipo nuevo aparece solo, sin
  // que nadie tenga que acordarse de encenderlo.
  const [apagados, setApagados] = useState(() => new Set());
  const [fase, setFase] = useState('');   // '' = las dos fases
  /* EL ALCANCE. Mike, 20-sep: «los no aprobados, a pesar de que tienen precio
   * y toda la info, NO APARECEN en quell al menos que veas la vista de ítems
   * fuera de alcance». Mike, 2-oct: «solo existirá "en alcance" o "fuera de
   * alcance"»: ya no se divide entre no aprobados y cancelados; es una lista.
   *
   * Por omisión 'dentro': la obra enseña lo que se está fabricando. Lo que
   * está fuera sigue dibujado en el plano —la pieza no se borra— pero no
   * estorba hasta que alguien lo pide.
   *
   * Quién es qué lo dice la API en cada pieza (`alcance`), no esta pantalla:
   * la regla vive en el contrato y aquí sólo se lee. */
  const [alcance, setAlcance] = useState('dentro');
  const [drawer, setDrawer] = useState(false);
  const [openItems, setOpenItems] = useState(null);
  /* Los «ítems sin ubicar»: lo que se vendió en dash101 y todavía no tiene
   * pin en ningún plano. Mike, 20-sep: «deben de aparecer en una lista de
   * "ítems sin ubicar", para ir seleccionando y ubicando cada ítem en su
   * lugar». La cuenta la hace la suite, no esta pantalla. */
  const [sinUbicar, setSinUbicar] = useState([]);
  const [mview, setMview] = useState('plan'); // móvil: plan | pend | elem
  // El plano contesta "dónde"; la lista contesta "cómo van". Son la misma obra
  // vista de dos maneras y comparten los mismos filtros, así que apagar un tipo
  // en una lo apaga en la otra.
  /* `setVista` se queda con el mismo nombre para no reescribir la pantalla
   * entera, pero ahora navega en vez de guardar. Alternar entre plano y
   * lista no acumula historial: son el mismo nivel de hondura. */
  /* Cambiar de vista con un ítem abierto lo deja abierto: cambia lo de en
   * medio y el panel se queda (mismo nivel: reemplaza, no apila). */
  const setVista = (v) => (sel ? irA(`${rutaDe(v)}/e/${sel}`, HONDURA.item) : irSeccion(v));
  // Las dudas y el cronograma no se filtran por tipo ni por fase: ahí no hay plano.
  const sinFiltros = vista === 'dudas' || vista === 'cronograma';
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [pendiente, setPendiente] = useState(null); // el plano por subir, con su vista previa
  // La hoja de planos. En el celular no hay barra lateral, así que sin esto un
  // proyecto se quedaba con el primer plano para siempre: no había por dónde
  // subir el segundo ni cómo cambiar de uno a otro.
  const [planos, setPlanos] = useState(false);
  const [repView, setRepView] = useState(null);
  useEffect(() => { const f = (e) => setRepView(e.detail); window.addEventListener('bo:report', f); return () => window.removeEventListener('bo:report', f); }, []);

  const load = useCallback(async () => {
    try {
      const r = await leer(`/projects/${id}`);
      setData(r);
      setPlanId((p) => (p && r.plans.some((x) => x.id === p) ? p : r.plans[0]?.id || null));
    } catch (e) { toast(e.message); go('/'); }
  }, [id]);
  useEffect(() => { load(); leer('/projects').then((r) => setProjects(r.projects)).catch(() => {}); }, [load]);

  /* Se pide aparte y con `catch` mudo a propósito: una obra sin proyecto
   * ligado en dash101 contesta 409 `sin_liga`, y eso no es un error que
   * enseñarle a nadie en obra —simplemente no hay lista—. Tampoco pasa por
   * la caché de la fila: es una cuenta que cambia con cada pin que se clava,
   * y una cuenta vieja aquí haría poner una puerta de más. */
  const cargarSinUbicar = useCallback(() => {
    api.get(`/projects/${id}/sin-ubicar`)
      .then((r) => setSinUbicar(r?.data?.items || []))
      .catch(() => setSinUbicar([]));
  }, [id]);
  useEffect(() => { cargarSinUbicar(); }, [cargarSinUbicar]);

  // Bajar los planos de la obra en cuanto se abre, con señal. Se quedan en la
  // caché del navegador, así que el día que se entre al sótano el plano ya está
  // ahí. Un plano que no se puede abrir en obra no sirve de nada.
  useEffect(() => {
    if (!data || !hayRed()) return;
    let vivo = true;
    (async () => {
      for (const p of data.plans) {
        if (!vivo) return;
        for (const llave of [p.image_key, p.source_key]) {
          if (!llave) continue;
          try { await fetch(fileUrl(llave), { credentials: 'same-origin' }); } catch {}
        }
      }
    })();
    return () => { vivo = false; };
  }, [data?.plans?.length, data?.project?.id]);
  useEffect(() => { if (drawer) leer(`/projects/${id}/punch`).then((r) => setOpenItems(r.items)).catch((e) => toast(e.message)); }, [drawer, data]);

  // Editar la obra es de quien la dirige. Verla entera, también del trabajador:
  // son dos preguntas distintas y por eso son dos banderas. El contratista no
  // tiene ninguna de las dos y sigue viendo nada más lo que trae su nombre.
  const miRol = data?.mi_rol || null;
  const veTodo = veTodoEn(user, miRol);
  const plan = data?.plans.find((p) => p.id === planId) || null;
  const elements = useMemo(() => (data ? data.elements.filter((e) => e.plan_id === planId) : []), [data, planId]);
  // Los tipos que se pueden elegir salen de la lista de siempre más los que de
  // verdad hay en la obra: un ítem viejo con un tipo que ya no está en la lista
  // seguiría siendo invisible en el filtro, y desaparecer del plano sin que
  // nadie sepa por qué es peor que no filtrar.
  const tipos = useMemo(() => {
    const hay = new Set((data?.elements || []).map((e) => e.type || 'Otro'));
    return [...new Set([...TYPES, ...hay])];
  }, [data]);
  const filtra = (lista) => lista
    .filter((e) => !apagados.has(e.type || 'Otro'))
    .filter((e) => !fase || (e.fase || 'produccion') === fase)
    .filter((e) => alcance === 'todos' || (e.alcance || 'dentro') === alcance);
  const shown = filtra(elements);
  /* Cuántos hay de cada alcance, para poder decirlo en el propio filtro: un
   * selector que no dice cuántos hay detrás obliga a probar las tres
   * opciones para encontrar la que tiene algo. */
  const cuantosAlcance = (a) => (data?.elements || []).filter((e) => (e.alcance || 'dentro') === a).length;
  // La lista es de toda la obra y no de un plano: un ítem se atora en compras
  // sin que importe en qué hoja está dibujado.
  const listados = useMemo(() => filtra(data?.elements || []), [data, apagados, fase, alcance]);
  const etapas = data?.etapas || [];
  const enFase = (f) => elements.filter((e) => (e.fase || 'produccion') === f).length;
  const prende = (t) => setApagados((s0) => { const n = new Set(s0); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const openTotal = data ? data.elements.reduce((a, e) => a + e.n_pend + e.n_proc, 0) : 0;
  const lateTotal = openItems ? openItems.filter(isLate).length : null;

  /** Abrir un ítem es entrar más hondo: deja una entrada en el historial, y
   *  por eso «atrás» lo cierra en vez de sacar de la obra. El plano y el
   *  destello son de la vista y no de la dirección: no describen DÓNDE
   *  estás, así que compartir la liga no debe arrastrarlos. */
  function selectEl(eid, opts = {}) {
    setFlash(opts.flash || null);
    if (opts.planId && opts.planId !== planId) setPlanId(opts.planId);
    if (opts.mobile !== false) setMview('elem');
    const v = opts.vista || vista;
    const base = rutaDe(v);
    const yaAbierto = !!sel;
    irA(`${base}/e/${eid}`, HONDURA.item);
    /* De dónde se abrió, para cerrarlo regresando ahí (ver `cerrarEl`). Si
     * ya había uno abierto, se reemplazó y el de abajo sigue siendo el que
     * era: no se toca. */
    if (!yaAbierto) history.replaceState({ ...(history.state || {}), base }, '', null);
  }
  /** Cerrar el ítem: se sale hacia afuera, que `irA` resuelve con el propio
   *  historial. Si escribiera una entrada nueva, el siguiente «atrás»
   *  reabriría el ítem que la persona acaba de cerrar. */
  const cerrarEl = () => {
    setMview('plan');
    /* Si se abrió desde esta misma vista, cerrar es «atrás» (no queda una
     * entrada hacia adelante que lo reabra). Si se cambió de vista con el
     * ítem abierto, «atrás» regresaría a la vista anterior y sacaría a Mike
     * de donde está: entonces se reemplaza por la vista de ahora. */
    if (history.state && history.state.base === rutaDe(vista)) { irSeccion(vista); return; }
    history.replaceState({ hondura: vista !== 'plan' ? HONDURA.seccion : HONDURA.obra }, '', '#' + rutaDe(vista));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  /* Lo que se abre ENCIMA: «atrás» lo cierra en vez de salir de la obra.
   * Están juntas a propósito — si mañana se agrega una ventana y no se
   * apunta en esta lista, el «atrás» vuelve a sacar de la app y nadie lo
   * nota hasta que alguien lo sufre en obra. */
  useEncima(drawer, () => setDrawer(false));
  useEncima(!!newAt, () => { setNewAt(null); setTipoNuevo(null); setPadreNuevo(null); });
  useEncima(report, () => setReport(false));
  useEncima(planos, () => setPlanos(false));
  useEncima(!!editPlan, () => setEditPlan(null));
  useEncima(!!moviendo, () => setMoviendo(null));

  function onPlanClick(x, y) {
    if (moviendo) { reubicar(x, y); return; }
    if (!adding) return;
    setAdding(false); setNewAt({ x, y });
  }
  async function reubicar(x, y) {
    const { id: eid, code } = moviendo;
    if (!confirm(`¿Dejar ${code || 'el ítem'} aquí? Queda anotado en su bitácora quién lo movió.`)) return;
    setMoviendo(null);
    const r = await escribir({
      metodo: 'PATCH', ruta: `/elements/${eid}`, cuerpo: { x, y, reubicar: true },
      // Sin señal se ve movido al instante; sube solo cuando vuelva la señal.
      parche: { clave: `/projects/${id}`, fn: (d) => { d.elements = (d.elements || []).map((e) => (e.id === eid ? { ...e, x, y } : e)); return d; } },
    }).catch((e) => { toast(e.message); return null; });
    if (!r) return;
    toast(r.subido ? `${code || 'Ítem'} reubicado.` : `${code || 'Ítem'} reubicado; sube en cuanto haya señal.`);
    await load();
  }
  async function createElement(f) {
    const punto = { ...f, x: newAt.x, y: newAt.y, ...(padreNuevo ? { padre_id: padreNuevo.id } : {}) };
    const planDelPunto = padreNuevo?.plan_id || planId;
    const r = await escribir({
      ruta: `/plans/${planDelPunto}/elements`,
      cuerpo: punto,
      // Sin señal el pin aparece igual, con sus ceros: para quien lo clavó ya
      // está puesto, y pedírselo otra vez mañana es la manera de que no lo haga.
      parche: {
        clave: `/projects/${id}`,
        fn: (d) => {
          d.elements = [...(d.elements || []), {
            ...punto, id: 'local-' + Date.now(), plan_id: planDelPunto,
            n_pend: 0, n_proc: 0, n_total: 0, n_log: 0, created_at: new Date().toISOString(), __pendiente: true,
          }];
          return d;
        },
      },
    }).catch((e) => { toast(e.message); return null; });
    if (!r) return;
    /* 0.64.1 · Mike, 2-oct: «se genera como requerimiento (fuera de
     * alcance)». La suite lo marca fuera, y el filtro de la obra nace en
     * «En alcance»: si no se cambiara, el pin que la persona acaba de clavar
     * desaparecería. Se pasa a «Todos» para que lo vea, y el aviso de arriba
     * dice por qué. */
    if (enRevision(f.type) && alcance === 'dentro') setAlcance('todos');
    setNewAt(null); setTipoNuevo(null); setPadreNuevo(null); await load(); cargarSinUbicar();
    if (r.subido && r.r?.id) selectEl(r.r.id);
    else toast('Sin señal: el ítem se sube solo cuando vuelva.');
  }
  /* Subir un plano, o sustituir el que está (0029). Primero se enseña cómo
   * quedó rasterizado y se deja girarlo —Mike, 2-oct: «a veces el PDF viene
   * vertical»—; se sube hasta que se confirma. `sustituir` es el id del
   * plano que se va a reemplazar; sin él es un plano nuevo. */
  function uploadPlan(file, name, sustituir = null) {
    setPendiente({ file, name: name || file.name.replace(/\.\w+$/, ''), sustituir });
  }
  async function confirmarPlano({ file, name, sustituir }, giro) {
    setUploading(true);
    try {
      const { blob, width, height, rotation } = await rasterizePlan(file, giro);
      const fd = new FormData();
      if (!sustituir) fd.append('name', name);
      fd.append('file_name', file.name);
      fd.append('width', width); fd.append('height', height);
      fd.append('rotation', String(rotation));
      fd.append('image', new File([blob], 'plan.png', { type: blob.type }));
      if (file.size < 25 * 1024 * 1024) fd.append('source', file);
      const r = sustituir
        ? await api.form(`/plans/${sustituir}/sustituir`, fd)
        : await api.form(`/projects/${id}/plans`, fd);
      setPendiente(null);
      await load(); setPlanId(r.id);
      toast(sustituir ? `Plano sustituido: versión ${r.version}` : 'Plano cargado');
    } catch (e) { toast('No se pudo cargar el plano: ' + e.message); } finally { setUploading(false); }
  }
  async function generateReport(opts) {
    setReport(false); toast('Generando reporte…');
    try {
      const rep = await api.get(`/projects/${id}/report`);
      await buildReport({ project: data.project, plans: data.plans, elements: data.elements, ...rep, user, opts: { ...opts, planId, elementId: sel } });
    } catch (e) { toast(e.message); }
  }

  if (!data) return <div className="center"><div className="spin" /></div>;

  const cls = 'app' + (mview === 'elem' && sel ? ' view-elem' : '');
  return (
    <div className={cls}>
      <div className="top">
        {/* La casa manda al menú de obras. Antes ese trabajo lo hacía el nombre
            de la aplicación, que nadie pica porque parece un rótulo, no un
            botón; y en el celular quedaba reducido a un punto de color. */}
        <button className="casa" onClick={() => go('/')} title="Ir a mis obras" aria-label="Ir a mis obras"
          dangerouslySetInnerHTML={{ __html: ICO.casa }} />
        <span className="marca hide-m"><Marca alto={17} /></span>
        <select value={id} onChange={(e) => go(`/p/${e.target.value}`)}>
          {(projects.length ? projects : [data.project]).map((p) => <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</option>)}
        </select>
        <div className="spacer" />
        {staff && <button className="btn sm hide-m" onClick={() => setReport(true)} disabled={!plan}>Generar reporte</button>}
        {/* Dos botones y no un desplegable: levantar un requerimiento es un
            acto distinto de levantar una pieza vendida —lo hace otra persona,
            en otro momento y con otra intención—, y esconderlo dentro del
            alta de siempre es pedirle a quien anda en obra que se acuerde de
            cambiar un campo. Mike lo pidió como botón. */}
        {staff && <button className="btn sm" onClick={() => { if (!plan) return toast('Primero sube un plano'); setTipoNuevo('Requerimiento'); setAdding(true); setMview('plan'); }} title="Algo que el cliente pidió y todavía falta cotizar y autorizar">+ Requerimiento</button>}
        {staff && <button className="btn primary sm" onClick={() => { if (!plan) return toast('Primero sube un plano'); setTipoNuevo(null); setAdding(true); setMview('plan'); }}>+ Ítem</button>}
        <button className="avatar hide-m" onClick={logout} title={`${user.name} · salir`}>{user.name.slice(0, 2).toUpperCase()}</button>
      </div>

      <aside className="rail">
        <section>
          <div className="eyebrow">Planos</div>
          {data.plans.map((p) => <button key={p.id} className={'item' + (p.id === planId ? ' on' : '')} onClick={() => { setPlanId(p.id); cerrarEl(); }}><span>{p.name}</span><small>{data.elements.filter((e) => e.plan_id === p.id).length} ítems</small></button>)}
          {staff && <label className="btn sm" style={{ justifyContent: 'flex-start' }}>{uploading ? 'Procesando…' : '+ Subir plano (PDF / imagen)'}<input type="file" accept="application/pdf,image/*" hidden disabled={uploading} onChange={(e) => e.target.files[0] && uploadPlan(e.target.files[0])} /></label>}
          {staff && plan && <button className="btn sm" style={{ justifyContent: 'flex-start' }} onClick={() => setEditPlan(plan)}>Renombrar / borrar plano</button>}
        </section>
        <section>
          <div className="eyebrow">Resumen del plano</div>
          {cli ? (
            <div className="stats">
              <div className="stat"><b>{elements.length}</b><span>ítems</span></div>
              <div className="stat"><b>{data.dudas_abiertas || 0}</b><span>por definir</span></div>
            </div>
          ) : (
            <div className="stats">
              <div className="stat"><b>{elements.length}</b><span>ítems</span></div>
              <div className="stat"><b>{enFase('produccion')}</b><span>en producción</span></div>
              <div className="stat"><b>{elements.reduce((a, e) => a + e.n_pend + e.n_proc, 0)}</b><span>pendientes</span></div>
              <div className="stat"><b>{data.elements.length}</b><span>en la obra</span></div>
            </div>
          )}
        </section>
        <section>
          <div className="eyebrow">Cómo leer un pin</div>
          <div className="legend">
            <span><i className="dot" style={{ background: colorTipo('Mueble') }} />El relleno es el tipo</span>
            {cli
              ? <span><i className="dot" style={{ background: 'var(--accent)' }} />Resaltado: tiene puntos por definir</span>
              : <>
                  <span><i className="dot aro pend" />Aro rojo: punchlist sin cerrar</span>
                  <span><i className="dot hueco" style={{ background: aguado(colorTipo('Mueble')), borderColor: colorTipo('Mueble') }} />Aguado: en producción</span>
                </>}
          </div>
        </section>
        <section>
          {tipos.map((t) => (
            <button key={t} className={'item swatch fila' + (apagados.has(t) ? ' off' : '')} onClick={() => prende(t)} style={{ ['--tinte']: colorTipo(t) }}>
              <i />{t} <small>{elements.filter((e) => (e.type || 'Otro') === t).length}</small>
            </button>
          ))}
          {!cli && <button className={'item' + (fase === 'produccion' ? ' on' : '')} onClick={() => setFase(fase === 'produccion' ? '' : 'produccion')}>En producción <small>{enFase('produccion')}</small></button>}
          {!cli && <button className={'item' + (fase === 'punchlist' ? ' on' : '')} onClick={() => setFase(fase === 'punchlist' ? '' : 'punchlist')}>Punchlist <small>{enFase('punchlist')}</small></button>}
          {!cli && <button className={'item' + (vista === 'lista' ? ' on' : '')} onClick={() => setVista(vista === 'lista' ? 'plan' : 'lista')}>Ver la obra en lista <small>{data.elements.length}</small></button>}
          <button className={'item' + (vista === 'dudas' ? ' on' : '')} onClick={() => setVista(vista === 'dudas' ? 'plan' : 'dudas')}>{cli ? 'Puntos por definir' : staff ? 'Dudas por contestar' : 'Mis dudas'} <small>{data.dudas_abiertas || 0}</small></button>
          {!cli && <button className={'item' + (drawer ? ' on' : '')} onClick={() => setDrawer(!drawer)}>Ver lista de pendientes <small>{openTotal}</small></button>}
          {staff && <button className={'item' + (vista === 'cronograma' ? ' on' : '')} onClick={() => setVista(vista === 'cronograma' ? 'plan' : 'cronograma')}>Cronograma</button>}
          {staff && <button className="item" onClick={() => go('/admin')}>Usuarios y accesos</button>}
        </section>
      </aside>

      <main className={'stage' + (vista !== 'plan' ? ' enlista' : '')}>
        <div className="tools">
          {/* La vista, en un menú desplegable (Mike, 6-oct-2026: «No se ven las
              opciones, hazlo un dropdown menu»). Eran cuatro botones en fila y
              con el panel del ítem abierto sólo cabían «Plano» y «Li». Un
              <select> ocupa lo mismo tenga dos opciones o cinco. */}
          <select className="btn sm vista" value={vista} data-vista
            onChange={(ev) => { const v = ev.target.value; setVista(v); if (v !== 'plan') { setDrawer(false); setMview('plan'); } }}
            title="Qué se ve de la obra">
            <option value="plan">Plano</option>
            {!cli && <option value="lista">Lista</option>}
            <option value="dudas">{(cli ? 'Por definir' : 'Dudas') + (data.dudas_abiertas ? ` (${data.dudas_abiertas})` : '')}</option>
            {staff && <option value="cronograma">Cronograma</option>}
          </select>
          {/* El nombre del plano era un rótulo muerto y el cambio de plano un
              menú que solo aparecía si ya había dos. Ahora es un botón, siempre,
              y detrás está todo lo de planos: cuáles hay, cuál se ve, subir uno
              más, renombrar o borrar. En el celular es la única puerta. */}
          {vista === 'plan' && (
            <button className="btn sm planos" onClick={() => setPlanos(true)} title="Planos del proyecto">
              <i dangerouslySetInnerHTML={{ __html: ICO.capas }} />
              <b>{plan ? plan.name : 'Sin planos'}</b>
              {data.plans.length > 1 && <small>{data.plans.findIndex((p) => p.id === planId) + 1}/{data.plans.length}</small>}
              <span className="flecha">▾</span>
            </button>
          )}
          {/* Imprimir el plano. Mike, 20-sep: lo que se lleva a obra es una
              hoja, y la hoja tiene que leerse: el plano va más claro, los
              círculos conservan su color y el código sale en letra de
              imprenta. El encuadre lo hace solo el lienzo al oír
              `beforeprint`; aquí nada más se pide la impresión. */}
          {vista === 'plan' && plan && (
            <button className="btn sm ico" onClick={() => window.print()} title="Imprimir este plano con los códigos" aria-label="Imprimir">
              <i dangerouslySetInnerHTML={{ __html: ICO.imprimir }} />
            </button>
          )}
          {/* Compartir el plano tal cual se subió (PDF o imagen). Mike, 2-oct:
              «quiero compartir ese plano (imagen o pdf)»; el botón de compartir
              existía para las fotos y los documentos del ítem, no para el
              plano. Va junto a Imprimir, arriba, a la vista en el celular. */}
          {/* Mike, 5-oct: «Hay que hacer puro ícono el "imprimir" y el
              "compartir"»: con las palabras, en una pantalla de escritorio
              normal la barra ya no cabía y los selectores de la derecha se
              salían del borde. El texto sigue en `title` y `aria-label`. */}
          {vista === 'plan' && archivoDelPlano(plan) && (
            <BotonCompartir url={fileUrl(archivoDelPlano(plan).llave)} nombre={archivoDelPlano(plan).nombre} className="btn sm ico" etiqueta="Compartir">
              <i dangerouslySetInnerHTML={{ __html: ICO.compartir }} />
            </BotonCompartir>
          )}
          <div className="spacer" />
          {/* En escritorio los interruptores viven en la barra lateral, a la
              vista siempre; repetirlos aquí arriba era decir dos veces lo
              mismo y quitarle aire al plano. En el celular no hay barra
              lateral, así que aquí es donde tienen que estar. */}
          {!sinFiltros && <div className="swatches solo-m">
            {tipos.map((t) => (
              <button key={t} className={'swatch' + (apagados.has(t) ? ' off' : '')} onClick={() => prende(t)}
                style={{ ['--tinte']: colorTipo(t) }} title={apagados.has(t) ? `Mostrar ${t}` : `Ocultar ${t}`}>
                <i />{t}<small>{elements.filter((e) => (e.type || 'Otro') === t).length}</small>
              </button>
            ))}
          </div>}
          {!sinFiltros && !cli && (
            <select className={'btn sm' + (fase ? ' on' : '')} style={{ width: 'auto' }} value={fase} onChange={(ev) => setFase(ev.target.value)} title="Ver una sola fase">
              <option value="">Las dos fases</option>
              {Object.entries(FASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          {!sinFiltros && !cli && (
            <select className={'btn sm' + (alcance !== 'dentro' ? ' on' : '')} style={{ width: 'auto' }}
              value={alcance} onChange={(ev) => setAlcance(ev.target.value)} title="Ver los que están fuera del alcance">
              <option value="dentro">En proceso ({cuantosAlcance('dentro')})</option>
              <option value="fuera">Fuera de alcance ({cuantosAlcance('fuera')})</option>
              <option value="todos">Todos</option>
            </select>
          )}
        </div>
        {(apagados.size > 0 || fase || alcance !== 'dentro') && !adding && !sinFiltros && (
          <div className="hint">
            Viendo {vista === 'lista' ? listados.length : shown.length} de {vista === 'lista' ? data.elements.length : elements.length} ítems{apagados.size ? ` · sin ${[...apagados].join(', ').toLowerCase()}` : ''}{fase ? ` · ${FASES[fase]}` : ''}{alcance !== 'dentro' ? ` · ${ALCANCES[alcance]}` : ''}
            <button className="btn sm" onClick={() => { setApagados(new Set()); setFase(''); setAlcance('dentro'); }}>Ver todos</button>
          </div>
        )}
        {adding && (
          <div className="hint">
            {/* El texto en su propia caja para que se ajuste solo: el aviso
                del requerimiento es más largo y en un celular de 390 empujaba
                el «Cancelar» fuera del borde. El «·» que los separaba se fue:
                ahora los separa el espacio del flex, que no se parte a media
                línea cuando el texto hace dos renglones. */}
            <span>{tipoNuevo === 'Requerimiento' ? 'Toca el plano donde va el requerimiento' : 'Toca el plano donde va el ítem'}</span>
            <button className="btn sm" onClick={() => { setAdding(false); setTipoNuevo(null); }}>Cancelar</button>
          </div>
        )}
        {moviendo && <div className="hint">Toca el plano donde va ahora {moviendo.code || 'el ítem'} · <button className="btn sm" onClick={() => setMoviendo(null)}>Cancelar</button></div>}
        {vista === 'cronograma' ? (
          <Cronograma pid={id} onIr={(e) => {
            /* Los renglones del cronograma traen la pieza como `element_id`
             * y sin `plan_id`; con `e.id` se abría «undefined» y el panel se
             * quedaba cargando (Mike, 6-oct). */
            const eid = e.element_id || e.id;
            selectEl(eid, { planId: e.plan_id || (data.elements || []).find((x) => x.id === eid)?.plan_id });
            if (window.innerWidth <= 900) setMview('elem');
          }} />
        ) : vista === 'dudas' ? (
          <Dudas pid={id} staff={staff} user={user} cli={cli}
            onIr={(eid, plid) => { selectEl(eid, { planId: plid }); if (window.innerWidth <= 900) setMview('elem'); }} />
        ) : vista === 'lista' ? (
          <Lista items={listados} etapas={etapas} plans={data.plans} sel={sel}
            onIr={(e) => { selectEl(e.id, { planId: e.plan_id }); if (window.innerWidth <= 900) setMview('elem'); }} />
        ) : plan ? (
          <PlanCanvas plan={plan} elements={shown} sel={sel} flash={flash} adding={adding || !!moviendo} mios={data.mios || null} onPick={(eid) => selectEl(eid)} onClick={onPlanClick} />
        ) : (
          <div className="center" style={{ position: 'absolute', inset: 0 }}>
            <div className="empty"><h3>Sin planos</h3>{staff ? <label className="btn primary">{uploading ? 'Procesando…' : 'Subir plano (PDF o imagen)'}<input type="file" accept="application/pdf,image/*" hidden disabled={uploading} onChange={(e) => e.target.files[0] && uploadPlan(e.target.files[0])} /></label> : 'El supervisor aún no ha cargado planos.'}</div>
          </div>
        )}
        {drawer && (
          <div className="drawer">
            <div className="dh"><span>Pendientes · {openItems ? openItems.length : '…'}{lateTotal ? <span className="pill late" style={{ marginLeft: 8 }}>{lateTotal} vencidos</span> : null}</span><button className="btn sm" onClick={() => setDrawer(false)}>×</button></div>
            {openItems && !openItems.length && <div className="empty">Sin pendientes abiertos.</div>}
            {openItems && openItems.map((k) => (
              <button key={k.id} className={'drow' + (flash === k.id ? ' on' : '')} onClick={() => { selectEl(k.element_id, { flash: k.id, planId: k.plan_id }); if (window.innerWidth <= 900) setDrawer(false); }}>
                <i className={'dot ' + k.status} /><div><div className="t">{k.title}</div><div className="s">{k.element_code} · {k.element_name} · {k.plan_name}</div></div>
                <span className={'due' + (isLate(k) ? ' late' : '')}>{isLate(k) ? 'Vencido ' : ''}{fmtD(k.due_date)}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <ElementPanel key={sel || 'none'} elementId={sel} flash={flash} plan={plan} staff={staff} veTodo={veTodo} user={user} members={data.members} todos={data.elements} onIr={(eid, pid) => selectEl(eid, { planId: pid })} onChanged={load} onClose={cerrarEl}
        onSubitem={(padre) => { setPadreNuevo(padre); setTipoNuevo('Requerimiento'); setNewAt({ x: Math.min(0.98, (padre.x ?? 0.5) + 0.015), y: Math.min(0.98, (padre.y ?? 0.5) + 0.015) }); }}
        onReubicar={(e) => {
          /* Mike, 2-oct (Bosques de Santa Fe): «le pongo reubicar en plano y
           * solo se sale de la función y deselecciona todo». Aquí decía
           * también `setVista('plan')`, y `setVista` NAVEGA: con el ítem
           * abierto (hondura 3) ir al plano (hondura 1) es un `history.back()`
           * que cierra el ítem, y su `popstate` tardío le llegaba al
           * `useEncima` de `moviendo` recién armado, que lo apagaba.
           * Desde el 6-oct un ítem se abre sin salir de la vista (lista,
           * cronograma, dudas), así que aquí SÍ hay que pasar al plano: se
           * hace al MISMO nivel (`irA` reemplaza; no hay `history.back()` ni
           * `popstate`), con el ítem abierto. La pestaña del celular es local. */
          if (vista !== 'plan') { if (e.plan_id && e.plan_id !== planId) setPlanId(e.plan_id); irA(`/p/${id}/e/${e.id}`, HONDURA.item); }
          setMoviendo({ id: e.id, code: e.code }); setMview('plan');
        }} />

      <nav className="mnav">
        <button className={mview === 'plan' && vista === 'plan' ? 'on' : ''} onClick={() => { setMview('plan'); setVista('plan'); setDrawer(false); }}><i dangerouslySetInnerHTML={{ __html: ICO.plan }} />Plano</button>
        {!cli && <button className={vista === 'lista' ? 'on' : ''} onClick={() => { setMview('plan'); setVista('lista'); setDrawer(false); }}><i dangerouslySetInnerHTML={{ __html: ICO.tabla }} />Lista</button>}
        {cli
          ? <button className={vista === 'dudas' ? 'on' : ''} onClick={() => { setMview('plan'); setVista('dudas'); }}><i dangerouslySetInnerHTML={{ __html: ICO.list }} />Por definir{data.dudas_abiertas ? <span className="badge">{data.dudas_abiertas}</span> : null}</button>
          : <button className={drawer ? 'on' : ''} onClick={() => { setMview('plan'); setDrawer(!drawer); }}><i dangerouslySetInnerHTML={{ __html: ICO.list }} />Pendientes{openTotal ? <span className="badge">{openTotal}</span> : null}</button>}
        <button className={mview === 'elem' ? 'on' : ''} disabled={!sel} onClick={() => sel && setMview('elem')} style={{ opacity: sel ? 1 : .4 }}><i dangerouslySetInnerHTML={{ __html: ICO.elem }} />Ítem</button>
        {staff && <button onClick={() => plan && setReport(true)}><i dangerouslySetInnerHTML={{ __html: ICO.doc }} />Reporte</button>}
      </nav>

      {newAt && <NewElementModal elements={data.elements} members={data.members} sinUbicar={sinUbicar} tipoInicial={tipoNuevo} padre={padreNuevo} onCancel={() => { setNewAt(null); setTipoNuevo(null); setPadreNuevo(null); }} onOk={createElement} />}
      {report && <ReportModal hasSel={!!sel} onCancel={() => setReport(false)} onOk={generateReport} />}
      {repView && <ReportView {...repView} proyecto={data.project.name} onClose={() => setRepView(null)} />}
      {editPlan && <EditPlanModal plan={editPlan} onClose={() => setEditPlan(null)} onChanged={load} onSustituir={(file) => { setEditPlan(null); uploadPlan(file, editPlan.name, editPlan.id); }} />}
      {pendiente && <SubirPlanoModal pendiente={pendiente} ocupado={uploading} onConfirmar={confirmarPlano} onClose={() => setPendiente(null)} />}
      {planos && (
        <PlanosModal plans={data.plans} elements={data.elements} planId={planId} staff={staff} uploading={uploading}
          onElegir={(pid) => { setPlanId(pid); cerrarEl(); setPlanos(false); }}
          onSubir={(f) => { setPlanos(false); uploadPlan(f); }}
          onEditar={(p) => { setPlanos(false); setEditPlan(p); }}
          onClose={() => setPlanos(false)} />
      )}
    </div>
  );
}

const ICO = {
  casa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/></svg>',
  capas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  tabla: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 10v9"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/></svg>',
  elem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>',
  imprimir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
  compartir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
};

// La obra entera en una lista: qué es cada ítem, en qué etapa va y qué le falta.
//
// El plano contesta dónde está cada cosa; para saber cómo van hay que picar pin
// por pin. Aquí se ve de un jalón, y arriba el embudo dice cuántos ítems han
// pasado cada etapa: ahí es donde se nota que catorce se atoraron en flete.
function Lista({ items, etapas, plans, sel, onIr }) {
  const nombrePlan = (id) => (plans.find((p) => p.id === id) || {}).name || '';
  // Cuántos ítems llevan cumplida cada etapa. Como el camino no tiene huecos,
  // basta con comparar contra el número de etapas que lleva cada uno.
  const embudo = etapas.map((x, i) => ({ ...x, n: items.filter((e) => (e.n_etapas || 0) > i).length }));
  const orden = [...items].sort((a, b) => (a.code || '').localeCompare(b.code || '', 'es', { numeric: true }) || a.name.localeCompare(b.name, 'es'));

  return (
    <div className="lista">
      {!!etapas.length && (
        <div className="embudo">
          {embudo.map((x) => (
            <div key={x.clave} className={'ecol' + (x.abre_punchlist ? ' bisagra' : '')}>
              <b>{x.n}</b>
              <span>{x.nombre}</span>
              <i style={{ width: items.length ? `${(x.n / items.length) * 100}%` : 0 }} />
            </div>
          ))}
          <div className="ecol total"><b>{items.length}</b><span>ítems</span></div>
        </div>
      )}
      {!orden.length && <div className="empty"><h3>Sin ítems</h3>Ninguno cumple con los filtros de arriba.</div>}
      {orden.map((e) => {
        const av = avance(e, etapas);
        const abiertos = (e.n_pend || 0) + (e.n_proc || 0);
        const etapaActual = av.hechas >= av.total ? 'Entregado' : (etapas[av.hechas] || {}).nombre || '—';
        return (
          <button key={e.id} className={'lrow' + (e.id === sel ? ' on' : '')} onClick={() => onIr(e)}>
            <i className="tipo" style={{ background: colorTipo(e.type || 'Otro') }} title={e.type} />
            <div className="id">
              <div className="t">{e.code ? <b>{e.code}</b> : null} {e.name}</div>
              <div className="s">{e.type || 'Otro'} · {nombrePlan(e.plan_id)}{e.resp ? ` · ${e.resp}` : ''}</div>
            </div>
            <div className="pipe" title={`${av.hechas} de ${av.total} etapas`}>
              {etapas.map((x, i) => (
                <i key={x.clave} className={(i < av.hechas ? 'ok' : '') + (x.abre_punchlist ? ' bisagra' : '')} />
              ))}
            </div>
            <div className="pct">
              <span>{av.pct}%</span>
              <small>{etapaActual}</small>
            </div>
            <div className="pend">
              {(e.fase || 'produccion') === 'punchlist'
                ? (e.n_total
                    ? <span className={'pill ' + (e.n_pend ? 'pend' : e.n_proc ? 'proc' : 'ok')}>{abiertos ? `${abiertos} abierto${abiertos > 1 ? 's' : ''}` : 'Todo resuelto'}</span>
                    : <span className="pill gen">Sin pendientes</span>)
                : <span className="pill gen">En producción</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function NewElementModal({ elements, members, sinUbicar = [], tipoInicial = null, padre = null, onCancel, onOk }) {
  // El código se propone por obra según el tipo (MW-, PT-, FX-), sin contar
  // los prefijos viejos y sin rellenar huecos. Es una propuesta: si el taller
  // quiere otro a mano, puede; la base avisa si choca. En cuanto la persona
  // toca la clave, cambiar de tipo ya no se la pisa.
  const arranca = tipoInicial || 'Mueble';
  const [f, setF] = useState({ code: siguienteCodigo(elements, arranca), type: arranca, name: '', resp: '', item_id: '', descripcion: '' });
  const [claveTocada, setClaveTocada] = useState(false);
  const cambiaTipo = (type) => setF({ ...f, type, code: claveTocada ? f.code : siguienteCodigo(elements, type) });
  const resps = [...new Set(members.map((m) => m.company || m.name).filter(Boolean))];

  /* «Ítems sin ubicar»: lo vendido en dash101 que todavía no tiene pin.
   * Escoger uno llena el nombre y amarra la pieza a ese ítem, para que la
   * cuenta de cuántas faltan baje sola. No es obligatorio: una obra tiene
   * piezas que nadie cotizó, y ésas se siguen levantando a mano. */
  const escoger = (item_id) => {
    const it = sinUbicar.find((x) => x.id === item_id);
    if (!it) { setF({ ...f, item_id: '' }); return; }
    setF({ ...f, item_id, name: f.name.trim() || it.nombre });
  };

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onOk(f); }}>
        <div>
          <div className="eyebrow">{padre ? 'Nuevo subítem' : enRevision(f.type) ? 'Nuevo requerimiento' : 'Nuevo ítem'}</div>
          <h2>{padre ? `Complemento de ${padre.code || padre.name}` : 'Ubicado en el plano'}</h2>
        </div>
        {/* Un subítem (0.56.0): nace como requerimiento colgado de la pieza
            padre y de su ítem, junto a ella en el plano. Se dice antes de
            guardar para que quien lo levanta sepa de qué cuelga. */}
        {padre && (
          <p className="muted aviso-rq" data-subitem="aviso">Es un trabajo o servicio complementario de <b>{padre.code} · {padre.name}</b>. Nace como requerimiento ligado a ese ítem, junto a él en el plano; lo puedes reubicar después.</p>
        )}
        {/* Se dice ANTES de guardar, no después: quien lo levanta tiene que
            saber que esto no se va a fabricar todavía. */}
        {enRevision(f.type) && (
          <p className="muted aviso-rq">Queda <b>en revisión</b> y <b>fuera de alcance</b>: sale en el plano y en la lista cuando ves «Fuera de alcance» o «Todos», si la obra está ligada a un proyecto cae en el borrador de requerimientos de quote101, y no entra a producción hasta que se cotice y se autorice. Al aprobarse la cotización, entra al alcance con su tipo y su precio.</p>
        )}
        {sinUbicar.length > 0 && !enRevision(f.type) && (
          <div className="field">
            <label>¿Es uno de los vendidos? <small className="muted">ítems sin ubicar</small></label>
            <select value={f.item_id || ''} onChange={(e) => escoger(e.target.value)}>
              <option value="">No — es una pieza de obra</option>
              {sinUbicar.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre} — faltan {i.faltan} de {i.cantidad}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="two">
          <div className="field"><label>Clave <small className="muted">{enRevision(f.type) ? 'provisional: la definitiva se escoge en quote101 según el tipo de trabajo' : 'propuesta por obra'}</small></label><input value={f.code} onChange={(e) => { setClaveTocada(true); setF({ ...f, code: e.target.value }); }} /></div>
          <div className="field"><label>Tipo</label><select value={f.type} onChange={(e) => cambiaTipo(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div className="field"><label>Nombre</label><input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Cocina — isla central" /></div>
        {/* Mike, 6-oct: «agregar un campo de descripción en la ventana de
            Nuevo requerimiento, donde se escribe lo que aparecerá como
            descripción en quote (…) En caso de que no se llene en quell, se
            puede llenar en quote.» El nombre y la descripción se escriben
            aquí; la clave definitiva se escoge en quote101. */}
        {enRevision(f.type) && (
          <div className="field"><label>Descripción <small className="muted">la que sale en quote101; si la dejas vacía, se llena allá</small></label>
            <textarea data-campo="descripcion" rows={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Librero de MDF laqueado blanco, 2.40 × 3.10 m, con iluminación LED" /></div>
        )}
        <div className="field"><label>Responsable</label><input list="resps" value={f.resp} onChange={(e) => setF({ ...f, resp: e.target.value })} placeholder="Taller 101 / contratista" /><datalist id="resps">{resps.map((r) => <option key={r} value={r} />)}</datalist></div>
        <div className="acts"><button type="button" className="btn" onClick={onCancel}>Cancelar</button><button className="btn primary">Crear ítem</button></div>
      </form>
    </div>
  );
}

function ReportModal({ hasSel, onCancel, onOk }) {
  const [o, setO] = useState({ type: 'punch', scope: hasSel ? 'elem' : 'plano', status: 'abiertos', from: '', to: '', dest: '' });
  const Seg = ({ k, opts }) => <div className="seg">{opts.map(([v, l]) => <button key={v} type="button" className={o[k] === v ? 'on' : ''} onClick={() => setO({ ...o, [k]: v })}>{l}</button>)}</div>;
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onOk(o); }}>
        <div><div className="eyebrow">Reporte</div><h2>¿Qué reporte necesitas?</h2></div>
        <div className="field"><label>Tipo</label><Seg k="type" opts={[['bitacora', 'Bitácora'], ['punch', 'Punchlist'], ['ambos', 'Ambos']]} /></div>
        <div className="field"><label>Alcance</label><Seg k="scope" opts={[...(hasSel ? [['elem', 'Este ítem']] : []), ['plano', 'Este plano'], ['proj', 'Todo el proyecto']]} /></div>
        {o.type !== 'punch' && <div className="two"><div className="field"><label>Desde</label><input type="date" value={o.from} onChange={(e) => setO({ ...o, from: e.target.value })} /></div><div className="field"><label>Hasta</label><input type="date" value={o.to} onChange={(e) => setO({ ...o, to: e.target.value })} /></div></div>}
        {o.type !== 'bitacora' && <div className="field"><label>Punchlist: incluir</label><Seg k="status" opts={[['abiertos', 'Sólo abiertos'], ['todos', 'Todos']]} /></div>}
        <div className="field"><label>Para (nombre del destinatario, opcional)</label><input value={o.dest} onChange={(e) => setO({ ...o, dest: e.target.value })} placeholder="Arq. Rodríguez — Constructora" /></div>
        <div className="acts"><button type="button" className="btn" onClick={onCancel}>Cancelar</button><button className="btn primary">Generar</button></div>
      </form>
    </div>
  );
}

// Los planos de la obra, en una hoja.
//
// Un proyecto casi nunca es un solo plano: es una planta por piso, o una zona
// por frente de trabajo. Se ven de uno en uno —dos plantas encimadas no se
// leen— así que esto es un selector, no una galería. Y es el único lugar desde
// donde se sube el segundo plano: en el celular no hay barra lateral, y sin
// esta hoja el proyecto se quedaba con el primero para siempre.
function PlanosModal({ plans, elements, planId, staff, uploading, onElegir, onSubir, onEditar, onClose }) {
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal hoja">
        <h2>Planos <small className="muted">{plans.length}</small></h2>
        <div className="planlist">
          {!plans.length && <div className="empty">Este proyecto todavía no tiene planos.</div>}
          {plans.map((p) => {
            const n = elements.filter((e) => e.plan_id === p.id).length;
            return (
              <div key={p.id} className={'planrow' + (p.id === planId ? ' on' : '')}>
                <button className="cual" onClick={() => onElegir(p.id)}>
                  <div className="t">{p.name}</div>
                  <div className="s">{n} {n === 1 ? 'ítem' : 'ítems'}{p.file_name ? ` · ${p.file_name}` : ''}</div>
                </button>
                {archivoDelPlano(p) && <BotonCompartir url={fileUrl(archivoDelPlano(p).llave)} nombre={archivoDelPlano(p).nombre} className="btn sm">⇪</BotonCompartir>}
                {staff && <button className="btn sm" onClick={() => onEditar(p)} title="Renombrar o borrar">Editar</button>}
              </div>
            );
          })}
        </div>
        {staff && (
          <label className="btn primary block">
            {uploading ? 'Procesando…' : '+ Subir otro plano (PDF o imagen)'}
            <input type="file" accept="application/pdf,image/*" hidden disabled={uploading}
              onChange={(e) => e.target.files[0] && onSubir(e.target.files[0])} />
          </label>
        )}
        <div className="acts"><button className="btn" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  );
}

/* Vista previa de un plano antes de subirlo: se ve cómo quedó rasterizado y
 * se puede girar de 90 en 90 (Mike, 2-oct: «a veces el PDF viene vertical»).
 * La vista previa se gira con CSS, barato; el giro de verdad lo hace
 * rasterizePlan al confirmar, y se guarda con el plano. */
export function SubirPlanoModal({ pendiente, ocupado, onConfirmar, onClose }) {
  const [giro, setGiro] = useState(0);
  const [vista, setVista] = useState(null);
  const [falla, setFalla] = useState('');
  useEffect(() => {
    let url = null, vivo = true;
    setVista(null); setFalla(''); setGiro(0);
    rasterizePlan(pendiente.file, 0)
      .then(({ blob, width, height }) => { if (!vivo) return; url = URL.createObjectURL(blob); setVista({ url, width, height }); })
      .catch((e) => { if (vivo) setFalla(e.message || 'No se pudo leer el archivo.'); });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [pendiente.file]);
  const deLado = giro === 90 || giro === 270;
  const girar = (d) => setGiro((g) => (g + d + 360) % 360);
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && !ocupado && onClose()}>
      <div className="modal hoja subir-plano" data-subir-plano={pendiente.sustituir ? 'sustituir' : 'nuevo'}>
        <h2>{pendiente.sustituir ? 'Sustituir el plano' : 'Subir plano'} <small className="muted">{pendiente.file.name}</small></h2>
        {pendiente.sustituir && (
          <p className="muted">Es el mismo plano con una hoja nueva: los ítems se quedan donde están. La hoja anterior queda guardada como versión.</p>
        )}
        <div className="vista-plano">
          {falla ? <div className="empty">{falla}</div>
            : !vista ? <div className="center"><div className="spin" /></div>
              : <img src={vista.url} alt="Vista previa del plano" style={{ transform: `rotate(${giro}deg)`, maxWidth: deLado ? '60vh' : '100%', maxHeight: deLado ? '100%' : '60vh' }} />}
        </div>
        <div className="acts" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn" disabled={!vista || ocupado} onClick={() => girar(-90)} title="Girar a la izquierda">↺ Girar</button>
            <button type="button" className="btn" disabled={!vista || ocupado} onClick={() => girar(90)} title="Girar a la derecha">↻ Girar</button>
            {giro !== 0 && <span className="muted" style={{ alignSelf: 'center', fontSize: 12 }}>{giro}°</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn" disabled={ocupado} onClick={onClose}>Cancelar</button>
            <button type="button" className="btn primary" disabled={!vista || ocupado} onClick={() => onConfirmar(pendiente, giro)}>
              {ocupado ? 'Subiendo…' : pendiente.sustituir ? 'Sustituir' : 'Subir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditPlanModal({ plan, onClose, onChanged, onSustituir }) {
  const { toast } = useApp();
  const [name, setName] = useState(plan.name);
  const [confirm, setConfirm] = useState(false);
  const versiones = plan.versiones || [];
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={async (e) => { e.preventDefault(); await api.patch(`/plans/${plan.id}`, { name }).catch((x) => toast(x.message)); onChanged(); onClose(); }}>
        <h2>Plano {versiones.length > 0 && <small className="muted">versión {versiones.length + 1}</small>}</h2>
        <div className="field"><label>Nombre</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        {/* Sustituir (0029): otra hoja para el mismo plano, con sus ítems donde
            están. Mike, 2-oct: «subir y sustituir el que está para actualizar
            versiones». */}
        <label className="btn block" data-sustituir-plano={plan.id}>
          Sustituir el plano por una versión nueva (PDF o imagen)…
          <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => e.target.files[0] && onSustituir(e.target.files[0])} />
        </label>
        {versiones.length > 0 && (
          <div className="field">
            <label>Versiones anteriores</label>
            <ul className="versiones-plano">
              {[...versiones].reverse().map((v, i) => (
                <li key={versiones.length - i}>
                  <span>v{versiones.length - i} · {v.file_name || 'sin nombre'} · {fmtD(v.at)}{v.quien ? ` · ${v.quien}` : ''}</span>
                  {v.source_key && <a className="btn sm" href={fileUrl(v.source_key)} target="_blank" rel="noreferrer">Bajar</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!confirm ? <button type="button" className="btn danger" onClick={() => setConfirm(true)}>Borrar plano y todos sus ítems…</button>
          : <button type="button" className="btn danger" onClick={async () => { await api.del(`/plans/${plan.id}`).catch((x) => toast(x.message)); onChanged(); onClose(); }}>Confirmar borrado definitivo</button>}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary">Guardar</button></div>
      </form>
    </div>
  );
}

/* El reporte en pantalla, con su PDF listo para mandar (Mike, 9-oct-2026:
 * «desde el iPhone y Android quiero poder compartir directo a alguna app
 * tipo WhatsApp el PDF ya listo»). El PDF se arma en cuanto se abre
 * (`reportePdf.js` dice por qué) y el botón dice cuánto lleva; ya listo,
 * «Compartir PDF» abre la hoja de compartir del teléfono, o «Descargar PDF»
 * donde no la hay (la computadora). Imprimir sigue ahí. */
function ReportView({ html, title, proyecto, onClose }) {
  const { toast } = useApp();
  const [pdf, setPdf] = useState(null);       // { archivo, hoja }
  const [avance, setAvance] = useState('');
  const [fallo, setFallo] = useState(null);
  const [mandando, setMandando] = useState(false);
  useEffect(() => {
    let vivo = true;
    setPdf(null); setFallo(null); setAvance('');
    armarPdf(html, REPORT_CSS, { onAvance: (i, n) => vivo && setAvance(`${i}/${n}`) })
      .then((blob) => {
        if (!vivo) return;
        const archivo = new File([blob], nombreDelReporte(title, proyecto), { type: 'application/pdf' });
        setPdf({ archivo, hoja: puedeCompartir(archivo) });
      })
      .catch((e) => vivo && setFallo(e?.message || 'No se pudo armar el PDF.'));
    return () => { vivo = false; };
  }, [html]);
  async function mandar() {
    if (!pdf || mandando) return;
    setMandando(true);
    try {
      const como = await entregar(pdf.archivo);
      if (como === 'descarga') toast('Se guardó el PDF.');
    } catch (e) { toast(e?.message || 'No se pudo compartir el PDF.'); }
    finally { setMandando(false); }
  }
  return (
    <div className="report">
      <style>{REPORT_CSS}</style>
      <div className="rbar">
        <button className="btn sm" onClick={onClose}>← Volver</button>
        <b className="rtitulo">{title}</b>
        <div className="spacer" />
        <button className="btn sm" onClick={() => window.print()} title="Imprimir o guardar como PDF desde el navegador">Imprimir</button>
        <button className="btn primary sm" data-pdf-reporte disabled={!pdf || mandando} onClick={mandar} title={fallo || ''}>
          {fallo ? 'PDF no disponible' : !pdf ? `Armando PDF…${avance ? ' ' + avance : ''}` : mandando ? 'Abriendo…' : pdf.hoja ? 'Compartir PDF' : 'Descargar PDF'}
        </button>
      </div>
      <div className="sheet" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
