-- Bitácora de Obra — esquema inicial (D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'con' CHECK (role IN ('admin','int','con')),
  company TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','cerrado')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL,          -- R2: PNG rasterizado del plano
  source_key TEXT,                  -- R2: PDF/imagen original
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_id);

CREATE TABLE IF NOT EXISTS elements (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Otro',
  name TEXT NOT NULL,
  resp TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL,                  -- 0..1 relativo al ancho del plano
  y REAL NOT NULL,                  -- 0..1 relativo al alto
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_elements_plan ON elements(plan_id);

CREATE TABLE IF NOT EXISTS log_entries (
  id TEXT PRIMARY KEY,
  element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'trabajo' CHECK (kind IN ('trabajo','arreglo','acuerdo')),
  text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_log_element ON log_entries(element_id, created_at);

CREATE TABLE IF NOT EXISTS punch_items (
  id TEXT PRIMARY KEY,
  element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pend' CHECK (status IN ('pend','proc','ok')),
  resp TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  done_at TEXT,
  done_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_punch_element ON punch_items(element_id, status);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('log','punch')),
  owner_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  size INTEGER,
  user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_type, owner_id);
