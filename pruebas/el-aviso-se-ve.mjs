/* El aviso de «toca el plano» tiene que verse sobre el plano.
 *
 * DEFECTO que reportó Mike el 22-sep-2026: «cuando le piques en agregar ítem
 * (en quell) el letrero que indica "toca el plano donde va el ítem" debe ser
 * visible, no blanco».
 *
 * Tenía razón y se pudo medir: el aviso era `background: var(--surface)` —
 * blanco— y se pinta ENCIMA de la hoja del plano, que también es blanca.
 * Contraste 1.00 contra el papel. Lo único que lo separaba era una sombra
 * suave, que sobre papel claro casi no existe.
 *
 * POR QUÉ ESTO SE MIDE, Y NO SE MIRA UNA VEZ
 *
 * Un color se rompe en silencio. Nadie abre una incidencia que diga «el
 * contraste bajó a 2.8»: se abre cuando alguien en obra, con el sol encima,
 * no encuentra el letrero y cree que la app no hizo nada. Y el que lo
 * cambió lo vio bien en su monitor.
 *
 * Por eso la revisión no es «que sea oscuro»: es la razón de luminancias
 * contra la hoja blanca, calculada con la misma fórmula de la norma de
 * accesibilidad. Menos de 3:1 no se ve; el mínimo decente para texto es
 * 4.5:1.
 *
 *   npm run build && node pruebas/el-aviso-se-ve.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const fuente = readFileSync('web/src/styles.css', 'utf8');
const proyecto = readFileSync('web/src/Project.jsx', 'utf8');
const dir = 'web/dist/assets';
const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');

/** La razón de contraste entre dos colores #rrggbb, como la define WCAG. */
const lum = (hex) => {
  const n = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const razon = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

// Los colores salen del CSS ARMADO, no de lo que uno crea recordar.
const tinta = (css.match(/--ink:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
const reglaHint = (css.match(/\.hint\{[^}]*\}/) || [''])[0];
const fondoHint = (reglaHint.match(/background:\s*var\(--([a-z0-9-]+)\)/) || [])[1];
const colorHint = (reglaHint.match(/color:\s*(#[0-9A-Fa-f]{3,6})/) || [])[1];

console.log('· el aviso NO es blanco');
rev(fondoHint === 'ink', 'el fondo es la tinta oscura, no la superficie', `var(--${fondoHint})`);
rev(/^#f{3}$|^#f{6}$/i.test(colorHint || ''), 'y el texto es blanco', colorHint);

console.log('· y se ve sobre la hoja del plano, que es blanca');
const contraHoja = razon(tinta, '#ffffff');
rev(contraHoja >= 4.5, 'contraste contra el papel de al menos 4.5:1', `${contraHoja.toFixed(2)}:1`);
const textoSobreFondo = razon(colorHint === '#fff' ? '#ffffff' : colorHint, tinta);
rev(textoSobreFondo >= 4.5, 'y el texto se lee sobre su propio fondo', `${textoSobreFondo.toFixed(2)}:1`);

console.log('· no usa un color que ya signifique otra cosa');
/* Rojo, ámbar y verde son pendiente, en proceso y resuelto en esta pantalla.
 * Un aviso pintado de uno de ésos se leería como un estado del ítem. */
for (const [nombre, llave] of [['pendiente', '--pend'], ['resuelto', '--ok']]) {
  const c = (css.match(new RegExp(`${llave}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
  rev(c && c.toLowerCase() !== tinta.toLowerCase(), `no es el color de «${nombre}»`);
}

console.log('· el botón de adentro cabe entero');
/* Con `nowrap`, el aviso del requerimiento —más largo— empujaba el
 * «Cancelar» fuera del borde de un celular de 390 y lo cortaba. */
rev(/\.hint \.btn\{[^}]*flex:none/.test(css), 'el botón nunca se encoge');
rev(/\.hint\{[^}]*width:max-content/.test(css),
    'y el aviso toma el ancho de una línea, partiéndose sólo si no cabe');
rev(!/\.hint\{[^}]*white-space:nowrap/.test(css), 'sin `nowrap`, que era lo que lo cortaba');
rev(/<span>\{tipoNuevo === 'Requerimiento'/.test(proyecto),
    'el texto va en su propia caja para poder ajustarse');

console.log('· el latido llama la atención y se acaba');
/* Uno infinito, en una pantalla que se usa con el plano abierto y el sol
 * encima, es de las cosas que hacen que la gente deje de mirar. */
/* El minificador reordena la abreviatura de `animation` («1.1s ease-in-out 2
 * hint-late»), así que no se busca una forma exacta: se busca que el latido
 * esté y que NO sea infinito, que es lo único que importa. */
const decl = (css.match(/\.hint\{[^}]*\}/) || [''])[0];
rev(/hint-late/.test(decl) && /\b2\b/.test(decl) && !/infinite/.test(decl),
    'son dos pulsos, no infinitos');
rev(/prefers-reduced-motion:reduce\)\{\.hint\{animation:none/.test(css.replace(/\s+/g, '')),
    'y quien pidió menos movimiento no lo recibe');

console.log('· y todo eso llegó a lo armado');
rev(/\.hint::?before\{/.test(css), 'el puntito del aviso se pinta');
rev(js.includes('Toca el plano donde va el ítem'), 'y el texto del aviso está en el paquete');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
