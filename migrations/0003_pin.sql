-- Entrar con PIN propio en vez de esperar un correo cada vez.
--
-- El código por correo no desaparece: sigue siendo la puerta la primera vez y
-- cuando alguien olvida su PIN. Pero en obra, con la señal que hay, esperar un
-- correo para abrir el plano es lo que hace que la gente deje de usar la app.
--
-- Un PIN de seis dígitos son un millón de combinaciones: poco, si se deja probar
-- sin freno. Por eso se guarda derivado (PBKDF2, no en claro) y los intentos
-- fallidos bloquean, primero minutos y luego horas.
ALTER TABLE users ADD COLUMN pin_hash TEXT;
ALTER TABLE users ADD COLUMN pin_salt TEXT;
ALTER TABLE users ADD COLUMN pin_set_at TEXT;
ALTER TABLE users ADD COLUMN pin_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pin_castigos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pin_locked_until TEXT;

-- Freno por dirección de internet, aparte del freno por usuario: que nadie
-- pueda probar PINes de mucha gente a la vez desde un mismo lugar.
CREATE TABLE IF NOT EXISTS pin_intentos (
  ip            TEXT PRIMARY KEY,
  fails         INTEGER NOT NULL DEFAULT 0,
  castigos      INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  visto_en      TEXT NOT NULL
);
