/* El título de un pendiente del punchlist ocupa el ancho del renglón.
 *
 * Mike, 1-oct-2026: «el despliegue de los títulos del punchlist se ven mal,
 * deberían estar corridos en el ancho del renglón. Como mensajes de chat pero
 * en forma de lista con su ícono de status».
 *
 * La causa: en styles.css había una regla `.pend{width:120px;text-align:right}`
 * para la columna de pendientes del renglón de la lista, y «pend» es también
 * el estado de un pendiente (`.pi.pend`). Cada pendiente sin resolver salía
 * apretado a 120px y pegado a la derecha. La regla queda acotada a `.lrow`.
 *
 * Lo que se mide: no hay regla global `.pend{` (ni `.proc{` ni `.ok{`, que
 * son los otros dos estados) y la de la lista sigue, acotada. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');
const lineas = css.split('\n');
let fallas = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok   ' : 'FALLA'} ${msg}`); if (!cond) fallas++; };

for (const estado of ['pend', 'proc', 'ok']) {
  const sueltas = lineas.filter((l) => new RegExp(`(^|[,}])\\s*\\.${estado}\\s*\\{`).test(l));
  ok(sueltas.length === 0, `no hay regla global .${estado}{ que se le pegue a .pi.${estado}${sueltas.length ? ` → ${sueltas[0].trim().slice(0, 80)}` : ''}`);
}
ok(/\.lrow \.pend\{width:120px/.test(css), 'la columna de pendientes de la lista sigue, acotada a .lrow');
ok(/\.pi\{[^}]*grid-template-columns:auto 1fr/.test(css), 'el pendiente es ícono + texto a lo ancho (auto 1fr)');

if (fallas) { console.log(`\n${fallas} falla(s)`); process.exit(1); }
console.log('\nEl título del pendiente va a lo ancho.');
