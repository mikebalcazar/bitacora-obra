-- Cada pendiente puede traer nombre y apellido: el contratista al que le toca.
-- Hasta ahora "resp" era texto libre, servía para leerlo pero no para saber a
-- quién mostrarle qué. Con la asignación de verdad, un contratista entra y ve
-- nada más lo suyo.
ALTER TABLE punch_items ADD COLUMN assignee_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_punch_assignee ON punch_items(assignee_id, status);
