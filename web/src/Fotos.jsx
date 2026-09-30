import React, { useState } from 'react';
import { fileUrl, compressImage } from './api.js';
import { imagenesDe, nombreDePegada } from './pegar.js';

// Las fotos de la aplicación: verlas, elegirlas y ver las que están por subir.
// Viven aquí y no dentro de una pantalla porque son las mismas en todas —la
// bitácora, el punchlist y las dudas— y en obra casi todo se dice con una foto.

export function Photos({ photos, setLb, onDelete }) {
  if (!photos?.length) return null;
  return <div className="photos">{photos.map((p) => <div key={p.id} className="ph" onClick={() => setLb(fileUrl(p.r2_key))}><img src={fileUrl(p.r2_key)} alt={p.file_name} loading="lazy" />{onDelete && <button className="rm" onClick={(ev) => { ev.stopPropagation(); onDelete(p); }} title="Quitar foto">×</button>}</div>)}</div>;
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
export function PhotoInput({ onFiles, label = 'Foto' }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <label className="btn sm">Cámara<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} /></label>
      <label className="btn sm">{label}s<input type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} /></label>
    </div>
  );
}
export function PendingStrip({ pending, remove }) {
  if (!pending.length) return null;
  return <div className="photos">{pending.map((p, i) => <div key={i} className="ph" style={{ cursor: 'default' }}><img src={p.url} alt="" /><button className="rm" onClick={() => remove(i)}>×</button></div>)}</div>;
}
