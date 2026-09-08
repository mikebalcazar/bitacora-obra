-- Dos cosas: quién entra a una obra sin poder moverle nada, y las dudas.
--
-- El rol va en la membresía y no en la persona, a propósito. La misma persona
-- es contratista en una obra —donde solo le tocan sus pendientes— y trabajador
-- en otra —donde anda todo el día y necesita ver el proyecto completo—. Un rol
-- global no puede decir las dos cosas a la vez.
--
-- Y de paso se evita rehacer la tabla de usuarios: el rol de siempre vive en un
-- CHECK, y en SQLite un CHECK no se altera sin reconstruir la tabla entera, con
-- todas las llaves foráneas apuntándole. Esto es una columna nueva.
--
--   con  contratista: ve nada más los pendientes que traen su nombre.
--   tra  trabajador:  ve la obra completa —planos, ítems, bitácora, punchlist—
--                     y no escribe nada, salvo sus dudas.
ALTER TABLE project_members ADD COLUMN rol TEXT NOT NULL DEFAULT 'con';

-- Las dudas de obra.
--
-- Una duda es de la obra, no de un ítem: casi siempre se pregunta antes de
-- saber a qué ítem pertenece la respuesta. Si se sabe, se cuelga del ítem y
-- desde la duda se puede saltar a él.
--
-- Al supervisor le llegan en fila, la más vieja primero, y las va cerrando. El
-- estado es de la duda entera y no de cada respuesta: lo que se resuelve es la
-- pregunta, aunque haya hecho falta un ida y vuelta.
CREATE TABLE IF NOT EXISTS dudas (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  element_id   TEXT REFERENCES elements(id) ON DELETE SET NULL,
  user_id      TEXT NOT NULL REFERENCES users(id),
  texto        TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','resuelta')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resuelta_en  TEXT,
  resuelta_por TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_dudas_proyecto ON dudas(project_id, estado, created_at);
CREATE INDEX IF NOT EXISTS idx_dudas_quien ON dudas(user_id, created_at);

CREATE TABLE IF NOT EXISTS duda_respuestas (
  id         TEXT PRIMARY KEY,
  duda_id    TEXT NOT NULL REFERENCES dudas(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  texto      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_duda_respuestas ON duda_respuestas(duda_id, created_at);
