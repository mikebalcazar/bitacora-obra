// pdf.js se carga una sola vez y se reparte: lo usan el rasterizado del plano
// al subirlo y la capa nítida que se dibuja encima al acercarse.
let cargando;

export function esPdf(nombre) {
  return /\.pdf$/i.test(String(nombre || ''));
}

export function pdfjs() {
  if (!cargando) {
    cargando = (async () => {
      const lib = await import('pdfjs-dist');
      const trabajador = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      lib.GlobalWorkerOptions.workerSrc = trabajador.default;
      return lib;
    })();
  }
  return cargando;
}
