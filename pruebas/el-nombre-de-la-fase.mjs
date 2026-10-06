/* Los procesos y las fases con nombre (6-oct-2026).
 *
 * Mike: «cuando agrego otro proceso deben poder editarse los nombres de los
 * procesos. También quiero poder agregar otra fase a los procesos en caso de
 * ser necesario, y editar el nombre de la fase del proceso». Y después: «sí
 * puedo editar el nombre del proceso pero está mal el campo, en cuanto
 * escribo un caracter se sale de la ventana del nombre y ya no puedo
 * escribir más».
 *
 * LA CAUSA DE LO SEGUNDO: la llave del bloque del proceso era su nombre, así
 * que cada tecla cambiaba la llave, React tiraba el bloque y lo volvía a
 * crear, y el campo perdía el foco. Ahora la llave es el id de su primera
 * fase, que no cambia al renombrar.
 *
 * Lo que se mide sin navegador: la llave estable, el campo del proceso con
 * borde y lápiz, el nombre de cada fase editable (vacío vuelve al de su
 * etapa), «+ Otra fase» que entra antes de la instalación como etapa 'otra',
 * las flechas para subir y bajar, que nombre y pos viajen al servidor y
 * vuelvan, y que la gráfica use el nombre.
 *
 *   npm run build && node pruebas/el-nombre-de-la-fase.mjs
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

console.log('· el nombre del proceso');
rev(/<div key=\{deS\[0\]\.id\} className="seccion">/.test(crono) && !/key=\{s \|\| '\(sin\)'\}/.test(crono), 'la llave del bloque es el id de su primera fase, no el nombre (por eso perdía el foco)');
rev(/<label className="seccion-nombre"><i aria-hidden="true">✎<\/i><input value=\{s\} placeholder="Nombre del proceso"/.test(crono), 'el campo trae un lápiz y se ve como campo');
rev(/\.seccion-nombre\{display:inline-flex;[^}]*border:1px solid var\(--line\)/.test(css), 'con borde siempre, no sólo al pasar el ratón');

console.log('· el nombre de cada fase');
rev(/<input className="fase-nombre" value=\{t\.nombre \|\| ''\} placeholder=\{soloTotal \? 'Tiempo total' : NOMBRE\[t\.etapa\]\}[^>]*onChange=\{\(e\) => onPon\(\{ nombre: e\.target\.value \|\| null \}\)\}/.test(crono), 'cada fase lleva su nombre editable; vacío, vuelve al de su etapa');
rev(/export const nombreDe = \(t\) => \(t\.nombre && t\.nombre\.trim\(\)\) \|\| NOMBRE\[t\.etapa\] \|\| t\.etapa;/.test(crono), 'nombreDe: el que le pusieron o el de su etapa');
rev(/otra: 'Otra fase'/.test(crono) && /otra: 'servicios'/.test(crono), 'la etapa «otra» existe y toma proveedores de servicios');

console.log('· otra fase y el orden');
rev(/<button className="btn sm" onClick=\{\(\) => agregaFase\(e\.element_id, s\)\}[^>]*>\+ Otra fase<\/button>/.test(crono), 'el botón «+ Otra fase» en cada proceso');
rev(/const pos = inst \? posDe\(inst\) - 1 : \(mias\.length \? posDe\(mias\[mias\.length - 1\]\) \+ 1 : 0\);/.test(crono) && /etapa: 'otra', nombre: 'Nueva fase'/.test(crono), 'entra antes de la instalación (o al final), como «Nueva fase» con etapa otra');
rev(/const renumera = \(ts, element_id, seccion\) =>/.test(crono) && /\[t\.id, i \* 10\]/.test(crono), 'y el proceso se vuelve a numerar de 10 en 10');
rev(/const mueveFase = \(id, delta\) =>/.test(crono) && /aria-label="Subir">▲<\/button>/.test(crono) && /aria-label="Bajar">▼<\/button>/.test(crono), 'las flechas suben y bajan una fase dentro de su proceso');
rev(/export const ordenaFases = \(ts\) => \[\.\.\.ts\]\.sort\(\(a, b\) => posDe\(a\) - posDe\(b\) \|\| ETAPAS\.indexOf\(a\.etapa\) - ETAPAS\.indexOf\(b\.etapa\)\);/.test(crono), 'el orden dentro del proceso es pos, y a igual pos el de la etapa');

console.log('· viaja al servidor y vuelve');
rev(/etapa: t\.etapa, nombre: t\.nombre \|\| null, pos: posDe\(t\), dias: Number\(t\.dias\) \|\| 1,/.test(crono), 'nombre y pos van en el PUT');
rev(/etapa: t\.etapa, nombre: t\.nombre \|\| null, pos: Number\.isInteger\(t\.pos\) \? t\.pos : ETAPAS\.indexOf\(t\.etapa\) \* 10, dias: t\.dias,/.test(crono), 'y se leen de vuelta (lo viejo sin pos queda 0/10/20 por etapa)');

console.log('· la gráfica');
rev(/import \{ Candados, nombreDe, ordenaFases, pesos, responsableDe \} from '\.\/Cronograma\.jsx';/.test(gantt) && /\{rotulo\(f\.t\)\}<\/span>/.test(gantt), 'la gráfica rotula cada barra con el nombre de la fase');
rev(/const mias = procesos\.flatMap\(\(ts\) => ordenaFases\(ts\)\);/.test(gantt), 'y ordena las fases de cada proceso por pos');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Otra fase/.test(js) && /Nueva fase/.test(js) && /Nombre del proceso/.test(js), 'está en el JavaScript publicado');
const cssPub = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.fase-nombre\{/.test(cssPub) && /\.seccion-nombre\{[^}]*display:inline-flex/.test(cssPub), 'y el estilo en el CSS publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
