/* La empresa del dominio propio manda sobre ORG_ID (2-oct-2026).
 *
 * Mike: «que al abrirla les abra sus portales personalizados (ej.
 * quell101.dominioempresa.com)». Este Worker era de UNA empresa (ORG_ID); por
 * el dominio de otra abriría la de siempre. Ahora, si la puerta de las
 * empresas manda X-Dominio-Empresa y X-Org-Empresa, se toca la puerta de esa
 * empresa —siempre que quien entró sea de ella—. Sin las cabeceras, nada
 * cambia: lo mide la misma función, sin red.
 *
 *   node pruebas/la-empresa-del-dominio.mjs
 */
import { empresaDe, empresaPedida } from '../worker/index.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const yo = { orgs: [{ id: 'forespot', apps: [] }, { id: 'acme', apps: ['quell'] }, { id: 'otra', apps: [] }] };
const env = { ORG_ID: 'forespot' };

console.log('· sin dominio, lo de siempre');
rev(empresaDe(yo, env) === 'forespot', 'ORG_ID manda cuando no hay dominio');
rev(empresaDe(yo, env, null) === 'forespot', 'y con pedida nula, igual');

console.log('· por el dominio de una empresa');
rev(empresaDe(yo, env, 'acme') === 'acme', 'la empresa del dominio manda sobre ORG_ID');
rev(empresaDe(yo, env, 'nadie') === 'forespot', 'una pedida de la que no soy no abre nada: se cae a lo de siempre');
rev(empresaDe({ acceso: { tipo: 'cliente', org_id: 'cli-org' }, orgs: [] }, env, 'acme') === 'cli-org', 'un cliente sigue siendo de su empresa, diga lo que diga el dominio');

console.log('· las cabeceras van juntas o no valen');
const h = (o) => new Request('https://quell101.acme.com/api/x', { headers: o });
rev(empresaPedida(h({ 'X-Dominio-Empresa': 'acme.com', 'X-Org-Empresa': 'acme' })) === 'acme', 'con las dos, se toma la empresa');
rev(empresaPedida(h({ 'X-Org-Empresa': 'acme' })) === null, 'X-Org-Empresa sola, a mano, no vale');
rev(empresaPedida(h({})) === null, 'y sin nada, null');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
