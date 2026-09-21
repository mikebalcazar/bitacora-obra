/* Los archivos del ítem: un plano principal que se anota, y los de soporte.
 *
 * Mike, 21-sep-2026: «necesito en quell un apartado por ítem de
 * documentación. Subir PDF de planos y de anotaciones adicionales. Quiero
 * que ese PDF pueda tener anotaciones (poder anotar desde el cel o la compu
 * cosas encima). Y después poder actualizar ese PDF a una versión nueva, sin
 * borrar la anterior, pero archivarla, o sea que no esté a la vista. Y una
 * opción para ver versiones anteriores por si hay dudas».
 *
 * Y, señalando el recuadro azul del encabezado del ítem: «ahí hay que poner
 * el botón de archivos de ítem, y abra en la pantalla principal el plano o
 * foto de pieza y en una barra lateral todos los demás archivos. O sea hay
 * un archivo base que es el plano o imagen sobre la que están las
 * anotaciones del ítem, sería como el principal, y los demás archivos son de
 * soporte. Sólo en el principal se hacen anotaciones».
 *
 * Preguntado con botones el 21-sep, escogió «notas y también rayar encima»:
 * las dos cosas, no una.
 *
 * DÓNDE ESTÁ LA REGLA Y DÓNDE NO
 *
 * Aquí no se decide nada. Cuál es el principal, cuál está archivado, quién
 * puede anotar y qué pasa al subir una versión lo contesta la API (contrato
 * 0.41.0). Esta pantalla pinta lo que le mandan y manda lo que se hizo. Si
 * la regla se copiara aquí, el día que cambie habría dos versiones de ella
 * y una se quedaría atrás sin que nadie se entere.
 *
 * Las marcas van RELATIVAS, de 0 a 1 sobre la página. El mismo plano se ve a
 * 390 puntos de ancho en el celular y a 1200 en la compu: una marca en
 * píxeles caería sobre otra pieza en la otra pantalla. La capa de marcas es
 * un SVG con viewBox 0 0 1 1 puesto exactamente encima de la hoja, así que
 * la conversión es la que hace el navegador y no una cuenta escrita a mano.
 */
import React, { useEffect, useRef, useState } from 'react';
import { api, leer, fileUrl, fmtD } from './api.js';
import { useApp } from './App.jsx';
import { pdfjs, esPdf } from './pdf.js';

const idOp = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const esImagen = (d) => /^image\//.test(d?.mime || '') || /\.(png|jpe?g|webp|gif)$/i.test(d?.nombre || '');

/** Cuántas páginas trae un PDF. Se cuenta aquí, al subirlo, y viaja con el
 *  archivo: contarlo en el servidor obligaría a la API a cargar pdf.js para
 *  algo que el navegador ya tiene abierto. Si no se puede, va 1 y la hoja se
 *  las arregla. */
async function cuentaPaginas(file) {
  if (!esPdf(file.name)) return 1;
  try {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = doc.numPages;
    doc.destroy?.();
    return n;
  } catch { return 1; }
}

/* ── el botón del encabezado ─────────────────────────────────────────────
 *
 * Dice cuántos archivos tiene el ítem antes de abrir nada: sin ese número,
 * hay que abrir el visor para descubrir que está vacío, y eso se hace una
 * vez por ítem hasta que uno deja de picarle. */
