/* El cronograma gráfico (6-oct-2026).
 *
 * Mike: «quiero poder indicar los días de cada fase de cada ítem y después
 * en el cronograma gráfico poder "arrastrar" la tarea (fase del ítem) que se
 * encadena con otra fase de otro ítem ya sea antes o después».
 *
 * Lo que se mide sin navegador: que exista la gráfica y sea la vista de
 * arranque (con la lista a un pico), que cada fase traiga sus días a la
 * izquierda y una pieza sin tiempo tres casillas para darle sus fases, que
 * soltar una barra sobre la mitad derecha de otra la encadene «después de»
 * y sobre la mitad izquierda «antes de», que soltarla en el vacío fije la
 * fecha (y el alfiler la suelte), que las ligas se dibujen, y que lo armado
 * lo traiga.
 *
 *   npm run build && node pruebas/el-cronograma-grafico.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const crono = readFileSync('web/src/Cronograma.jsx', 'utf8');
const gantt = readFileSync('web/src/Gantt.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');

console.log('· la gráfica es la vista');
rev(/import Gantt from '\.\/Gantt\.jsx';/.test(crono), 'Cronograma.jsx trae la gráfica');
rev(/localStorage\.getItem\('crono_modo'\) \|\| 'grafica'/.test(crono), 'arranca en gráfica y recuerda la última');
rev(/<button className=\{modo === 'grafica' \? 'on' : ''\} onClick=\{\(\) => cambiaModo\('grafica'\)\}>Gráfica<\/button>/.test(crono) && /<button className=\{modo === 'lista' \? 'on' : ''\} onClick=\{\(\) => cambiaModo\('lista'\)\}>Lista<\/button>/.test(crono), 'con los dos botones Gráfica / Lista');
rev(/modo === 'grafica' && !!items\.length && \(\s*<Gantt c=\{c\} tareas=\{tareas\} items=\{items\} fechasDe=\{fechasDe\} onPon=\{pon\} onEncadena=\{encadena\} onDarFases=\{darFases\} onIr=\{onIr\} \/>/.test(crono), 'y pinta <Gantt> con lo que edita y lo que contestó el servidor');

console.log('· los días de cada fase de cada ítem');
rev(/const DW = 28;/.test(gantt) && /if \(aFecha\(d\)\.getDay\(\) !== 0\) salida\.push\(d\);/.test(gantt), 'un día laborable por columna, sin domingos');
rev(/className="g-dias-in"><input type="number"[^>]*value=\{f\.t\.dias\} onChange=\{\(ev\) => onPon\(f\.t\.id, \{ dias:/.test(gantt), 'cada fase trae sus días a la izquierda, editables ahí mismo');
rev(/function DarFases/.test(gantt) && /\{!f\.n && <DarFases onOk=\{\(d\) => onDarFases\(f\.e\.element_id, d\)\} \/>\}/.test(gantt), 'una pieza sin tiempo trae tres casillas (material, fabricación, instalación)');
rev(/const darFases = \(element_id, dias\) => agrega\(ETAPAS\.filter\(\(k\) => dias\[k\] >= 1\)\.map/.test(crono), 'y con ellas nacen sus fases de una vez');

console.log('· arrastrar para encadenar');
rev(/lado: ev\.clientX < r\.left \+ r\.width \/ 2 \? 'antes' : 'despues'/.test(gantt), 'la mitad de la otra barra decide antes o después');
rev(/if \(sobre\.lado === 'despues'\) onEncadena\(t\.id, sobre\.id\);\s*else onEncadena\(sobre\.id, t\.id\);/.test(gantt), '«después de»: ésta espera a aquélla; «antes de»: aquélla espera a ésta');
rev(/const encadena = \(a, b\) => cambia\(\(\) => setTareas\(\(ts\) => ts\.map\(\(t\) => \(t\.id === a \? \{ \.\.\.t, depende_de: b \} : t\.id === b && t\.depende_de === a \? \{ \.\.\.t, depende_de: null \} : t\)\)\)\);/.test(crono), 'soltar del otro lado sobreescribe: la cadena al revés se quita en el mismo paso (Mike, 6-oct)');
rev(/\{f\.t\.depende_de && <button className="g-pin" title=\{`Espera a \$\{etiqueta\(f\.t\.depende_de\)\}\. Picar para quitar la cadena\.`\}[\s\S]*?onClick=\{\(\) => onPon\(f\.t\.id, \{ depende_de: null \}\)\}>⛓<\/button>\}/.test(gantt), 'una barra encadenada trae un eslabón que quita la cadena');
rev(/data-barra=\{f\.t\.id\}/.test(gantt) && /el\.dataset\.barra !== origen\.current\.id/.test(gantt), 'la barra de abajo se reconoce por data-barra, sin contarse a sí misma');
rev(/\{destino === 'despues' \? `\$\{etiqueta\(arrastre\.id\)\} después de ésta` : `\$\{etiqueta\(arrastre\.id\)\} antes de ésta`\}/.test(gantt), 'y mientras se arrastra, la barra de destino dice qué va a pasar');

console.log('· arrastrar al vacío fija la fecha');
rev(/const pasos = Math\.round\(dx \/ DW\);/.test(gantt) && /onPon\(t\.id, \{ inicio_fijo: nuevo \}\);/.test(gantt), 'soltar en el vacío pone fecha fija según los días recorridos');
rev(/onClick=\{\(\) => onPon\(f\.t\.id, \{ inicio_fijo: null \}\)\}>📌<\/button>/.test(gantt), 'el alfiler la suelta');
rev(/d=\{`M\$\{l\.x1\},\$\{l\.y1\} h6 V/.test(gantt) && /fuerte: f\.t\.depende_de === p/.test(gantt), 'las ligas se dibujan del fin de una al inicio de la otra, marcadas las que puso alguien');

console.log('· el estilo');
rev(/\.g-barra\{position:absolute;[^}]*cursor:grab;touch-action:none/.test(css), 'la barra se agarra, también con el dedo');
rev(/\.g-izq\{position:sticky;left:0/.test(css) && /\.g-cab\{display:flex;position:sticky;top:0/.test(css), 'la columna de la izquierda y los días se quedan a la vista al desplazarse');
rev(/\.g-barra\.destino\.antes\{/.test(css) && /\.g-barra\.destino\.despues\{/.test(css), 'antes y después se ven distinto en la barra de destino');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/después de ésta/.test(js) && /antes de ésta/.test(js) && /crono_modo/.test(js), 'la gráfica está en el JavaScript publicado');
const cssPub = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.g-barra\{/.test(cssPub), 'y el estilo en el CSS publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
