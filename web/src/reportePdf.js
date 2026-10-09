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
    const hojas = [...caja.querySelectorAll('.page')];
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    let primera = true;
    for (let i = 0; i < hojas.length; i++) {
      const h = hojas[i];
      h.style.margin = '0';
      h.style.boxShadow = 'none';
      const lienzo = await html2canvas(h, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: ANCHO_PX });
      for (const [y0, y1] of cortes(lienzo.height, lienzo.width)) {
        const franja = document.createElement('canvas');
        franja.width = lienzo.width; franja.height = y1 - y0;
        const g = franja.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, franja.width, franja.height);
        g.drawImage(lienzo, 0, y0, lienzo.width, y1 - y0, 0, 0, lienzo.width, y1 - y0);
        if (!primera) pdf.addPage();
        primera = false;
        // Lo que sobró poquito (≤2 %) se encoge parejo para no deformarlo.
        const alto = (y1 - y0) * A4.w / lienzo.width;
        const k = alto > A4.h ? A4.h / alto : 1;
        pdf.addImage(franja.toDataURL('image/jpeg', 0.8), 'JPEG', (A4.w - A4.w * k) / 2, 0, A4.w * k, alto * k, undefined, 'FAST');
      }
      onAvance?.(i + 1, hojas.length);
    }
    return pdf.output('blob');
  } finally {
    caja.remove();
  }
}
