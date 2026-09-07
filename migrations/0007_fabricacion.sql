-- Faltaba una etapa: entre comprar el material y fletarlo, alguien lo fabrica.
INSERT OR IGNORE INTO etapas (clave, nombre, orden, abre_punchlist) VALUES
  ('fabricacion', 'Fabricación', 15, 0);

-- Meter una etapa en medio le abre un hueco a los ítems que ya iban avanzados:
-- un ítem con compras y flete pasaría a tener dos etapas de cinco con la de en
-- medio vacía, y el avance se cuenta suponiendo que el camino no tiene huecos.
-- Se rellena con el mismo criterio que se usa al palomear: lo que ya se fletó,
-- se instaló o se entregó, también se fabricó. La fecha que se le pone es la de
-- la primera etapa posterior que sí tiene, que es lo más cercano a la verdad
-- que se puede saber hoy; quién lo hizo no se inventa y queda vacío.
INSERT OR IGNORE INTO element_etapas (element_id, etapa, hecha_en, hecha_por)
  SELECT ee.element_id, 'fabricacion', MIN(ee.hecha_en), NULL
    FROM element_etapas ee JOIN etapas t ON t.clave = ee.etapa
   WHERE t.orden > 15
   GROUP BY ee.element_id;
