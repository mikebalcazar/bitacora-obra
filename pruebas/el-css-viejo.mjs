/* Lo armado se entiende en un Chrome sin actualizar.
 *
 * Mike, 30-sep-2026, en un Android nuevo con un Chrome viejo: quell101 abría
 * con el acomodo de computadora, apretado y sin poderse mover. Vite 8
 * reescribía `@media (max-width:900px)` como `(width <= 900px)` (sintaxis de
 * rango, Chrome 104+), y ese Chrome se saltaba el bloque de celular entero.
 * web/vite.config.js fija la meta de navegadores atrás; esto mide que lo
 * armado no traiga esa sintaxis y que las reglas de celular sigan ahí.
 *
 *   npm run build && node pruebas/el-css-viejo.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const dir = 'web/dist/assets';
const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const medias = [...css.matchAll(/@media([^{]*)\{/g)].map((m) => m[1].trim());
console.log('· las reglas de celular, en la sintaxis que entiende todo Chrome');
rev(medias.length >= 5, 'lo armado trae sus bloques @media', `${medias.length}`);
const rango = medias.filter((m) => /<=|>=|<|>/.test(m));
rev(rango.length === 0, 'ninguno usa la sintaxis de rango (width <= …), que Chrome viejo se salta', rango.join(' | '));
rev(medias.some((m) => /\(max-width:\s*900px\)/.test(m)), 'el bloque de celular (max-width:900px) está');
rev(medias.some((m) => /\(max-width:\s*560px\)/.test(m)), 'y el de pantalla angosta (max-width:560px)');
console.log('· la meta de navegadores está fijada en la configuración');
const conf = readFileSync('web/vite.config.js', 'utf8');
rev(/lightningcss: \{ targets: METAS \}/.test(conf), 'lightningcss recibe la meta');
rev(/chrome: v\(87\)/.test(conf) && /android: v\(87\)/.test(conf), 'que empieza en Chrome 87');
rev(/target: \['chrome87'/.test(conf) && /cssTarget: \['chrome87'/.test(conf), 'y el JavaScript y el CSS de Vite van a la misma meta');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
