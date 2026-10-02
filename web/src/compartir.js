/* Compartir una copia de un archivo (Mike, 2-oct-2026: «los documentos o
 * fotos que se suban —fotos de la bitácora, pdf, planos o documentos de
 * soporte— tengan una opción de compartir para enviar una copia del
 * archivo»).
 *
 * Una copia, no una liga: la liga de un archivo lleva la sesión de quien la
 * abre y a otra persona no le sirve. Así que se baja el archivo y:
 *
 *   · en el celular, si el navegador sabe compartir ARCHIVOS, se abre la hoja
 *     de compartir del sistema con el archivo adentro (WhatsApp, correo, lo
 *     que haya);
 *   · si no (la mayoría de los navegadores de escritorio, o un celular
 *     viejo), se guarda como descarga con su nombre, que es la copia para
 *     adjuntarla donde sea.
 *
 * Lo que se puede medir sin navegador vive en funciones puras: cómo se
 * decide y cómo se nombra. Lo demás usa el navegador. */

/** `hoja` si el navegador puede compartir ese archivo; `descarga` si no. */
export function comoCompartir(nav, archivo) {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return 'descarga';
  try { return nav.canShare({ files: [archivo] }) ? 'hoja' : 'descarga'; } catch { return 'descarga'; }
}

/** El nombre con el que se comparte: el que trae el archivo si lo trae, y si
 *  no, el último tramo de su llave en R2, sin la firma de la sesión. */
export function nombreDelArchivo(nombre, url) {
  if (nombre && String(nombre).trim()) return String(nombre).trim();
  const sinFirma = String(url || '').split('?')[0];
  const tramo = sinFirma.split('/').filter(Boolean).pop() || 'archivo';
  try { return decodeURIComponent(tramo); } catch { return tramo; }
}

/** El archivo con el que se comparte un plano (Mike, 2-oct-2026: «quiero
 *  compartir ese plano (imagen o pdf)»): el original que se subió (PDF o
 *  imagen, `source_key`) con su nombre; si el plano es de antes de que se
 *  guardara el original, la imagen con la que se dibuja (`image_key`).
 *  Devuelve { llave, nombre } o null si el plano no tiene archivo. */
export function archivoDelPlano(plan) {
  if (!plan) return null;
  const base = String(plan.name || 'plano').trim() || 'plano';
  if (plan.source_key) return { llave: plan.source_key, nombre: plan.file_name || base };
  if (plan.image_key) return { llave: plan.image_key, nombre: /\.(png|jpe?g|webp)$/i.test(base) ? base : `${base}.png` };
  return null;
}

/** Baja el archivo con la sesión y lo comparte o lo descarga. Devuelve cómo
 *  se fue (`hoja` | `descarga` | `cancelado`) o lanza con un mensaje para
 *  la pantalla. */
export async function compartirArchivo(url, nombre) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`No se pudo bajar el archivo (${r.status}).`);
  const blob = await r.blob();
  const archivo = new File([blob], nombreDelArchivo(nombre, url), { type: blob.type || 'application/octet-stream' });
  if (comoCompartir(navigator, archivo) === 'hoja') {
    try { await navigator.share({ files: [archivo], title: archivo.name }); return 'hoja'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelado'; /* si no se pudo, se descarga */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo); a.download = archivo.name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'descarga';
}
