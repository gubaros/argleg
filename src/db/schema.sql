-- argleg SQLite schema (source of truth for the legal corpus).
-- All statements are idempotent; safe to run multiple times.

CREATE TABLE IF NOT EXISTS normas (
  id                          TEXT PRIMARY KEY,
  tier                        TEXT NOT NULL,           -- LegalTier enum (see src/laws/hierarchy.ts)
  numero                      TEXT,
  titulo                      TEXT NOT NULL,
  nombre_corto                TEXT,
  jurisdiccion                TEXT NOT NULL DEFAULT 'nacional',
  pais                        TEXT NOT NULL DEFAULT 'Argentina',
  autoridad_emisora           TEXT,
  fecha_sancion               TEXT,
  fecha_promulgacion          TEXT,
  fecha_publicacion           TEXT,
  fuente_nombre               TEXT,
  fuente_url                  TEXT,
  estado_vigencia             TEXT NOT NULL DEFAULT 'desconocido',
  fecha_ultima_actualizacion  TEXT,
  texto_ordenado              INTEGER DEFAULT 0,
  materias                    TEXT,                    -- JSON array string
  notas                       TEXT
);

CREATE INDEX IF NOT EXISTS idx_normas_tier ON normas(tier);

CREATE TABLE IF NOT EXISTS articulos (
  id        TEXT PRIMARY KEY,
  norma_id  TEXT NOT NULL,
  numero    TEXT NOT NULL,
  texto     TEXT NOT NULL,
  orden     INTEGER NOT NULL,
  epigrafe  TEXT,
  FOREIGN KEY (norma_id) REFERENCES normas(id)
);

CREATE INDEX IF NOT EXISTS idx_articulos_norma_orden
  ON articulos(norma_id, orden);

CREATE INDEX IF NOT EXISTS idx_articulos_norma_numero
  ON articulos(norma_id, numero);

CREATE TABLE IF NOT EXISTS estructura_normativa (
  id         TEXT PRIMARY KEY,
  norma_id   TEXT NOT NULL,
  parent_id  TEXT,
  tipo       TEXT NOT NULL,
  nombre     TEXT,
  orden      INTEGER NOT NULL,
  FOREIGN KEY (norma_id) REFERENCES normas(id),
  FOREIGN KEY (parent_id) REFERENCES estructura_normativa(id)
);

CREATE INDEX IF NOT EXISTS idx_estructura_norma
  ON estructura_normativa(norma_id, orden);

CREATE TABLE IF NOT EXISTS articulo_estructura (
  articulo_id    TEXT NOT NULL,
  estructura_id  TEXT NOT NULL,
  PRIMARY KEY (articulo_id, estructura_id),
  FOREIGN KEY (articulo_id) REFERENCES articulos(id),
  FOREIGN KEY (estructura_id) REFERENCES estructura_normativa(id)
);

CREATE TABLE IF NOT EXISTS relaciones_normativas (
  id                TEXT PRIMARY KEY,
  norma_origen_id   TEXT NOT NULL,
  norma_destino_id  TEXT,
  tipo_relacion     TEXT NOT NULL,
  descripcion       TEXT,
  fuente            TEXT,
  FOREIGN KEY (norma_origen_id) REFERENCES normas(id),
  FOREIGN KEY (norma_destino_id) REFERENCES normas(id)
);

-- ─── Capa de inteligencia jurídica ──────────────────────────────────────────
-- Tablas que extienden el corpus normativo con conocimiento de dominio:
-- ramas del derecho, principios, doctrina y jurisprudencia.

CREATE TABLE IF NOT EXISTS ramas_derecho (
  id           TEXT PRIMARY KEY,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  ambito       TEXT NOT NULL DEFAULT 'mixto',  -- publico | privado | social | mixto
  es_codificada INTEGER NOT NULL DEFAULT 0      -- 1 si tiene codificación de fondo
);

CREATE TABLE IF NOT EXISTS principios_juridicos (
  id            TEXT PRIMARY KEY,
  rama_id       TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  enunciado     TEXT NOT NULL,
  fuente        TEXT,
  vigencia      TEXT NOT NULL DEFAULT 'positivado',  -- dogmatico | positivado | controvertido
  FOREIGN KEY (rama_id) REFERENCES ramas_derecho(id)
);

CREATE INDEX IF NOT EXISTS idx_principios_rama ON principios_juridicos(rama_id);

-- Many-to-many: una norma puede aplicar a varias ramas (p.ej., el CCyC al
-- derecho civil y al comercial, en la integración post-2015).
CREATE TABLE IF NOT EXISTS norma_rama (
  norma_id     TEXT NOT NULL,
  rama_id      TEXT NOT NULL,
  relevancia   TEXT NOT NULL DEFAULT 'nuclear',  -- nuclear | complementaria | tangencial
  PRIMARY KEY (norma_id, rama_id),
  FOREIGN KEY (norma_id) REFERENCES normas(id),
  FOREIGN KEY (rama_id) REFERENCES ramas_derecho(id)
);

CREATE TABLE IF NOT EXISTS doctrina (
  id              TEXT PRIMARY KEY,
  autor           TEXT NOT NULL,
  obra            TEXT NOT NULL,
  ano_publicacion INTEGER,
  rama_id         TEXT,
  tipo            TEXT NOT NULL DEFAULT 'tratado',  -- tratado | manual | monografia | articulo
  citacion        TEXT,
  notas           TEXT,
  FOREIGN KEY (rama_id) REFERENCES ramas_derecho(id)
);

CREATE INDEX IF NOT EXISTS idx_doctrina_rama ON doctrina(rama_id);

-- Espacio reservado para jurisprudencia. La carga es un trabajo de curación
-- separado y se hace vía scripts dedicados (no automatizado todavía).
CREATE TABLE IF NOT EXISTS jurisprudencia (
  id                TEXT PRIMARY KEY,
  caratula          TEXT NOT NULL,
  tribunal          TEXT NOT NULL,
  fecha             TEXT,                   -- ISO YYYY-MM-DD
  fallo_tipo        TEXT,                   -- definitiva | interlocutoria | dictamen
  doctrina_extraida TEXT,                   -- "regla del fallo" / holding
  rama_id           TEXT,
  fuente            TEXT,                   -- URL o cita de SAIJ/Fallos
  FOREIGN KEY (rama_id) REFERENCES ramas_derecho(id)
);

-- M:N entre jurisprudencia y normas aplicadas.
CREATE TABLE IF NOT EXISTS jurisprudencia_norma (
  jurisprudencia_id TEXT NOT NULL,
  norma_id          TEXT NOT NULL,
  articulo_id       TEXT,                   -- opcional; cita a artículo específico
  PRIMARY KEY (jurisprudencia_id, norma_id, articulo_id),
  FOREIGN KEY (jurisprudencia_id) REFERENCES jurisprudencia(id),
  FOREIGN KEY (norma_id) REFERENCES normas(id),
  FOREIGN KEY (articulo_id) REFERENCES articulos(id)
);

CREATE INDEX IF NOT EXISTS idx_jurisprudencia_rama ON jurisprudencia(rama_id);
