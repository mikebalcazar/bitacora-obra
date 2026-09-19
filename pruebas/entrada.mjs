/* Qué ofrece la pantalla de entrada, medido sobre LO ARMADO.
 *
 * El 16-sep-2026 la entrada se homologó por encargo de Mike: Google o correo y
 * contraseña, en todas las apps de la suite menos roster101. El código de 6
 * dígitos se queda, pero como recuperación, no como forma de entrar. Y el PIN
 * se fue del navegador.
 *
 * Esto se mide sobre `web/dist`, no sobre el código fuente, por la misma razón
 * que en quote101: lo que importa es lo que le llega a la gente. Un archivo
 * fuente puede tener el código nuevo y el paquete servido seguir siendo el
 * viejo, y eso no se ve leyendo el fuente. Las dos cosas se revisan, en ese
 * orden: primero el fuente (porque un error ahí se explica solo), luego lo
 * armado (porque es lo que se publica).
 *
 * No prueba que entrar funcione: eso pide la API y un navegador, y lo mide
 * `scripts/medir.mjs` contra lo publicado. Prueba que la pantalla no ofrezca lo
 * que ya no debe ofrecer, que es lo que un despliegue no enseña hasta que
 * alguien se queda afuera.
 *
 *   npm run build && node pruebas/entrada.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

/* Los comentarios se quitan antes de afirmar que algo NO está. Este archivo y
 * `Login.jsx` explican con letras lo que se quitó, y una afirmación sobre el
 * texto crudo se cacha a sí misma: pasó en el corte de dash101 ese mismo día. */
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

console.log('\n· el código fuente de la pantalla');
const login = sinComentarios(readFileSync(new URL('../web/src/Login.jsx', import.meta.url), 'utf8'));

rev(/entrarASuite\(\{\s*correo:\s*email,\s*clave\s*\}\)/.test(login),
  'entra con correo y contraseña');
rev(/entrarASuite\(\{\s*correo:\s*email,\s*codigo:\s*digitos\s*\}\)/.test(login),
  'y con el código, que es la recuperación');
rev(!/\bpin\b/i.test(login), 'no manda ningún PIN a la suite');
rev(!/ponerPin/.test(login), 'ya no pone PIN desde la entrada');
rev(/ponerClave/.test(login), 'pone la contraseña por la ruta de la suite');
rev(/irAGoogle/.test(login), 'y Google sigue ahí');

/* La regla que sostiene el «olvidé mi contraseña»: quien entra con un código y
 * no tiene contraseña NI Google ligado no puede seguir sin ponerla, porque el
 * código es de un solo uso y de diez minutos. Con Google NO se le pide, ni al
 * entrar con él ni después con un código: Google ya es una forma de entrar, y
 * pedirle una contraseña a quien no la necesita es un estorbo (contrato
 * 0.17.2; antes se la pedía a quien tenía Google ligado y ningún hueco por
 * donde volver que cubrir). */
rev(/!quien\.tiene_clave\s*&&\s*!quien\.tiene_google\s*&&\s*quien\.entro_con\s*===\s*'codigo'/.test(login),
  'a quien entró con código y no tiene contraseña ni Google se le pide ponerla');
/* Ésta es una guarda, no una prueba: con la pantalla vieja pasaba igual,
 * porque ahí ni existía `tiene_clave`. Sirve para el día que alguien escriba
 * `if (!quien.tiene_clave)` sin la otra mitad y le empiece a pedir contraseña
 * a quien entra con Google. */
rev(!/!quien\.tiene_clave\s*\)/.test(login),
  'y a quien entró con Google no se le pide nada (guarda)');

console.log('\n· el paquete armado, que es lo que le llega a la gente');
const assets = new URL('../web/dist/assets/', import.meta.url);
let armado = '';
try {
  for (const f of readdirSync(assets)) {
    if (/^index-.*\.js$/.test(f)) armado += readFileSync(new URL(f, assets), 'utf8');
  }
} catch {}
if (!armado) {
  rev(false, 'hay un paquete armado que medir', 'corre `npm run build` antes');
} else {
  rev(/Olvid[ée] mi contrase/i.test(armado), 'el paquete ofrece «Olvidé mi contraseña»');
  rev(/Entrar con Google/.test(armado), 'y «Entrar con Google»');
  /* `current-password` y `new-password` NO sirven para esto: el PIN viejo ya
   * los llevaba, así que la afirmación pasaba igual antes del cambio — o sea
   * que no medía nada. Se comprobó corriendo esta prueba contra el paquete
   * viejo. Lo que sí distingue es el `name`, que la pantalla vieja no tenía y
   * es lo que el administrador de contraseñas del teléfono necesita para
   * guardarla: en obra se teclea con una mano. */
  /* Las comillas van sueltas a propósito: este empaquetador emite las cadenas
   * con acento grave, no con comilla doble, y la primera versión de esta
   * afirmación buscaba `name:"password"` y fallaba con el campo bien puesto.
   * Suponer la forma del paquete en vez de mirarla es el mismo error de haber
   * buscado `/s101/auth/entrar` dentro del APK: el minificador no tiene por
   * qué escribirlo como uno lo escribió. */
  const nombrado = (n) => new RegExp(`name:["'\`]${n}["'\`]`).test(armado);
  rev(nombrado('password') && nombrado('new-password'),
    'lleva campos de contraseña con nombre, para que el teléfono los guarde',
    armado.match(/name:["'`][a-z-]*password["'`]/g)?.join(' ') ?? '(ninguno)');

  // Lo que ya no debe ofrecer. Son los textos exactos que traía la pantalla
  // vieja: si vuelve alguno, alguien deshizo la homologación.
  for (const fuera of ['Entrar con mi PIN', 'Mándame un código al correo', 'El PIN de seis dígitos que pusiste en la suite']) {
    rev(!armado.includes(fuera), `el paquete ya no ofrece «${fuera}»`);
  }
  rev(!/Guardar PIN y entrar/.test(armado), 'ni pone un PIN al entrar');
}

// El marcador dice cuántas pasaron, no cuántas fallaron: la primera versión
// imprimía «FALLAS: 13/15» con 13 buenas, que se lee exactamente al revés.
console.log(`\n${fallas ? `${fallas} FALLA${fallas > 1 ? 'S' : ''}` : 'todo bien'} · ${revisadas - fallas} de ${revisadas} pasaron\n`);
process.exit(fallas ? 1 : 0);
