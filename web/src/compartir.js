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
import { esAndroid, plugin } from './nativo.js';

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
  return entregar(new File([blob], nombreDelArchivo(nombre, url), { type: blob.type || 'application/octet-stream' }));
}

/* Dentro de la app de Android (9-oct-2026). El navegador interno de Android
 * NO sabe compartir archivos (`navigator.share` no existe ahí) y una
 * descarga tampoco llega a ningún lado. Así que la app guarda el archivo en
 * su caché (plugin `Filesystem`) y abre la hoja de compartir de Android con
 * él (plugin `Share`): WhatsApp, correo, Drive, lo que haya. Los dos plugins
 * se instalan al armar la app (`.github/workflows/apps.yml`). */
const nativos = () => (esAndroid() ? { Fs: plugin('Filesystem'), Share: plugin('Share') } : {});

/** ¿Este aparato abre la hoja de compartir con este archivo? Lo usa la
 *  pantalla para decir «Compartir» o «Descargar» antes de picarle. */
export function puedeCompartir(archivo) {
  const { Fs, Share } = nativos();
  if (Fs && Share) return true;
  return typeof navigator !== 'undefined' && comoCompartir(navigator, archivo) === 'hoja';
}

/** Un `Blob` a base64 sin el prefijo `data:…;base64,` (lo que pide
 *  `Filesystem.writeFile` para guardar binario). */
export function aBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error || new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(blob);
  });
}

/** Comparte un archivo que ya está en la mano: hoja de Android, hoja del
 *  navegador (iPhone, Chrome de Android) o, si no hay, descarga. */
export async function entregar(archivo) {
  const { Fs, Share } = nativos();
  if (Fs && Share) {
    const { uri } = await Fs.writeFile({ path: archivo.name, data: await aBase64(archivo), directory: 'CACHE' });
    try { await Share.share({ title: archivo.name, files: [uri] }); return 'hoja'; }
    catch (e) { if (/cancel/i.test(String(e?.message || e))) return 'cancelado'; throw e; }
  }
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
