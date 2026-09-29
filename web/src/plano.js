/* Las cuentas del plano que se pueden medir sin navegador.
 *
 * Mike, 29-sep-2026: «Hay que reducir el consumo de recursos de las apps en
 * MÓVIL. Es crítico.» Escogió empezar por el plano de quell101.
 *
 * El plano se dibuja en un lienzo del tamaño de la pantalla (PlanCanvas.jsx).
 * Encima, si el plano llegó en PDF, se dibuja la página a la escala en que se
 * está viendo: dibujarla es ejecutar TODA la lista de trazos de la página con
 * pdf.js, y en un plano de arquitectura eso son cientos de milisegundos de
 * CPU en un teléfono. Hasta hoy se volvía a dibujar cada vez que el dedo se
 * detenía, aunque sólo se hubiera movido la vista dos centímetros.
 *
 * Lo de aquí decide CUÁNDO vale la pena volver a dibujar y cuánto de más se
 * dibuja para que un paneo corto no obligue a nada:
 *
 *   · La hoja se dibuja con margen: MARGEN veces la pantalla por lado. Un
 *     paneo que se queda dentro de ese margen se resuelve copiando píxeles.
 *   · Sólo se vuelve a dibujar si el zoom cambió más de UMBRAL_ZOOM (±25 %),
 *     si la vista se salió de lo dibujado, o si cambió el tamaño de la caja.
 *   · La hoja no pasa de AREA_MAX_HOJA píxeles: en una pantalla grande el
 *     margen se encoge en vez de reventar la memoria de video.
 *   · Y se espera ESPERA_MS quieta antes de dibujar: un dedo que se detiene
 *     medio segundo a mitad del gesto no dispara nada.
 */

export const MARGEN = 1.75;
export const UMBRAL_ZOOM = 1.25;
export const ESPERA_MS = 450;
export const AREA_MAX_HOJA = 8_000_000;

/** Cuánto se dibuja alrededor de la pantalla. `w`/`h` van en píxeles de
 *  pantalla (ya con densidad). Devuelve el margen por lado y el tamaño total. */
export function hojaConMargen({ w, h }) {
  w = Math.max(1, Math.round(w || 0)); h = Math.max(1, Math.round(h || 0));
  let m = MARGEN;
  if (w * h * m * m > AREA_MAX_HOJA) m = Math.max(1, Math.sqrt(AREA_MAX_HOJA / (w * h)));
  const mx = Math.round((w * (m - 1)) / 2), my = Math.round((h * (m - 1)) / 2);
  return { m, mx, my, aw: w + 2 * mx, ah: h + 2 * my };
}

/** Dónde se pega, y a qué escala, una hoja dibujada con la vista `hv` cuando
 *  la vista es `vv`. `p` es la densidad. El resultado va en píxeles de lienzo. */
export function pegado({ vv, hv, p = 1 }) {
  const k = vv.s / hv.s;
  const e = hv.estirar || 1;
  return {
    k, e,
    x: (vv.x - hv.x * k) * p - (hv.mx || 0) * k,
    y: (vv.y - hv.y * k) * p - (hv.my || 0) * k,
    ancho: (hv.aw || hv.w) * k,
    alto: (hv.ah || hv.h) * k,
  };
}

/** Si hay que volver a pedirle la página a pdf.js. Devuelve la razón, o
 *  `null` cuando lo ya dibujado sigue sirviendo. */
export function hayQueRedibujar({ vv, hv, w, h, p = 1 }) {
  if (!hv) return 'sin hoja';
  const k = vv.s / hv.s;
  if (k > UMBRAL_ZOOM || k < 1 / UMBRAL_ZOOM) return 'zoom';
  if (hv.w !== w || hv.h !== h) return 'tamaño';
  const { x, y, ancho, alto } = pegado({ vv, hv, p });
  if (x > 0 || y > 0 || x + ancho < w || y + alto < h) return 'se salió';
  return null;
}

/** El estado de la señal que la app enseña. Sólo cambia si cambió algo: un
 *  aviso igual al anterior no tiene por qué volver a pintar toda la app. */
export function mismaSenal(a, b) {
  if (!a || !b) return false;
  return a.faltan === b.faltan && a.red === b.red && a.deCache === b.deCache && a.ultimoError === b.ultimoError;
}
