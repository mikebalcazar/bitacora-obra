/* La cerradura del código del ítem, probada sobre SQLite de verdad.
 *
 * La migración 0010 es SQL, y el SQL no se prueba con un doble: se prueba
 * corriéndolo. Aquí se aplican las diez migraciones en orden sobre una base en
 * memoria, se llena con lo que hay en una obra real —dos planos, ítems con
 * código— y se comprueba lo único que importa: que la base misma impida dos
 * códigos iguales dentro de una obra, y que no estorbe en los casos que sí son
 * legítimos.
 *
 * Es lo que faltaba el día del `MW-07` repetido en Sanje CC 37: la revisión
 * vivía en ningún lado.
 *
 *     node pruebas/codigo-unico.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRACIONES = new URL('../migrations/', import.meta.url).pathname;

let fallas = 0, revisadas = 0;
const rev = (ok, que, dato = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};

/** Corre y devuelve el error si lo hubo, o null. */
function intenta(db, sql, ...args) {
  try { db.prepare(sql).run(...args); return null; }
  catch (e) { return e; }
}

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');

console.log('\nLas migraciones corren en orden sobre SQLite de verdad:');
const archivos = readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort();
for (const f of archivos) {
  try { db.exec(readFileSync(join(MIGRACIONES, f), 'utf8')); }
  catch (e) { rev(false, `aplica ${f}`, String(e.message)); process.exit(1); }
}
rev(true, `aplican las ${archivos.length} migraciones`, archivos[archivos.length - 1]);

// Una obra como las de verdad: dos plantas, ítems con su código.
db.exec(`
  INSERT INTO projects (id, name) VALUES ('obra-a', 'Sanje CC 37'), ('obra-b', 'Otra obra');
  INSERT INTO plans (id, project_id, name, image_key, width, height) VALUES
    ('pa', 'obra-a', 'Planta Alta', 'k/pa.png', 2000, 1400),
    ('pb', 'obra-a', 'Planta Baja', 'k/pb.png', 2000, 1400),
    ('p2', 'obra-b', 'Único',       'k/p2.png', 2000, 1400);
`);
const meteItem = (id, plan, obra, code) =>
  intenta(db, `INSERT INTO elements (id, plan_id, project_id, code, name, x, y) VALUES (?,?,?,?,?,0.5,0.5)`,
    id, plan, obra, code, 'Mueble ' + id);

console.log('\nLa cerradura:');
rev(meteItem('i1', 'pa', 'obra-a', 'MW-07') === null, 'el primer MW-07 de la obra entra');

// Esto es exactamente lo que pasó el 12-sep: mismo código, otra planta, misma obra.
const choque = meteItem('i2', 'pb', 'obra-a', 'MW-07');
rev(choque !== null, 'el segundo MW-07 en otra planta de LA MISMA obra se rechaza');
rev(/UNIQUE constraint failed: elements\.project_id, elements\.code/.test(String(choque?.message)),
  'y lo rechaza la base, con el error que el Worker sabe traducir', String(choque?.message).slice(0, 70));

rev(meteItem('i3', 'p2', 'obra-b', 'MW-07') === null, 'el mismo código en OTRA obra sí entra: no se pisan entre obras');
rev(meteItem('i4', 'pa', 'obra-a', 'MW-08') === null, 'otro código en la misma obra entra');

console.log('\nLos que todavía no tienen código:');
rev(meteItem('s1', 'pa', 'obra-a', '') === null, 'un ítem sin código entra');
rev(meteItem('s2', 'pb', 'obra-a', '') === null, 'y un segundo sin código también: el índice es parcial, no los cuenta');
const yaConCodigo = intenta(db, `UPDATE elements SET code = 'MW-07' WHERE id = 's1'`);
rev(yaConCodigo !== null, 'pero en cuanto a uno se le pone un código que ya existe, se rechaza');

console.log('\nCambiar el código de un ítem que ya está:');
rev(intenta(db, `UPDATE elements SET code = 'MW-99' WHERE id = 'i4'`) === null, 'a uno libre, sí');
rev(intenta(db, `UPDATE elements SET code = 'MW-07' WHERE id = 'i4'`) !== null, 'a uno que ya existe en la obra, no');

console.log('\nEl relleno de la obra en los ítems que ya existían:');
{
  // Una base como estaba ANTES de la 0010: se aplican las nueve primeras,
  // se meten ítems sin obra, y luego la décima.
  const vieja = new DatabaseSync(':memory:');
  for (const f of archivos.filter((x) => !x.startsWith('0010'))) vieja.exec(readFileSync(join(MIGRACIONES, f), 'utf8'));
  vieja.exec(`
    INSERT INTO projects (id, name) VALUES ('o1', 'Obra vieja');
    INSERT INTO plans (id, project_id, name, image_key, width, height) VALUES ('pl1', 'o1', 'Plano', 'k/pl1.png', 2000, 1400);
    INSERT INTO elements (id, plan_id, code, name, x, y) VALUES
      ('v1', 'pl1', 'MW-01', 'Uno', 0.1, 0.1), ('v2', 'pl1', 'MW-02', 'Dos', 0.2, 0.2);
  `);
  vieja.exec(readFileSync(join(MIGRACIONES, '0010_obra_en_item_y_codigo_unico.sql'), 'utf8'));
  const { n } = vieja.prepare(`SELECT COUNT(*) AS n FROM elements WHERE project_id = 'o1'`).get();
  rev(n === 2, 'los ítems que ya existían quedan con su obra puesta', `${n} de 2`);
  const sinObra = vieja.prepare(`SELECT COUNT(*) AS n FROM elements WHERE project_id IS NULL`).get().n;
  rev(sinObra === 0, 'y ninguno se queda sin obra', String(sinObra));
}

console.log();
if (fallas) { console.log(`FALLAS: ${fallas} de ${revisadas}`); process.exit(1); }
console.log(`Medido: ${revisadas} comprobaciones del código único, en verde.`);
