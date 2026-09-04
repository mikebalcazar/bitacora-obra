-- Cada cosa que se escribe sin señal lleva su propio identificador, hecho en el
-- dispositivo. Cuando la fila se vacía y algo se sube dos veces —porque la señal
-- se cayó justo al terminar y no se supo si llegó—, el servidor reconoce que ya
-- la había hecho y no la repite. Sin esto, una foto subida con mala señal
-- aparecería tres veces.
CREATE TABLE IF NOT EXISTS operaciones (
  id     TEXT PRIMARY KEY,
  cuando TEXT NOT NULL
);
