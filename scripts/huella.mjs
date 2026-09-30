/* La huella de la app, en un archivo público (30-sep-2026).
 *
 * `dist/huella.txt` es la sha256 del index.html armado. La pantalla la pide
 * cada 2 minutos y, si cambió desde que se abrió, avisa que hay versión
 * nueva (web/src/VersionNueva.jsx). No dice nada de nadie: es la huella del
 * archivo, no un dato. Corre después de `vite build` (package.json → build). */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const DIST = fileURLToPath(new URL('../web/dist/', import.meta.url));
const huella = createHash('sha256').update(await readFile(DIST + 'index.html')).digest('hex');
await writeFile(DIST + 'huella.txt', huella + '\n');
console.log(`huella.txt: sha256 de index.html ${huella.slice(0, 12)}…`);
