-- 0011_contratistas_por_item.sql
--
-- Un ítem puede tener varios contratistas, y un contratista ve todo el plano
-- con los suyos resaltados (encargo de quell101, 18-sep-2026, decisiones 1-5
-- de Mike).
--
-- Hasta hoy la única asignación era por pendiente (`punch_items.assignee_id`,
-- de a uno) y `elements.resp` era texto libre que no liga a ninguna cuenta.
-- Las dos se quedan como están: la de pendiente sigue mandando en cada
-- pendiente, y `resp` es de sólo lectura (decisión 6: no se migra, no se
-- borra, no se escribe más).
--
-- Llave compuesta para que nadie quede asignado dos veces al mismo ítem;
-- borrado en cascada desde las dos puntas (se va el ítem o se va el usuario,
-- se va la asignación, no el ítem); índice por usuario porque la consulta
-- que más corre es «cuáles ítems son de éste». Quién asignó y cuándo se
-- guarda para cuando alguien reclame que no le avisaron.
CREATE TABLE IF NOT EXISTS element_contratistas (
  element_id  TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asignado_por TEXT REFERENCES users(id),
  asignado_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (element_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_element_contratistas_user ON element_contratistas(user_id);
