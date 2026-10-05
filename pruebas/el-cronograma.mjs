/* El cronograma de la obra (5-oct-2026).
 *
 * Mike: «necesito en quell poder configurar un cronograma, pero algo muy
 * amigable (…) tiempo de fabricación total, y la opción de definir entrega de
 * material, fabricación e instalación, cada una con su proveedor o
 * contratista (…) encadenar tareas (…) sólo se encadenan las instalaciones
 * (…) exportar a Microsoft Project o Excel». Días de lunes a sábado.
 *
 * Lo que se mide sin navegador: que la vista exista y sólo para quien dirige
 * la obra, que se llegue desde la barra lateral y desde los selectores, que
 * una pieza arranque con un solo número («Tiempo total») y se pueda
 * desglosar en las tres etapas, que el proveedor se filtre por tipo
 * (materiales para el material, servicios para fabricar e instalar), que
 * «Otro proceso» encadene su instalación a la anterior, que haya «Después
 * de…», que se guarde solo con PUT al servidor, que los dos botones de
 * exportar apunten a las rutas de Excel y Project, y que lo armado lo traiga.
 *
 *   npm run build && node pruebas/el-cronograma.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const proy = readFileSync('web/src/Project.jsx', 'utf8');
const crono = readFileSync('web/src/Cronograma.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');

console.log('· la vista');
rev(/import Cronograma from '\.\/Cronograma\.jsx';/.test(proy), 'Project.jsx importa la pantalla');
rev(/\(trozos\[0\] === 'cronograma' && staff\)/.test(proy), 'la dirección #/p/OBRA/cronograma sólo vale para quien dirige; para los demás es el plano');
rev(/vista === 'cronograma' \? \(\s*<Cronograma pid=\{id\}/.test(proy), 'y con esa vista se pinta <Cronograma>');
rev(/\{staff && <button className=\{'item' \+ \(vista === 'cronograma' \? ' on' : ''\)\} onClick=\{\(\) => setVista\(vista === 'cronograma' \? 'plan' : 'cronograma'\)\}>Cronograma<\/button>\}/.test(proy), 'en la barra lateral hay un botón «Cronograma», sólo para staff');
rev(/\{staff && <button className=\{vista === 'cronograma' \? 'on' : ''\} onClick=\{\(\) => \{ setVista\('cronograma'\);[^}]*\}\}>Cronograma<\/button>\}/.test(proy), 'y en los selectores de arriba');
rev(/const sinFiltros = vista === 'dudas' \|\| vista === 'cronograma';/.test(proy) && !/vista !== 'dudas'/.test(proy), 'los filtros de tipo y fase se esconden ahí, igual que en las dudas');

console.log('· la captura');
rev(/const ETAPAS = \['material', 'fabricacion', 'instalacion'\];/.test(crono), 'las tres etapas');
rev(/material: 'materiales', fabricacion: 'servicios', instalacion: 'servicios'/.test(crono), 'el material lo surte un proveedor de materiales; fabricar e instalar, uno de servicios');
rev(/proveedores\.filter\(\(p\) => p\.tipo === tipo \|\| p\.id === t\.proveedor_id\)/.test(crono), 'y la lista de proveedores se filtra por ese tipo');
rev(/<option value="">\{tipo === 'materiales' \? '\(sin proveedor\)' : '\(el taller\)'\}<\/option>/.test(crono), 'con «(el taller)» como opción de hacerlo uno mismo');
rev(/function DarTiempo/.test(crono) && /<label>Tiempo total<\/label>/.test(crono) && /etapa: 'fabricacion', dias \}\)\]\)/.test(crono), 'una pieza sin tiempo arranca con un número: el tiempo total, como fabricación');
rev(/soloTotal \? 'Tiempo total' : NOMBRE\[t\.etapa\]/.test(crono) && /Desglosar:/.test(crono), 'esa única etapa se llama «Tiempo total» y ofrece desglosar en las otras');
rev(/\+ Otro proceso/.test(crono) && /etapa: 'instalacion', dias: 1, orden, depende_de: previa \? previa\.id : null/.test(crono), '«Otro proceso» nace con su instalación encadenada a la instalación del proceso anterior');
rev(/Después de… \(sigue el orden\)/.test(crono) && /onPon\(\{ depende_de: e\.target\.value \|\| null \}\)/.test(crono), 'cualquier tarea puede esperar a otra con «Después de…»');
rev(/Los días se cuentan de lunes a sábado/.test(crono), 'y la pantalla dice cómo se cuentan los días');

console.log('· se guarda solo');
rev(/metodo: 'PUT', ruta: `\/projects\/\$\{pid\}\/cronograma`/.test(crono), 'con PUT /projects/:id/cronograma');
rev(/setTimeout\(\(\) => guardaRef\.current\(\), 700\)/.test(crono), 'un momento después del último cambio');
rev(/if \(sucio\.current === marca\) \{ setTareas\(r\.r\.tareas\.map\(limpia\)\); setEstado\('Guardado'\); \}/.test(crono), 'y una respuesta vieja no pisa lo que se tecleó mientras tanto');
rev(/b className=\{c\.excede \? 'excede' : ''\}/.test(crono) && /se pasa \$\{plural/.test(crono), 'si se pasa de los días prometidos, el fin va en rojo y dice cuánto');

console.log('· exportar');
rev(/href=\{`\$\{BASE\}\/api\/projects\/\$\{pid\}\/cronograma\.xlsx`\} download/.test(crono), 'el botón de Excel baja cronograma.xlsx');
rev(/href=\{`\$\{BASE\}\/api\/projects\/\$\{pid\}\/cronograma\.xml`\} download/.test(crono), 'el de Project baja cronograma.xml');

console.log('· el estilo');
rev(/\.crono\{position:absolute;inset:0;overflow:auto/.test(css), '.crono ocupa el escenario, como las dudas');
rev(/\.tarea\{display:grid;grid-template-columns:150px 92px minmax\(120px,1fr\) minmax\(150px,1fr\) 118px 28px/.test(css), 'cada etapa es un renglón de seis columnas');
rev(/\.tarea\{grid-template-columns:1fr 92px 28px;/.test(css), 'y en el celular se apila');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/cronograma\.xlsx/.test(js) && /cronograma\.xml/.test(js) && /Tiempo total/.test(js) && /Otro proceso/.test(js), 'la pantalla está en el JavaScript publicado');
const cssPub = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.crono\{/.test(cssPub) && /\.tarea\{/.test(cssPub), 'y el estilo en el CSS publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
