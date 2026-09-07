-- El camino de un ítem antes de entregarse.
--
-- Hasta ahora un ítem sólo sabía dos cosas de sí mismo: si estaba en producción
-- o ya entregado. Pero "en producción" dura meses y adentro pasan cosas que hoy
-- no se ven en ningún lado: si ya se compró el material, si ya salió el flete,
-- si ya se instaló. Eso es lo que se apunta aquí, una casilla por etapa.
--
-- Las etapas viven en una tabla y no en el código a propósito: todavía no están
-- decididas. Agregar una, quitarla o cambiarle el nombre es un INSERT, no una
-- versión nueva de la aplicación.
CREATE TABLE IF NOT EXISTS etapas (
  clave          TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  orden          INTEGER NOT NULL,
  -- La etapa que abre el punchlist. Es una sola, y es la que parte la vida del
  -- ítem en dos: antes se fabrica, después se corrige.
  abre_punchlist INTEGER NOT NULL DEFAULT 0,
  activa         INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO etapas (clave, nombre, orden, abre_punchlist) VALUES
  ('compras',     'Compras',     10, 0),
  ('flete',       'Flete',       20, 0),
  ('instalacion', 'Instalación', 30, 0),
  ('entrega',     'Entrega',     40, 1);

-- Una fila por etapa cumplida. Queda escrito quién y cuándo: en obra la fecha
-- en que salió el flete es justo la que después nadie recuerda.
CREATE TABLE IF NOT EXISTS element_etapas (
  element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  etapa      TEXT NOT NULL REFERENCES etapas(clave),
  hecha_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  hecha_por  TEXT REFERENCES users(id),
  PRIMARY KEY (element_id, etapa)
);
CREATE INDEX IF NOT EXISTS idx_element_etapas ON element_etapas(element_id);

-- Los ítems que ya estaban entregados no empiezan de cero: si están en
-- punchlist es que pasaron por todo, así que se les dan todas las etapas por
-- cumplidas, con la fecha de entrega que ya tenían.
INSERT OR IGNORE INTO element_etapas (element_id, etapa, hecha_en, hecha_por)
  SELECT e.id, t.clave, COALESCE(e.entregado_en, e.created_at), e.entregado_por
  FROM elements e, etapas t
  WHERE e.fase = 'punchlist';
