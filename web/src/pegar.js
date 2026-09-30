/* Fotos que llegan pegadas o arrastradas (Mike, 30-sep-2026: «cuando escribo
 * en la bitácora del ítem, quiero poder agregar fotos pero solo arrastrando o
 * pegando lo que está en el portapapeles»).
 *
 * Esto es lo que se puede medir sin navegador: de un DataTransfer (el del
 * pegado o el del arrastre) sacar SÓLO las imágenes. Lo demás —texto pegado,
 * un PDF arrastrado— se deja pasar como si nada, para no comerse el pegado
 * normal de texto. */
export function imagenesDe(dt) {
  if (!dt) return [];
  const salida = [];
  const items = dt.items ? Array.from(dt.items) : [];
  for (const it of items) {
    if (it.kind !== 'file' || !String(it.type || '').startsWith('image/')) continue;
    const f = it.getAsFile && it.getAsFile();
    if (f) salida.push(f);
  }
  if (salida.length) return salida;
  // Algunos navegadores sólo llenan `files` al arrastrar.
  for (const f of dt.files ? Array.from(dt.files) : []) {
    if (String(f.type || '').startsWith('image/')) salida.push(f);
  }
  return salida;
}
/** Un nombre para la foto pegada, que llega sin él («image.png»). */
export function nombreDePegada(f, cuando = new Date()) {
  const ext = (f.type || 'image/png').split('/')[1].replace('jpeg', 'jpg') || 'png';
  const p = (n) => String(n).padStart(2, '0');
  return `pegada-${cuando.getFullYear()}${p(cuando.getMonth() + 1)}${p(cuando.getDate())}-${p(cuando.getHours())}${p(cuando.getMinutes())}${p(cuando.getSeconds())}.${ext}`;
}
