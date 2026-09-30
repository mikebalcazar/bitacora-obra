/* Los subítems: un trabajo complementario que cuelga de un ítem.
 *
 * Mike, 30-sep-2026: «los ítems puedan tener subítems (…) trabajos o
 * servicios que se le hacen complementarios a un ítem, y que en quell, a la
 * hora de seleccionar un ítem, ver de alguna forma los subítems creados en
 * ese ítem (…) deben de nacer como requerimientos nuevos, pero ligados al
 * ítem al que se le aplica».
 *
 * Se mide sobre el fuente porque el ligue lo hace la API (contrato 0.56.0,
 * `padre_id`) y aquí no hay API: lo que se puede comprobar sin red es que el
 * panel del ítem enseña sus subítems y de cuál cuelga, que el botón
 * «＋ Subítem» abre el modal como requerimiento colgado de la pieza, y que
 * al crear se manda `padre_id` al plano del padre.
 *
 *   node pruebas/el-subitem.mjs
 */
import { readFileSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const panel = readFileSync('web/src/ElementPanel.jsx', 'utf8');
const proyecto = readFileSync('web/src/Project.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');
console.log('· el panel del ítem enseña sus subítems y de cuál cuelga');
rev(/const hijos = todos\.filter\(\(t\) => t\.padre_id === e\.id\)/.test(panel), 'los subítems salen de la lista de la obra, por padre_id (sin otra llamada)');
rev(/const padre = e\.padre_id \? todos\.find\(\(t\) => t\.id === e\.padre_id\) : null/.test(panel), 'y el padre también');
rev(/data-subitems=\{hijos\.length\}/.test(panel), 'hay un bloque de subítems marcado para medirse');
rev(/className="chip subitem"[^>]*onClick=\{\(\) => onIr\(h\.id, h\.plan_id\)\}/.test(panel), 'cada subítem es un chip que lleva a la pieza, en su plano');
rev(/data-subitem="padre"[\s\S]{0,200}onIr\(padre\.id, padre\.plan_id\)/.test(panel), 'un subítem dice «Complemento de …» con liga a su padre');
rev(/data-subitem="nuevo" onClick=\{\(\) => onSubitem\(e\)\}/.test(panel), 'y quien dirige tiene «＋ Subítem»');
rev(/\{staff && onSubitem && <button/.test(panel), 'que sólo sale para quien dirige');
console.log('· el modal nace como requerimiento colgado del padre');
rev(/setPadreNuevo\(padre\); setTipoNuevo\('Requerimiento'\); setNewAt\(/.test(proyecto), 'picar «＋ Subítem» guarda el padre, arma un Requerimiento y abre el modal junto al padre');
rev(/padre=\{padreNuevo\}/.test(proyecto), 'el modal recibe al padre');
rev(/data-subitem="aviso"[^<]*Es un trabajo o servicio complementario de/.test(proyecto), 'y dice de qué cuelga antes de guardar');
rev(/\.\.\.\(padreNuevo \? \{ padre_id: padreNuevo\.id \} : \{\}\)/.test(proyecto), 'al crear se manda padre_id (contrato 0.56.0)');
rev(/const planDelPunto = padreNuevo\?\.plan_id \|\| planId;[\s\S]{0,120}ruta: `\/plans\/\$\{planDelPunto\}\/elements`/.test(proyecto), 'y al plano del padre, no al que esté abierto');
rev(/setNewAt\(null\); setTipoNuevo\(null\); setPadreNuevo\(null\);/.test(proyecto), 'cancelar o crear sueltan al padre');
rev(/\.chip\.subitem\{cursor:pointer/.test(css) && /button\.liga\{/.test(css), 'el chip y la liga tienen su estilo');
console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
