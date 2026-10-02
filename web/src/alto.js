/* Lo que el navegador del celular tapa abajo (Mike, 2-oct-2026, en un iPhone
 * con Safari 26: «No alcanzo a ver el menú de abajo»).
 *
 * Safari 26 dibuja su barra flotante ENCIMA de la página: la página mide la
 * pantalla completa y `env(safe-area-inset-bottom)` sólo cuenta la franja del
 * indicador de inicio, no la barra. Así que la barra de navegación de quell101
 * (Plano · Lista · Pendientes · Ítem · Reporte) quedaba detrás de la de Safari
 * y el aviso del ítem seleccionado salía cortado.
 *
 * La única medida fiable es `window.visualViewport`: dice cuánto de la página
 * se ve de verdad. Aquí se mide y se deja en dos variables de CSS en <html>:
 *
 *   --alto-visible  lo que se ve, en px; la caja de la app mide eso en el celular
 *   --tapa          lo que queda tapado abajo, en px; lo que flota abajo se sube eso
 *
 * Cuando Safari encoge su barra al desplazarse, el navegador avisa y la app
 * crece; cuando la vuelve a sacar, se encoge. Dos casos en que NO se mide:
 *
 *   · con un campo enfocado: lo que tapa es el teclado, y encoger la app
 *     entera mientras se escribe la hace brincar;
 *   · con la página ampliada con los dedos (scale > 1): lo visible es un
 *     pedazo, no la pantalla.
 *
 * Lo que decide vive en una función pura para medirla sin navegador. */

/** La medida, o null si no toca medir (sin visualViewport, teclado abierto o
 *  página ampliada). `alto` y `tapa` en px enteros. */
export function medirAlto({ vv, innerHeight, enfocado }) {
  if (!vv || !(vv.height > 0) || !(innerHeight > 0)) return null;
  if (vv.scale > 1.01) return null;
  const tag = enfocado && enfocado.tagName ? String(enfocado.tagName).toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || (enfocado && enfocado.isContentEditable)) return null;
  const alto = Math.round(vv.height + (vv.offsetTop || 0));
  const tapa = Math.max(0, Math.round(innerHeight - alto));
  return { alto, tapa };
}

/** Deja las variables en <html> y las mantiene al día. Devuelve cómo parar. */
export function vigilarAlto(win = window, doc = document) {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const raiz = doc.documentElement;
  let ultimo = '';
  const medir = () => {
    const m = medirAlto({ vv, innerHeight: win.innerHeight, enfocado: doc.activeElement });
    if (!m) return;
    const clave = `${m.alto}/${m.tapa}`;
    if (clave === ultimo) return;
    ultimo = clave;
    raiz.style.setProperty('--alto-visible', `${m.alto}px`);
    raiz.style.setProperty('--tapa', `${m.tapa}px`);
  };
  vv.addEventListener('resize', medir);
  vv.addEventListener('scroll', medir);
  win.addEventListener('orientationchange', medir);
  // Al soltar un campo, el teclado se va y la barra vuelve: se mide tantito después.
  const alSoltar = () => setTimeout(medir, 350);
  doc.addEventListener('focusout', alSoltar);
  medir();
  return () => {
    vv.removeEventListener('resize', medir); vv.removeEventListener('scroll', medir);
    win.removeEventListener('orientationchange', medir); doc.removeEventListener('focusout', alSoltar);
  };
}
