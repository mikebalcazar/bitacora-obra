-- Fotos en las dudas. En obra una duda casi siempre es "mira esto", y la
-- respuesta muchas veces es "así": llevan foto la pregunta y la respuesta.
--
-- Quién puede ser dueño de una foto vive en un CHECK, y en SQLite un CHECK no
-- se altera: hay que rehacer la tabla. Aquí sí se puede, y por una razón
-- concreta: a photos no le apunta nadie. Es una hoja del árbol —referencia a
-- users, pero ninguna otra tabla la referencia a ella— así que soltarla y
-- volverla a armar no deja llaves foráneas colgando. Con la tabla de usuarios
-- no pasaba eso: media base le apunta, y por eso ahí se buscó otro camino.
CREATE TABLE photos_nuevo (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('log','punch','duda','duda_resp')),
  owner_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  size INTEGER,
  user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO photos_nuevo (id, owner_type, owner_id, r2_key, file_name, width, height, size, user_id, created_at)
  SELECT id, owner_type, owner_id, r2_key, file_name, width, height, size, user_id, created_at FROM photos;
DROP TABLE photos;
ALTER TABLE photos_nuevo RENAME TO photos;
CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_type, owner_id);
