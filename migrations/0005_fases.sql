-- Un ítem pasa por dos fases, y no todos al mismo tiempo.
--
--   producción  se está fabricando o instalando. Se registra en su muro lo que
--               va pasando, y ya. No se le levantan pendientes: todavía no hay
--               nada entregado que corregir.
--   punchlist   ya se entregó. Ahora sí se le levantan los detalles que hay que
--               arreglar, y se cierran uno por uno.
--
-- Entre una y otra hay un acto: el supervisor lo da por entregado. Queda escrito
-- quién y cuándo, que es justo la fecha que después nadie recuerda.
ALTER TABLE elements ADD COLUMN fase TEXT NOT NULL DEFAULT 'produccion';
ALTER TABLE elements ADD COLUMN entregado_en TEXT;
ALTER TABLE elements ADD COLUMN entregado_por TEXT REFERENCES users(id);

-- Lo que ya estaba en la obra antes de que existieran las fases se usaba como
-- punchlist: dejarlo en producción escondería los pendientes que ya tiene.
UPDATE elements SET fase = 'punchlist' WHERE fase = 'produccion';

CREATE INDEX IF NOT EXISTS idx_elements_fase ON elements(plan_id, fase);
