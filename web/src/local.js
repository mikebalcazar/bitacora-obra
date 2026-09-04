// Lo que la obra guarda en el propio dispositivo.
//
// La app se usa en sótanos, en niveles altos y en obras sin antena. Si cada
// cosa tuviera que ir y volver del servidor para verse, media jornada no se
// podría registrar. Así que:
//
//   · Lo que se lee queda guardado aquí. Sin señal se muestra lo último que se
//     supo, en vez de una pantalla vacía.
//   · Lo que se escribe entra a una fila de espera, con sus fotos y todo, y se
//     sube solo en cuanto vuelve la señal. El registro se ve al instante, como
//     si hubiera subido, porque para quien lo escribió ya está hecho.
//
// IndexedDB en vez de localStorage porque aquí van fotos: localStorage solo
// guarda texto y se llena con cinco megas.

const BASE = 'bitacora-obra';
const VERSION = 1;
const CACHE = 'cache';       // respuestas del servidor, por ruta
const COLA = 'cola';         // lo que falta subir, en orden
let abierta;

function db() {
  if (!abierta) {
    abierta = new Promise((ok, mal) => {
      const p = indexedDB.open(BASE, VERSION);
      p.onupgradeneeded = () => {
        const d = p.result;
        if (!d.objectStoreNames.contains(CACHE)) d.createObjectStore(CACHE);
        if (!d.objectStoreNames.contains(COLA)) d.createObjectStore(COLA, { keyPath: 'id' });
      };
      p.onsuccess = () => ok(p.result);
      p.onerror = () => mal(p.error);
    });
  }
  return abierta;
}

async function conMagacen(nombre, modo, fn) {
  try {
    const d = await db();
    return await new Promise((ok, mal) => {
      const t = d.transaction(nombre, modo);
      const r = fn(t.objectStore(nombre));
      t.oncomplete = () => ok(r?.result !== undefined ? r.result : r);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error);
    });
  } catch (e) {
    // Navegador en privado, permisos, cuota llena: la app sigue, nada más que
    // sin memoria local. Vale más eso que una pantalla de error.
    console.warn('almacén local no disponible', e);
    return null;
  }
}

// ── lo que se leyó ──────────────────────────────────────────────────────────
export const guarda = (clave, datos) => conMagacen(CACHE, 'readwrite', (s) => s.put({ datos, cuando: Date.now() }, clave));
export async function lee(clave) {
  const r = await conMagacen(CACHE, 'readonly', (s) => s.get(clave));
  return r ? r.datos : null;
}
export async function cuando(clave) {
  const r = await conMagacen(CACHE, 'readonly', (s) => s.get(clave));
  return r ? r.cuando : null;
}
// Cambiar a mano lo guardado, para que un registro hecho sin señal se vea
// enseguida en la pantalla que lo muestra.
export async function parchea(clave, fn) {
  const actual = await lee(clave);
  if (!actual) return null;
  const nuevo = fn(structuredClone(actual));
  if (nuevo) await guarda(clave, nuevo);
  return nuevo;
}

// ── lo que falta subir ──────────────────────────────────────────────────────
export const encola = (op) => conMagacen(COLA, 'readwrite', (s) => s.put(op));
export const desencola = (id) => conMagacen(COLA, 'readwrite', (s) => s.delete(id));
export async function fila() {
  const r = await conMagacen(COLA, 'readonly', (s) => s.getAll());
  return (r || []).sort((a, b) => a.creado - b.creado);
}
export async function cuantosFaltan() {
  const r = await conMagacen(COLA, 'readonly', (s) => s.count());
  return r || 0;
}
export async function limpiaTodo() {
  await conMagacen(CACHE, 'readwrite', (s) => s.clear());
  await conMagacen(COLA, 'readwrite', (s) => s.clear());
}
