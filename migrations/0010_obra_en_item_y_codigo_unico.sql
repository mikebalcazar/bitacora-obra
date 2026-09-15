-- 0010_obra_en_item_y_codigo_unico.sql
--
-- Dos cosas, y la segunda depende de la primera.
--
-- 1. El ítem ya sabía en qué plano está, pero no en qué obra. Para saberlo
--    había que pasar por `plans` en cada consulta. Ahora lo guarda.
--
-- 2. Con la obra a la mano, la base puede impedir que dos ítems de la misma
--    obra tengan el mismo código. Antes no podía, y por eso pasó lo que pasó:
--    la obra Sanje CC 37 tuvo dos ítems `MW-07`, uno en Planta Alta y otro en
--    Planta Baja. Nadie podía saber a cuál se refería un renglón de bitácora.
--    Se corrigió a mano el 12-sep (el de Planta Baja, «Mueble TV PB», pasó a
--    MW-11) y se verificó que no quedara ningún otro repetido: 0 en las dos
--    obras, 62 ítems en total, ninguno huérfano de obra.
--
-- Por qué el índice y no una revisión en el servidor: el `MW-07` duplicado
-- entró justamente porque la única cerradura vivía en el código. Una ruta
-- nueva que se olvide de preguntar vuelve a abrir la puerta; el índice no se
-- olvida.

-- La columna va sin NOT NULL a propósito: SQLite no deja agregar una columna
-- obligatoria con llave foránea a una tabla que ya tiene renglones, y volver a
-- construir `elements` significaría mover las llaves foráneas que le apuntan
-- desde punch_items, log_entries, photos y element_etapas. Se llena aquí
-- mismo y el servidor la escribe siempre al crear un ítem.
ALTER TABLE elements ADD COLUMN project_id TEXT REFERENCES projects(id);

-- Llenar la obra de los 62 ítems que ya existen, sacándola de su plano.
UPDATE elements
   SET project_id = (SELECT pl.project_id FROM plans pl WHERE pl.id = elements.plan_id)
 WHERE project_id IS NULL;

-- La cerradura. Si alguna vez vuelve a haber un repetido en la misma obra,
-- esta migración falla y no se publica: es lo que se quiere.
CREATE UNIQUE INDEX IF NOT EXISTS idx_elements_obra_codigo
    ON elements(project_id, code);

-- Para proponer el siguiente número por tipo dentro de una obra sin recorrer
-- la tabla entera.
CREATE INDEX IF NOT EXISTS idx_elements_obra_tipo
    ON elements(project_id, type);
