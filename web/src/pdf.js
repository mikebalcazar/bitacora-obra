// pdf.js se carga una sola vez y se reparte: lo usan el rasterizado del plano
// al subirlo y la capa nítida que se dibuja encima al acercarse.
let cargando;

export function esPdf(nombre) {
  return /\.pdf$/i.test(String(nombre || ''));
}

export function pdfjs() {
  if (!cargando) {
    cargando = (async () => {
      /* La versión «legacy», no la moderna. Mike, 7-oct-2026: «en Android no
       * abren algunos planos en quell (…) así se queda la pantalla y nunca
       * carga». La moderna usa `Promise.withResolvers`, que Chrome trae
       * desde la 119 (fines de 2023): en un Android con Chrome anterior,
       * `getDocument` truena antes de pintar nada y el PDF del ítem se queda
       * en un cuadro blanco para siempre. La legacy trae esas piezas de
       * repuesto; pesa unos 45 KB más y sólo se baja al abrir un PDF. */
      const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const trabajador = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
      lib.GlobalWorkerOptions.workerSrc = trabajador.default;
      return lib;
    })();
  }
  return cargando;
}
