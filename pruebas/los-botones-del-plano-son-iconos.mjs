/* «Imprimir» y «Compartir» del plano son puro ícono (5-oct-2026).
 *
 * Mike, con una captura de escritorio donde los selectores de la derecha se
 * salían del borde: «Aquí ya no se ven los siguientes botones. Hay que hacer
 * puro ícono el "imprimir" y el "compartir"».
 *
 * Lo que se mide sin navegador: que los dos botones sean un cuadrado con un
 * dibujo y sin palabra a la vista, que la palabra siga en `title` y en
 * `aria-label` (para el lector de pantalla), que exista el estilo del botón
 * de ícono, que el botón de planos sea el que cede espacio, y que lo armado
 * lo traiga.
 *
 *   npm run build && node pruebas/los-botones-del-plano-son-iconos.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const proy = readFileSync('web/src/Project.jsx', 'utf8');
const fotos = readFileSync('web/src/Fotos.jsx', 'utf8');
const css = readFileSync('web/src/styles.css', 'utf8');

console.log('· imprimir');
const imprimir = proy.match(/<button className="btn sm ico" onClick=\{\(\) => window\.print\(\)\}[^>]*>[\s\S]*?<\/button>/);
rev(!!imprimir, 'el botón de imprimir es un .btn.ico');
rev(!!imprimir && /aria-label="Imprimir"/.test(imprimir[0]) && /title="Imprimir este plano con los códigos"/.test(imprimir[0]), 'con la palabra en aria-label y en title');
rev(!!imprimir && /ICO\.imprimir/.test(imprimir[0]), 'y el dibujo de la impresora');
rev(!!imprimir && !/>\s*Imprimir\s*</.test(imprimir[0]), 'sin la palabra a la vista');
rev(/imprimir: '<svg /.test(proy), 'el dibujo existe en ICO');

console.log('· compartir');
const compartir = proy.match(/<BotonCompartir url=\{fileUrl\(archivoDelPlano\(plan\)\.llave\)\}[^>]*>[\s\S]*?<\/BotonCompartir>/);
rev(!!compartir, 'el botón de compartir del plano trae su contenido');
rev(!!compartir && /className="btn sm ico"/.test(compartir[0]) && /etiqueta="Compartir"/.test(compartir[0]), 'es un .btn.ico con etiqueta «Compartir»');
rev(!!compartir && /ICO\.compartir/.test(compartir[0]), 'y el dibujo de compartir');
rev(/compartir: '<svg /.test(proy), 'el dibujo existe en ICO');
rev(/etiqueta \}\) \{/.test(fotos) && /aria-label=\{etiqueta\}/.test(fotos), 'BotonCompartir pone la etiqueta en aria-label');
rev(/\{ocupado \? \(etiqueta \? '…' : 'Preparando…'\) : children\}/.test(fotos), 'y mientras baja, un botón de ícono enseña «…», no «Preparando…»');
rev(/<BotonCompartir url=\{url\} nombre=\{nombre\} className="btn" \/>/.test(fotos), 'la foto ampliada sigue con la palabra: ahí sí cabe');

console.log('· el estilo');
rev(/\.btn\.ico\{[^}]*width:32px[^}]*height:32px/.test(css) && /\.btn\.ico\{[^}]*padding:0/.test(css), '.btn.ico es un cuadrado de 32 sin relleno');
rev(/\.btn\.ico i\{[^}]*width:16px/.test(css), 'con el dibujo de 16');
rev(/\.stage \.tools \.btn\.planos\{flex:0 1 auto;min-width:120px\}/.test(css), 'en la barra, el botón de planos es el que cede (se recorta con «…»)');

console.log('· lo armado lo trae');
const dir = 'web/dist/assets';
const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
// El empaquetador escribe las cadenas con comillas o con acentos graves, según le convenga.
rev(/"aria-label":[`"]Imprimir[`"]/.test(js) && /etiqueta:[`"]Compartir[`"]/.test(js), 'los dos botones de ícono están en el JavaScript publicado');
const cssPub = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
rev(/\.btn\.ico\{/.test(cssPub), 'y el estilo en el CSS publicado');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
