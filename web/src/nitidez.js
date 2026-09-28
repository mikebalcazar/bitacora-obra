/* Cuántos píxeles de verdad lleva la hoja del ítem.
 *
 * Mike, 28-sep-2026: «En quell, cuando abro el archivo del ítem (un pdf) se
 * ve muy baja resolución y no sirve de nada, no se puede leer».
 *
 * La causa: el lienzo se pintaba con tantos píxeles como puntos CSS tiene la
 * caja. En un celular la pantalla pone dos o tres píxeles por punto, así que
 * un plano de obra quedaba pintado a 390 píxeles de ancho y estirado: borroso
 * aun sin acercarse, e ilegible al acercarse. Aquí se cuenta la densidad de
 * la pantalla y el acercamiento que pidió el usuario, con dos topes que son
 * los del navegador del teléfono: un lienzo más grande que eso no truena, se
 * queda en blanco sin avisar.
 */
export const LADO_MAX = 4096;      // iOS no pinta un lienzo más ancho o más alto
export const AREA_MAX = 16_000_000; // ni uno con más píxeles en total

export function medidasDeHoja({ anchoCss, zoom = 1, dpr = 1, base }) {
  const puntos = Math.max(1, Math.round((anchoCss || 800) * Math.max(1, zoom || 1)));
  const densidad = Math.min(3, Math.max(1, dpr || 1));
  let escala = (puntos * densidad) / base.width;
  const mayor = Math.max(base.width, base.height);
  if (escala * mayor > LADO_MAX) escala = LADO_MAX / mayor;
  if (escala * escala * base.width * base.height > AREA_MAX) {
    escala = Math.sqrt(AREA_MAX / (base.width * base.height));
  }
  escala = Math.max(0.1, escala);
  return {
    escala,
    ancho: Math.round(base.width * escala),
    alto: Math.round(base.height * escala),
    anchoCss: puntos,
  };
}
