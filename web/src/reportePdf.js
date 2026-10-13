/* El reporte de quell como PDF, listo para mandarlo (Mike, 9-oct-2026: «en
 * quell, cuando quiero generar un reporte, desde el iPhone y Android quiero
 * poder compartir directo a alguna app tipo WhatsApp el PDF ya listo»).
 *
 * Antes sólo había «Imprimir / Guardar PDF», que en el iPhone son varios
 * pasos y dentro de la app de Android no sirve. Ahora el PDF se arma aquí
 * mismo, en el teléfono, al abrir el reporte: cada hoja (`.page`) se dibuja
 * en un lienzo a lo ancho de una hoja A4 (794 px = 210 mm a 96 ppp, al doble
 * para que la letra chica se lea) y entra como imagen a una hoja A4 del PDF.
 * Una hoja que creció más de lo que cabe (muchas fotos) se parte en varias.
 *
 * Se arma AL ABRIR y no al picar «Compartir»: en el iPhone la hoja de
 * compartir sólo se abre en el mismo toque, y armar un reporte con fotos
 * tarda unos segundos; si se arma después del toque, Safari ya no deja.
 * Las dos librerías se bajan sólo cuando se abre un reporte. */

export const ANCHO_PX = 794;          // 210 mm a 96 ppp
export const A4 = { w: 210, h: 297 };  // mm

/** Las franjas [y0, y1) en que se parte una hoja dibujada de `alto`×`ancho`
 *  px para que cada una quepa en una A4. Si sobra muy poco (≤2 %) no se
 *  parte: se encoge un pelo y queda en una. */
export function cortes(alto, ancho) {
  const hoja = Math.round(ancho * A4.h / A4.w);
  if (alto <= hoja * 1.02) return [[0, alto]];
  const out = [];
  for (let y = 0; y < alto; y += hoja) out.push([y, Math.min(alto, y + hoja)]);
  return out;
}

/** «Reporte de punchlist - Sanje - 2026-10-09.pdf», sin lo que un teléfono
 *  o WhatsApp no aceptan en un nombre de archivo. */
