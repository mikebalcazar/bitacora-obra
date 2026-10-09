import React, { useState } from 'react';
import { fileUrl, compressImage } from './api.js';
import { imagenesDe, nombreDePegada } from './pegar.js';
import { compartirArchivo } from './compartir.js';
import { Dibujo } from './Dibujo.jsx';

// Las fotos de la aplicación: verlas, elegirlas y ver las que están por subir.
// Viven aquí y no dentro de una pantalla porque son las mismas en todas —la
// bitácora, el punchlist y las dudas— y en obra casi todo se dice con una foto.

export function Photos({ photos, setLb, onDelete }) {
  if (!photos?.length) return null;
  // Al ampliar se guarda la liga y el nombre: el visor los usa para compartir.
  return <div className="photos">{photos.map((p) => <div key={p.id} className="ph" onClick={() => setLb({ url: fileUrl(p.r2_key), nombre: p.file_name })}><img src={fileUrl(p.r2_key)} alt={p.file_name} loading="lazy" />{onDelete && <button className="rm" onClick={(ev) => { ev.stopPropagation(); onDelete(p); }} title="Quitar foto">×</button>}</div>)}</div>;
}

/* El botón de compartir una copia del archivo (Mike, 2-oct-2026). Es el
 * mismo en la foto ampliada y en la tarjeta de un documento: baja el archivo
 * y abre la hoja de compartir del celular, o lo descarga donde no la hay. */
export function BotonCompartir({ url, nombre, className = 'btn sm', children = 'Compartir', etiqueta }) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const ir = async (ev) => {
    ev.stopPropagation(); ev.preventDefault();
    if (ocupado) return;
    setOcupado(true); setAviso('');
    try {
      const como = await compartirArchivo(url, nombre);
      if (como === 'descarga') { setAviso('Se guardó una copia'); setTimeout(() => setAviso(''), 3000); }
    } catch (e) { setAviso(e.message || 'No se pudo compartir'); setTimeout(() => setAviso(''), 4000); }
    finally { setOcupado(false); }
  };
  return (
    <>
      {/* `etiqueta` es para cuando lo que se ve es un ícono: el nombre lo
          lee el lector de pantalla y lo enseña el title. Un botón de texto
          dice «Preparando…» mientras baja; uno de ícono, sólo «…». */}
      <button type="button" className={className} data-compartir onClick={ir} disabled={ocupado} title="Compartir una copia del archivo" aria-label={etiqueta}>
        {ocupado ? (etiqueta ? '…' : 'Preparando…') : children}
      </button>
      {aviso && <span className="aviso-compartir" role="status">{aviso}</span>}
    </>
  );
}

/* La foto ampliada. `lb` es `{ url, nombre }` (o, por si algo viejo manda la
 * liga sola, una cadena). Picar fuera la cierra; el botón no. */
export function Lightbox({ lb, onClose }) {
  if (!lb) return null;
  const url = typeof lb === 'string' ? lb : lb.url;
  const nombre = typeof lb === 'string' ? '' : lb.nombre;
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={url} alt={nombre || ''} />
      <div className="lb-acciones" onClick={(ev) => ev.stopPropagation()}>
        <BotonCompartir url={url} nombre={nombre} className="btn" />
      </div>
    </div>
  );
}

export function usePending() {
  const [pending, setPending] = useState([]);
  const add = async (files) => {
    const out = [];
    for (const f of files) out.push({ file: await compressImage(f), url: URL.createObjectURL(f) });
    setPending((p) => [...p, ...out]);
  };
  const clear = () => { pending.forEach((p) => URL.revokeObjectURL(p.url)); setPending([]); };
  const remove = (i) => setPending((p) => p.filter((_, j) => j !== i));
  return { pending, add, clear, remove };
}
/* Pegar (Ctrl-V) o arrastrar una foto encima de donde se escribe (Mike,
 * 30-sep-2026). Devuelve lo que se le cuelga a la caja y a la zona: al pegar,
 * si el portapapeles trae imágenes se toman ésas y NO se pega su nombre como
 * texto; si trae texto nada más, el pegado sigue igual. Al arrastrar, la zona
 * se marca (`soltando`) mientras algo va encima, y al soltar se quedan sólo
 * las imágenes. Sirve para cualquier compositor; hoy lo usa la bitácora. */
export function usePegarYSoltar(add) {
  const [soltando, setSoltando] = useState(false);
  const toma = (dt) => {
    const fotos = imagenesDe(dt).map((f) => (f.name && f.name !== 'image.png' && f.name !== 'image.jpeg') ? f : new File([f], nombreDePegada(f), { type: f.type }));
    if (fotos.length) add(fotos);
    return fotos.length;
  };
  return {
    soltando,
    onPaste: (ev) => { if (toma(ev.clipboardData)) ev.preventDefault(); },
    onDragOver: (ev) => { if (imagenesDe(ev.dataTransfer).length || Array.from(ev.dataTransfer?.types || []).includes('Files')) { ev.preventDefault(); setSoltando(true); } },
    onDragLeave: () => setSoltando(false),
    onDrop: (ev) => { ev.preventDefault(); setSoltando(false); toma(ev.dataTransfer); },
  };
}
/* Cámara, fotos de la galería y, desde el 9-oct-2026, un dibujo a mano
 * (Mike: «un dibujo bitmap adicional a agregar imagen o tomar foto para
 * anotaciones de la bitácora»). El dibujo sale como una imagen más y entra a
 * la misma fila de por subir, así que sirve en todos los compositores. */
export function PhotoInput({ onFiles, label = 'Foto' }) {
  const [dibujando, setDibujando] = useState(false);
  return (
    <div className="row" style={{ gap: 6 }}>
      <label className="btn sm">Cámara<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} /></label>
      <label className="btn sm">{label}s<input type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} /></label>
      <button type="button" className="btn sm" data-dibujar onClick={() => setDibujando(true)}>Dibujo</button>
      {dibujando && <Dibujo onListo={(f) => onFiles([f])} onCerrar={() => setDibujando(false)} />}
    </div>
  );
}
export function PendingStrip({ pending, remove }) {
  if (!pending.length) return null;
  return <div className="photos">{pending.map((p, i) => <div key={i} className="ph" style={{ cursor: 'default' }}><img src={p.url} alt="" /><button className="rm" onClick={() => remove(i)}>×</button></div>)}</div>;
}
