import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Hasta dónde atrás se apoya. Mike, 30-sep-2026, en un Android nuevo con un
 * Chrome sin actualizar: quell101 abría en el acomodo de computadora,
 * apretado y sin poderse mover. Vite 8 pasa el CSS por lightningcss y, con la
 * meta de navegadores que trae de fábrica (Chrome 107+), reescribe
 * `@media (max-width:900px)` como `(width <= 900px)`, que Chrome sólo entiende
 * desde la 104: un Chrome más viejo se saltaba el bloque de celular ENTERO.
 * Los teléfonos de obra no siempre están al día, así que la meta se fija
 * atrás, para el CSS y para el JavaScript. La prueba pruebas/el-css-viejo.mjs
 * cuida que lo armado no traiga esa sintaxis. */
const v = (mayor) => mayor << 16;
const METAS = { chrome: v(87), android: v(87), samsung: v(14), safari: v(14), ios_saf: v(14), firefox: v(78), edge: v(88) };

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787', '/files': 'http://localhost:8787' } },
  css: { lightningcss: { targets: METAS } },
  build: {
    outDir: 'dist', emptyOutDir: true,
    target: ['chrome87', 'safari14', 'firefox78', 'edge88'],
    cssTarget: ['chrome87', 'safari14', 'firefox78', 'edge88'],
  },
});