export function nombreDelReporte(titulo, proyecto, cuando = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const dia = `${cuando.getFullYear()}-${p(cuando.getMonth() + 1)}-${p(cuando.getDate())}`;
  const limpio = (t) => String(t || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [limpio(titulo) || 'Reporte', limpio(proyecto), dia].filter(Boolean).join(' - ') + '.pdf';
}

/* 13-oct-2026 · Mike: «los reportes de punchlist de quell no están saliendo
 * con las imágenes en el pdf. Salen vacíos los recuadros». Las fotos entraban
 * al PDF como liga a su archivo de 12 MP: html2canvas tiene que bajarlas y
 * decodificarlas otra vez por cada hoja, con 15 s por imagen, y en el
 * teléfono no le alcanza (y en la app, de otro origen, puede ni dejarlo). El
 * recorte del plano sí salía porque ya iba dibujado. Ahora cada foto se baja
 * UNA vez, se reduce a lo que se ve en una A4 y entra ya dibujada. */
export const LADO_MAX_PX = 1400;

/** Las medidas para que una foto quepa en `max` px por su lado mayor. */
export function medidaReducida(w, h, max = LADO_MAX_PX) {
  const k = Math.min(1, max / Math.max(w || 1, h || 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Baja una imagen (con la sesión, como cualquier archivo de quell) y la
 *  devuelve dibujada y reducida, como data URL JPEG. Por fetch y blob, no por
 *  <img crossOrigin>: así no «ensucia» el lienzo ni en la app de Android. */
export async function imagenIncrustada(src, max = LADO_MAX_PX) {
  const r = await fetch(src, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`foto ${r.status}`);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { w, h } = medidaReducida(img.naturalWidth, img.naturalHeight, max);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Cambia cada <img> de `raiz` que todavía es liga por su versión dibujada.
 *  De tres en tres; la que no se pueda bajar se queda como estaba. */
async function incrustarImagenes(raiz) {
  const pendientes = [...raiz.querySelectorAll('img')].filter((i) => i.getAttribute('src') && !i.getAttribute('src').startsWith('data:'));
  const una = async (i) => {
    try { i.src = await imagenIncrustada(i.src); await i.decode(); } catch { /* se queda la liga */ }
  };
  for (let k = 0; k < pendientes.length; k += 3) await Promise.all(pendientes.slice(k, k + 3).map(una));
}

/* 13-oct-2026 · Mike (Android, HOLCIM, 27 pendientes): «no genera el pdf»,
 * el botón decía «PDF no disponible». Un teléfono no deja usar un lienzo
 * muy grande: una hoja con muchas fotos, dibujada al doble, pasa de los
 * 10 millones de puntos y el lienzo sale vacío; jsPDF truena con eso y se
 * perdía el PDF entero. Ahora:
 *   · cada hoja se dibuja a la escala que quepa en TOPE_PX (al doble si cabe);
 *   · la copia que hace html2canvas por hoja ya no lleva el reporte en
 *     pantalla (con todas sus fotos), sólo la hoja;
 *   · si una hoja no se puede dibujar, se reintenta más chica, y si tampoco,
 *     entra una hoja que lo dice: el PDF sale con todo lo demás. */
export const TOPE_PX = 8e6;

/** La escala para dibujar una hoja de `ancho`×`alto` px: al doble si cabe
 *  en `tope` puntos; si no, la que quepa (nunca más del doble). */
export function escalaPara(ancho, alto, tope = TOPE_PX) {
  const area = Math.max(1, ancho) * Math.max(1, alto);
  return Math.min(2, Math.sqrt(tope / area));
}

/** ¿Este lienzo sirve? Uno que el teléfono no pudo crear sale de 0×0, o su
 *  imagen sale vacía («data:,»). */
const lienzoSirve = (c) => !!c && c.width > 0 && c.height > 0;
const datosSirven = (d) => typeof d === 'string' && d.length > 'data:image/jpeg;base64,'.length && d.startsWith('data:image/');

/** Arma el PDF del HTML del reporte. Devuelve un `Blob` application/pdf. */
export async function armarPdf(html, css, { onAvance } = {}) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')]);
  // Fuera de la vista y a lo ancho de una hoja, sin importar el ancho del
  // teléfono: así sale igual que en papel y no como se ve en la pantallita.
  const caja = document.createElement('div');
  caja.setAttribute('aria-hidden', 'true');
  caja.style.cssText = `position:fixed;left:-20000px;top:0;width:${ANCHO_PX}px;pointer-events:none`;
  caja.innerHTML = `<style>${css}</style><div class="sheet" style="width:${ANCHO_PX}px;max-width:none">${html}</div>`;
  document.body.appendChild(caja);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await incrustarImagenes(caja);
    const hojas = [...caja.querySelectorAll('.page')];
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    let primera = true;
    for (let i = 0; i < hojas.length; i++) {
      const h = hojas[i];
      h.style.margin = '0';
      h.style.boxShadow = 'none';
      /* La hoja mide una A4 CON su margen: el `min-height: 297mm` más el
       * relleno la pasaba de la A4 y cada hoja dejaba detrás otra en blanco
       * con sólo el pie (el reporte de Sanje: 32 hojas para 16). */
      h.style.boxSizing = 'border-box';
      h.style.minHeight = `${Math.round(ANCHO_PX * A4.h / A4.w)}px`;
      // Sólo la hoja: el reporte en pantalla (con todas sus fotos) no se copia.
      const opciones = { useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: ANCHO_PX, ignoreElements: (el) => el.classList?.contains('report') };
      const base = escalaPara(h.offsetWidth || ANCHO_PX, h.offsetHeight || ANCHO_PX * A4.h / A4.w);
      let paginas = null;
      for (const escala of [base, base / 2]) {
        try {
          const lienzo = await html2canvas(h, { ...opciones, scale: escala });
          if (!lienzoSirve(lienzo)) continue;
          const franjas = [];
          for (const [y0, y1] of cortes(lienzo.height, lienzo.width)) {
            const franja = document.createElement('canvas');
            franja.width = lienzo.width; franja.height = y1 - y0;
            const g = franja.getContext('2d');
            if (!g) throw new Error('sin lienzo');
            g.fillStyle = '#fff'; g.fillRect(0, 0, franja.width, franja.height);
            g.drawImage(lienzo, 0, y0, lienzo.width, y1 - y0, 0, 0, lienzo.width, y1 - y0);
            const datos = franja.toDataURL('image/jpeg', 0.8);
            if (!datosSirven(datos)) throw new Error('lienzo vacío');
            // Lo que sobró poquito (≤2 %) se encoge parejo para no deformarlo.
            franjas.push({ datos, alto: (y1 - y0) * A4.w / lienzo.width });
            franja.width = franja.height = 0; // se suelta la memoria ya
          }
          lienzo.width = lienzo.height = 0;
          paginas = franjas;
          break;
        } catch { /* se intenta más chica */ }
      }
      if (!paginas) {
        if (!primera) pdf.addPage();
        primera = false;
        pdf.setFontSize(12);
        pdf.text([`Hoja ${i + 1} de ${hojas.length}: no se pudo dibujar en este teléfono.`, 'Sácala desde la computadora, o con «Imprimir» → «Guardar como PDF».'], 20, 30);
      } else {
        for (const { datos, alto } of paginas) {
          if (!primera) pdf.addPage();
          primera = false;
          const k = alto > A4.h ? A4.h / alto : 1;
          pdf.addImage(datos, 'JPEG', (A4.w - A4.w * k) / 2, 0, A4.w * k, alto * k, undefined, 'FAST');
        }
      }
      onAvance?.(i + 1, hojas.length);
    }
    return pdf.output('blob');
  } finally {
    caja.remove();
  }
}
