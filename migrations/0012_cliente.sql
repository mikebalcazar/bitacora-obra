-- La cara de cliente (encargo de quell101 del 18-sep, trabajos B y C).
--
-- El cliente del taller entra a ver su obra: el taller le manda puntos que
-- definir y él contesta sobre el plano. Es un rol de cuenta nuevo, `cli`, y
-- no cabe en el CHECK de `users.role` ('admin','int','con').
--
-- Ampliar un CHECK en SQLite obliga a rehacer la tabla entera, y a `users` le
-- apunta media base (project_members, dudas, duda_respuestas, log_entries,
-- photos, elements, punch_items, element_contratistas). Soltar `users` con las
-- llaves foráneas prendidas —D1 las prende siempre— dispara el DELETE implícito
-- del DROP TABLE, y con él los ON DELETE CASCADE de las tablas hijas: se
-- llevaría las membresías, las dudas y las asignaciones por delante. No es un
-- riesgo teórico: es lo que dice la documentación de SQLite del DROP TABLE.
--
-- Por eso aquí no se rehace nada. La columna vieja se renombra —SQLite mueve
-- su CHECK con ella— y se agrega una `role` nueva con el CHECK ampliado, a la
-- que se le copian los valores. `role_viejo` se queda como peso muerto, con su
-- DEFAULT 'con' para que las altas no lo necesiten; ya nadie lo lee ni lo
-- escribe. Ninguna llave foránea se toca porque todas apuntan a `users(id)`.
ALTER TABLE users RENAME COLUMN role TO role_viejo;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'con' CHECK (role IN ('admin','int','con','cli'));
UPDATE users SET role = role_viejo;

-- A quién va dirigida cada duda. Las de siempre son del taller (el trabajador
-- le pregunta al supervisor). Las marcadas `cliente` son los puntos que
-- definir: las ve el cliente y las contesta. El filtro va en el servidor: el
-- cliente jamás recibe una duda interna, y esto es lo que lo hace posible.
ALTER TABLE dudas ADD COLUMN para TEXT NOT NULL DEFAULT 'taller' CHECK (para IN ('taller','cliente'));
CREATE INDEX IF NOT EXISTS idx_dudas_para ON dudas(project_id, para, estado);
