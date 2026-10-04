/* El cliente ve el precio, la etapa y los archivos de su ítem (4-oct-2026).
 *
 * Mike: «al cliente sí le debe aparecer el precio de cada ítem cuando lo
 * selecciona en quell» y «necesito que pueda ver los documentos (planos de
 * ítem) de los ítems y su estado del proceso».
 *
 * La API (contrato 0.66.0) ya le manda `item_monto`, `item_etapa`,
 * `item_descripcion` y `item_fecha_entrega` al cliente, y le deja leer la
 * documentación del ítem. Lo que se mide aquí, sin navegador: que la cara de
 * cliente los pinte, que abra el visor de archivos SIN poder subir ni anotar
 * (staff=false), y que las etapas se nombren como las nombra peek101.
 *
 *   npm run build && node pruebas/el-cliente-ve-precio-y-planos.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');
const cli = panel.slice(panel.indexOf('function ItemCliente('), panel.indexOf('function Contratistas('));

console.log('· lo del ítem, en la cara de cliente');
rev(/<div className="del-item" data-del-item>/.test(cli), 'hay un bloque del ítem');
rev(/\{e\.item_monto != null && <div><span>Precio<\/span><b>\{pesosCliente\(e\.item_monto\)\}<\/b><\/div>\}/.test(cli), 'con el precio, en pesos');
rev(/\{e\.item_etapa != null && <div><span>Etapa<\/span><b>\{etapaSuite\(e\.item_etapa\)\}<\/b><\/div>\}/.test(cli), 'la etapa de fabricación');
rev(/\{e\.item_fecha_entrega && <div><span>Entrega<\/span><b>\{fmtD\(e\.item_fecha_entrega\)\}<\/b><\/div>\}/.test(cli), 'la entrega acordada');
rev(/\{e\.item_descripcion && <p>\{e\.item_descripcion\}<\/p>\}/.test(cli), 'y la descripción');
rev(/<Docs e=\{e\} staff=\{false\} \/>/.test(cli), '«Archivos del ítem» de sólo lectura (staff=false: ni subir ni anotar)');

console.log('· las etapas se nombran como en peek101');
const lista = panel.match(/const ETAPAS_SUITE = \[([^\]]+)\]/)?.[1] ?? '';
const nombres = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
rev(nombres.join('|') === ['Diseño autorizado', 'Anticipo pagado', 'Compra de materiales', 'Despiece y ensamble', 'Entrega', 'Instalación', 'Cierre'].join('|'), 'las siete, en orden', nombres.join(' · '));
rev(/n <= 0 \? 'Por iniciar'/.test(panel), 'la 0 es «Por iniciar», como allá');
rev(/\.del-item\{/.test(css), 'el bloque tiene estilo');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/Despiece y ensamble/.test(js) && /data-del-item/.test(js), 'las etapas y el bloque están en el JavaScript publicado');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
