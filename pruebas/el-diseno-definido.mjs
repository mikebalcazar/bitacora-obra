/* El diseño definido de la pieza, con su archivo (9-oct-2026).
 *
 * Mike: «desde quell quiero poder marcar que el diseño ya está definido y
 * poder adjuntar un plano (pdf) o imagen del diseño definido». Con botones
 * escogió «Aparte, sin tocar el principal»: el archivo entra como soporte
 * marcado como diseño (API 0.90.0) y el plano principal no se toca.
 *
 * Lo que se mide sin navegador: el rótulo del encabezado abre el cuadro;
 * el cuadro pide fecha y deja escoger, pegar o arrastrar un PDF o imagen;
 * con archivo va a POST /elements/:id/docs con `diseno=1` y la fecha, sin
 * archivo sólo fecha la pieza; quitar la marca deja la fecha vacía; «ver
 * diseño» abre el archivo vivo; la tarjeta del visor dice cuál es; y lo
 * armado lo trae. Las reglas (uno vivo, el nuevo archiva al anterior) las
 * prueba la API.
 *
 *   npm run build && node pruebas/el-diseno-definido.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const docs = readFileSync('web/src/DocsItem.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');
const cuadro = panel.slice(panel.indexOf('function MarcarDiseno('), panel.indexOf('function EditElement('));

console.log('· el rótulo del encabezado');
rev(/\{staff && <DisenoDefinido e=\{e\} onChanged=\{changed\} \/>\}/.test(panel), 'sólo quien dirige lo ve');
rev(/<button type="button" className="liga" data-diseno="marcar" onClick=\{\(\) => setAbierto\(true\)\}>/.test(panel), 'picarlo abre el cuadro «Diseño definido»');
rev(/\{doc && <> · <a className="liga" data-diseno="ver" href=\{fileUrl\(doc\.r2_key\)\} target="_blank"/.test(panel), 'con archivo: «ver diseño» lo abre aparte');
rev(/const diaDe = \(f\) => fmtD\(`\$\{f\}T12:00:00`\);/.test(panel), 'la fecha se lee a mediodía (en CDMX no sale el día anterior)');

console.log('· el cuadro');
rev(/<h2>Diseño definido<\/h2>/.test(cuadro) && /<input type="date" required value=\{fecha\}/.test(cuadro), 'pide la fecha (hoy, o la que ya tenga)');
rev(/useState\(e\.diseno_definido \|\| todayISO\(\)\)/.test(cuadro), 'propone la que ya tenga, o hoy');
rev(/accept="\.pdf,application\/pdf,image\/\*"/.test(cuadro), 'el archivo es PDF o imagen');
rev(/planoDe\(dt\)/.test(cuadro) && /document\.addEventListener\('paste', onPaste\)/.test(cuadro) && /onDrop=\{\(ev\) => \{ ev\.preventDefault\(\); setSoltando\(false\); toma\(ev\.dataTransfer\); \}\}/.test(cuadro), 'también se pega o se arrastra');
rev(/fd\.append\('diseno', '1'\);\s*fd\.append\('diseno_definido', fecha\);\s*const r = await api\.form\(`\/elements\/\$\{e\.id\}\/docs`, fd\);/.test(cuadro), 'con archivo: va a los archivos del ítem marcado como diseño, con la fecha');
rev(!/fd\.append\('rol'/.test(cuadro), 'y no como plano principal (lo pone la API como soporte)');
rev(/await api\.patch\(`\/elements\/\$\{e\.id\}`, \{ diseno_definido: fecha \}\);/.test(cuadro), 'sin archivo: sólo fecha la pieza');
rev(/await api\.patch\(`\/elements\/\$\{e\.id\}`, \{ diseno_definido: null \}\);/.test(cuadro), '«Quitar la marca» la deja sin definir');
rev(/Al guardar, éste queda archivado\./.test(cuadro), 'avisa que el archivo de antes se archiva');
rev(/Va aparte del plano principal, que no se toca\./.test(cuadro), 'y que el plano principal no se toca');

console.log('· en «Archivos del ítem»');
rev(/export const idOp = /.test(docs) && /export async function cuentaPaginas\(file\)/.test(docs), 'el cuadro usa los mismos ayudantes que el visor');
rev(/\{doc\.diseno \? <div className="s" data-diseno-tarjeta><span className="pill diseno">Diseño definido<\/span><\/div> : null\}/.test(docs), 'la tarjeta del archivo dice «Diseño definido»');
rev(/\.pill\.diseno\{/.test(css) && /\.diseno-archivo\{/.test(css), 'con su estilo');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Va aparte del plano principal, que no se toca\./.test(js) && /ver diseño/.test(js) && /Quitar la marca \(diseño sin definir\)/.test(js), 'está en el JavaScript publicado');
const cssPub = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.pill\.diseno\{/.test(cssPub), 'y el estilo en el CSS publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