export default function Docs({ e, staff }) {
  const [d, setD] = useState(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = () => leer(`/elements/${e.id}/docs`).then(setD).catch(() => setD(null));
  useEffect(() => { setD(null); cargar(); }, [e.id]);

  const n = d ? (d.principal ? 1 : 0) + (d.soporte?.length || 0) : 0;
  return (
    <>
      <button className="btn sm docs-btn" onClick={() => setAbierto(true)}>
        <span className="ico" aria-hidden>▤</span>
        Archivos del ítem
        <span className="n">{d ? n : '…'}</span>
        {d && !d.principal && staff && <span className="falta" title="Este ítem no tiene plano principal">sin plano</span>}
      </button>
      {abierto && <Visor e={e} staff={staff} inicial={d} onCerrar={() => { setAbierto(false); cargar(); }} />}
    </>
  );
}

/* ── el visor ────────────────────────────────────────────────────────────
 *
 * Pantalla completa: la hoja grande en el centro y los demás archivos en una
 * barra al lado, como lo pidió Mike. En el celular la barra se recorre en
 * horizontal arriba de la hoja: una columna de 260 puntos al lado dejaría el
 * plano en 130, que es no verlo. */
function Visor({ e, staff, inicial, onCerrar }) {
  const { toast } = useApp();
  const [d, setD] = useState(inicial);
  const [viendo, setViendo] = useState(null);   // id del que se ve; null = el principal
  const [marcas, setMarcas] = useState([]);
  const [modo, setModo] = useState(null);       // null | 'nota' | 'trazo'
  const [versiones, setVersiones] = useState(null);
  const [subiendo, setSubiendo] = useState(null); // 'principal' | 'soporte' | 'version'
  const [busy, setBusy] = useState(false);

  const cargar = async () => {
    const r = await leer(`/elements/${e.id}/docs`).catch((x) => { toast(x.message); return null; });
    if (r) { setD(r); setMarcas(r.marcas || []); }
  };
  useEffect(() => { cargar(); }, [e.id]);

  const principal = d?.principal || null;
  const soporte = d?.soporte || [];
  const archivada = versiones?.lista?.find((v) => v.id === viendo) || null;
  const activo = viendo
    ? soporte.find((s) => s.id === viendo) || archivada || principal
    : principal;
  // Sólo se anota el principal vivo. Es textual de Mike, y además la API lo
  // rechaza: pintar el botón donde no se puede sería prometer y no cumplir.
  const anotable = !!activo && !!principal && activo.id === principal.id && staff;
  useEffect(() => { if (!anotable) setModo(null); }, [anotable]);

  // Las marcas son de la versión que se está viendo. Una archivada conserva
  // las suyas: es el registro de lo que se dijo ese día.
  useEffect(() => {
    let vivo = true;
    if (!activo) { setMarcas([]); return; }
    if (principal && activo.id === principal.id) { setMarcas(d?.marcas || []); return; }
    if (activo.rol !== 'principal') { setMarcas([]); return; }
    api.get(`/docs/${activo.id}/marcas`).then((r) => { if (vivo) setMarcas(r.marcas || []); }).catch(() => {});
    return () => { vivo = false; };
  }, [activo?.id, d]);

  async function verVersiones() {
    if (!principal) return;
    if (versiones) { setVersiones(null); return; }
    try {
      const r = await api.get(`/docs/${principal.id}/versiones`);
      setVersiones({ lista: r.versiones || [] });
    } catch (x) { toast(x.message); }
  }

  async function subir(file, { rol, copiar = false, sobre = null }) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('op_id', idOp());
      fd.append('nombre', file.name);
      fd.append('paginas', String(await cuentaPaginas(file)));
      if (sobre) { if (copiar) fd.append('copiar_marcas', '1'); }
      else fd.append('rol', rol);
      const r = sobre ? await api.form(`/docs/${sobre}/version`, fd) : await api.form(`/elements/${e.id}/docs`, fd);
      setSubiendo(null);
      setVersiones(null);
      setViendo(null);
      await cargar();
      if (sobre) toast(r.copiadas ? `Versión ${r.doc.version}. Se copiaron ${r.copiadas} marcas.` : `Versión ${r.doc.version}. La anterior quedó archivada.`);
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }

  async function anota(cuerpo) {
    if (!anotable) return;
    try {
      const r = await api.post(`/docs/${principal.id}/marcas`, { ...cuerpo, op_id: idOp() });
      setMarcas(r.marcas || []);
      setD((v) => (v ? { ...v, marcas: r.marcas || [] } : v));
    } catch (x) { toast(x.message); }
  }

  async function borraMarca(id) {
    try {
      const r = await api.post(`/marcas/${id}/borrar`, { op_id: idOp() });
      setMarcas(r.marcas || []);
      setD((v) => (v ? { ...v, marcas: r.marcas || [] } : v));
    } catch (x) { toast(x.message); }
  }

  async function archiva(doc) {
    if (!confirm(`¿Quitar «${doc.nombre}» de la vista? No se borra: se archiva y se puede volver a consultar.`)) return;
    try {
      await api.post(`/docs/${doc.id}/archivar`, { op_id: idOp() });
      if (viendo === doc.id) setViendo(null);
      await cargar();
    } catch (x) { toast(x.message); }
  }

  return (
    <div className="visor">
      <div className="visor-top">
        <button className="btn sm" onClick={onCerrar} title="Cerrar">←</button>
        <div className="quien">
          <b>{e.code || e.name}</b>
          <span>{activo ? activo.nombre : 'Sin documentación'}</span>
        </div>
        <div className="spacer" />
        {anotable && (
          <div className="seg anotar">
            <button className={modo === 'nota' ? 'on' : ''} onClick={() => setModo(modo === 'nota' ? null : 'nota')}>Nota</button>
            <button className={modo === 'trazo' ? 'on' : ''} onClick={() => setModo(modo === 'trazo' ? null : 'trazo')}>Rayar</button>
          </div>
        )}
      </div>

      <div className="visor-cuerpo">
        <div className="visor-hoja">
          {!activo && (
            <div className="empty">
              <h3>Este ítem todavía no tiene documentación</h3>
              {staff ? 'Sube el plano o la foto de la pieza: sobre ése se anota. Los demás archivos van de soporte.' : 'Cuando el supervisor suba el plano, aparece aquí.'}
            </div>
          )}
          {activo && (
            <Hoja
              doc={activo}
              marcas={marcas}
              modo={anotable ? modo : null}
              onNota={(x, y, pagina) => {
                const texto = prompt('¿Qué dice la nota?');
                if (texto && texto.trim()) anota({ tipo: 'nota', x, y, pagina, texto: texto.trim() });
              }}
              onTrazo={(puntos, pagina) => anota({ tipo: 'trazo', trazo: puntos, pagina })}
              onBorrar={anotable ? borraMarca : null}
            />
          )}
          {activo && activo.archivado_at && (
            <div className="avisoarch">Versión {activo.version}, archivada el {fmtD(activo.archivado_at)}. Se consulta, no se anota.</div>
          )}
        </div>

        <div className="visor-lado">
          {principal && (
            <>
              <div className="rotulo">El principal</div>
              <Tarjeta doc={principal} on={!viendo} onVer={() => setViendo(null)} nota="Aquí van las anotaciones" />
              {staff && <button className="btn sm block" onClick={() => setSubiendo('version')}>Subir versión nueva</button>}
              <button className="btn sm block" onClick={verVersiones}>
                {versiones ? 'Ocultar versiones anteriores' : 'Ver versiones anteriores'}
              </button>
              {versiones && (
                <div className="versiones">
                  {versiones.lista.length <= 1 && <div className="nada">Ésta es la única versión.</div>}
                  {versiones.lista.filter((v) => v.archivado_at).map((v) => (
                    <button key={v.id} className={'vrow' + (viendo === v.id ? ' on' : '')} onClick={() => setViendo(v.id)}>
                      <b>v{v.version}</b>
                      <span>{fmtD(v.created_at)}{v.subio ? ` · ${v.subio}` : ''}</span>
                      <small>{v.n_marcas ? `${v.n_marcas} marcas` : 'sin marcas'}</small>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {!principal && staff && (
            <button className="btn primary sm block" onClick={() => setSubiendo('principal')}>Subir el plano principal</button>
          )}

          <div className="rotulo">De soporte <span className="n">{soporte.length}</span></div>
          {!soporte.length && <div className="nada">Nada de soporte todavía.</div>}
          {soporte.map((s) => (
            <Tarjeta key={s.id} doc={s} on={viendo === s.id} onVer={() => setViendo(s.id)}
              onArchivar={staff ? () => archiva(s) : null} />
          ))}
          {staff && <button className="btn sm block" onClick={() => setSubiendo('soporte')}>Agregar archivo de soporte</button>}
        </div>
      </div>

      {subiendo && (
        <Subir
          que={subiendo}
          busy={busy}
          principal={principal}
          onCerrar={() => setSubiendo(null)}
          onSubir={(file, copiar) => subir(file, {
            rol: subiendo === 'soporte' ? 'soporte' : 'principal',
            copiar,
            sobre: subiendo === 'version' ? principal.id : null,
          })}
        />
      )}
    </div>
  );
}

/** Un archivo en la barra lateral. */
function Tarjeta({ doc, on, onVer, onArchivar, nota }) {
  return (
    <div className={'dcard' + (on ? ' on' : '')}>
      <button className="cual" onClick={onVer}>
        <div className="t">{doc.nombre}</div>
        <div className="s">
          {doc.rol === 'principal' ? `v${doc.version} · ` : ''}{kb(doc.bytes || 0)}
          {doc.paginas > 1 ? ` · ${doc.paginas} págs.` : ''}
          {doc.subio ? ` · ${doc.subio}` : ''}
        </div>
        {nota && <div className="s nota">{nota}</div>}
      </button>
      <a className="btn sm" href={fileUrl(doc.r2_key)} target="_blank" rel="noreferrer" title="Abrir el archivo aparte">↗</a>
      {onArchivar && <button className="btn sm" onClick={onArchivar} title="Quitar de la vista">✕</button>}
    </div>
  );
}

/* ── la hoja y su capa de marcas ────────────────────────────────────────── */

function Hoja({ doc, marcas, modo, onNota, onTrazo, onBorrar }) {
  const caja = useRef(null);
  const lienzo = useRef(null);
  const [pagina, setPagina] = useState(1);
  /* Los puntos del trazo se juntan en un ref, no en el estado.
   *
   * Un dedo sobre el plano dispara `pointermove` muchas veces más rápido de
   * lo que React alcanza a confirmar un `setState`, así que si el siguiente
   * movimiento leyera el estado, leería el de hace tres puntos y el trazo
   * saldría con dos. El ref siempre está al día; el estado sólo existe para
   * que se vea la línea mientras se dibuja. */
  const puntos = useRef(null);
  const [trazando, setTrazando] = useState(null);
  const [abierta, setAbierta] = useState(null); // id de la nota abierta

  useEffect(() => { setPagina(1); setAbierta(null); }, [doc.id]);

  const imagen = esImagen(doc);
  const url = fileUrl(doc.r2_key);

  // El PDF se pinta a la anchura que haya, con un tope: un plano de obra a
  // 4000 píxeles de ancho tumba la pestaña en un celular.
  useEffect(() => {
    if (imagen) return;
    let vivo = true, tarea = null, pdf = null;
    (async () => {
      try {
        const lib = await pdfjs();
        pdf = await lib.getDocument({ url, withCredentials: true }).promise;
        if (!vivo) return;
        const pg = await pdf.getPage(Math.min(pagina, pdf.numPages));
        if (!vivo) return;
        const base = pg.getViewport({ scale: 1 });
        const ancho = Math.min(caja.current?.clientWidth || 800, 1600);
        const escala = Math.max(0.1, ancho / base.width);
        const vp = pg.getViewport({ scale: escala });
        const c = lienzo.current;
        if (!c) return;
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        tarea = pg.render({ canvasContext: c.getContext('2d'), viewport: vp });
        await tarea.promise;
      } catch (x) {
        /* Memoria, un PDF que pdf.js no puede: se queda la hoja en blanco en
         * vez de tumbar la pestaña. El archivo sigue abriéndose aparte con la
         * flecha de la barra. */
        if (x?.name !== 'RenderingCancelledException') console.warn('no se pudo pintar el documento', x);
      }
    })();
    return () => { vivo = false; try { tarea?.cancel(); } catch {} pdf?.destroy?.(); };
  }, [doc.id, pagina, imagen]);

  const deLaPagina = marcas.filter((mk) => (mk.pagina || 1) === pagina);

  /* De dónde tocó a coordenada relativa. Se mide contra la hoja pintada y no
   * contra la ventana: si se midiera contra la ventana, la marca se correría
   * con el desplazamiento de la página. */
  function rel(ev) {
    const r = (imagen ? caja.current?.querySelector('img') : lienzo.current)?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
            Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
  }

  function abajo(ev) {
    if (modo !== 'trazo') return;
    const p = rel(ev); if (!p) return;
    try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch {}
    puntos.current = [p];
    setTrazando(puntos.current);
  }
  function mueve(ev) {
    if (modo !== 'trazo' || !puntos.current) return;
    const p = rel(ev); if (!p) return;
    // Un punto cada poco: guardar los cuatrocientos que manda el dedo no
    // dibuja mejor y sí hace un renglón enorme en la base.
    const ult = puntos.current[puntos.current.length - 1];
    if (Math.hypot(p[0] - ult[0], p[1] - ult[1]) < 0.004) return;
    puntos.current = [...puntos.current, p];
    setTrazando(puntos.current);
  }
  function arriba() {
    if (modo !== 'trazo' || !puntos.current) return;
    const hechos = puntos.current;
    puntos.current = null;
    setTrazando(null);
    if (hechos.length >= 2) onTrazo(hechos, pagina);
  }
  function pica(ev) {
    if (modo !== 'nota') return;
    const p = rel(ev); if (!p) return;
    onNota(p[0], p[1], pagina);
  }

  return (
    <div className="docs-hoja" ref={caja}>
      {doc.paginas > 1 && (
        <div className="paginas">
          <button className="btn sm" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>‹</button>
          <span>Página {pagina} de {doc.paginas}</span>
          <button className="btn sm" disabled={pagina >= doc.paginas} onClick={() => setPagina(pagina + 1)}>›</button>
        </div>
      )}
      <div className={'lamina' + (modo ? ' anotando' : '')}>
        {imagen
          ? <img src={url} alt={doc.nombre} />
          : <canvas ref={lienzo} />}
        {/* La capa va encima y ocupa exactamente la hoja. viewBox 0 0 1 1:
            las marcas se guardan de 0 a 1 y se pintan tal cual; el navegador
            hace la conversión, y así no hay una cuenta de píxeles aquí que
            se desincronice con la del servidor. */}
        <svg className="marcas" viewBox="0 0 1 1" preserveAspectRatio="none"
          style={{ pointerEvents: modo ? 'auto' : 'none' }}
          onPointerDown={abajo} onPointerMove={mueve} onPointerUp={arriba} onPointerCancel={arriba} onClick={pica}>
          {deLaPagina.filter((mk) => mk.tipo === 'trazo' && mk.trazo?.length > 1).map((mk) => (
            <polyline key={mk.id} points={mk.trazo.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none" stroke={mk.color || '#E03131'} strokeWidth="2" vectorEffect="non-scaling-stroke"
              strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {trazando && trazando.length > 1 && (
            <polyline points={trazando.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none" stroke="#E03131" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="4 3"
              strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        {/* Las notas no van en el SVG: son texto, y el texto dentro de un
            viewBox estirado sale deformado. Van en puntos por encima, en
            porcentaje, que es la misma coordenada relativa. */}
        {deLaPagina.filter((mk) => mk.tipo === 'nota').map((mk, i) => (
          <button key={mk.id} className={'chinche' + (abierta === mk.id ? ' on' : '')}
            style={{ left: `${mk.x * 100}%`, top: `${mk.y * 100}%` }}
            onClick={(ev) => { ev.stopPropagation(); setAbierta(abierta === mk.id ? null : mk.id); }}>
            {i + 1}
          </button>
        ))}
        {abierta && (() => {
          const mk = deLaPagina.find((x) => x.id === abierta);
          if (!mk) return null;
          return (
            <div className="globo" style={{ left: `${mk.x * 100}%`, top: `${mk.y * 100}%` }}>
              <div className="txt">{mk.texto}</div>
              <div className="pie">
                <span>{mk.quien || ''} · {fmtD(mk.created_at)}</span>
                {onBorrar && <button className="btn sm danger" onClick={() => { setAbierta(null); onBorrar(mk.id); }}>Quitar</button>}
              </div>
            </div>
          );
        })()}
      </div>
      {modo && (
        <div className="comomarcar">
          {modo === 'nota' ? 'Toca el plano donde quieras clavar la nota.' : 'Arrastra el dedo o el ratón encima del plano para rayar.'}
        </div>
      )}
    </div>
  );
}

/* ── subir ───────────────────────────────────────────────────────────────
 *
 * La versión nueva pregunta si se copian las marcas de la anterior, y dice
 * qué pasa con cada respuesta ANTES de escoger. Copiarlas siempre dejaría
 * notas viejas señalando cosas que el plano nuevo ya corrigió; no copiarlas
 * nunca obliga a volver a clavar catorce notas cuando el cambio fue chico. */
function Subir({ que, busy, principal, onCerrar, onSubir }) {
  const [file, setFile] = useState(null);
  const [copiar, setCopiar] = useState(false);
  const titulo = que === 'version' ? 'Versión nueva del plano principal'
    : que === 'principal' ? 'El plano principal del ítem' : 'Archivo de soporte';

  return (
    <div className="ov" onClick={(ev) => ev.target === ev.currentTarget && onCerrar()}>
      <div className="modal">
        <h2>{titulo}</h2>
        {que === 'principal' && <p className="muted">Es el plano o la foto de la pieza: sobre éste se anota. Sólo puede haber uno a la vista.</p>}
        {que === 'soporte' && <p className="muted">Va al lado, para consultar. Los archivos de soporte no se anotan.</p>}
        {que === 'version' && (
          <p className="muted">
            Sustituye a <b>v{principal?.version}</b> en la vista. La anterior <b>no se borra</b>: queda archivada y se consulta
            en «Ver versiones anteriores».
          </p>
        )}
        <input type="file" accept=".pdf,image/*" onChange={(ev) => setFile(ev.target.files?.[0] || null)} />
        {que === 'version' && (
          <>
            <div className="seg">
              <button className={copiar ? '' : 'on'} onClick={() => setCopiar(false)}>Empezar limpio</button>
              <button className={copiar ? 'on' : ''} onClick={() => setCopiar(true)}>Traer las marcas</button>
            </div>
            <p className="muted">
              {copiar
                ? 'Las notas y los trazos de la versión anterior se copian a la nueva, en el mismo lugar. Sirve cuando el cambio fue chico; si el dibujo cambió, van a quedar señalando a otro lado.'
                : 'La versión nueva empieza sin marcas. Las de la anterior se quedan con ella y se pueden consultar cuando haga falta.'}
            </p>
          </>
        )}
        <div className="acts">
          <button className="btn" onClick={onCerrar} disabled={busy}>Cancelar</button>
          <button className="btn primary" disabled={!file || busy} onClick={() => onSubir(file, copiar)}>
            {busy ? 'Subiendo…' : 'Subir'}
          </button>
        </div>
      </div>
    </div>
  );
}
