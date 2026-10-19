-- ==========================================================
-- MISIÓN BAJO CONTROL · Esquema de Base de Datos para Neon (PostgreSQL)
-- ==========================================================

-- 1. Tabla de Equipos (Información principal, progreso, intentos, puntaje total y definitivos)
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    shift VARCHAR(50) DEFAULT '',
    color INT DEFAULT 0,
    total INT DEFAULT 0,
    score_l1 INT DEFAULT 0,
    score_l2 INT DEFAULT 0,
    score_l3 INT DEFAULT 0,
    score_l4 INT DEFAULT 0,
    score_l5 INT DEFAULT 0,
    unlocked JSONB DEFAULT '{}'::jsonb,
    attempts JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migración segura si la tabla ya existía:
ALTER TABLE teams ADD COLUMN IF NOT EXISTS score_l1 INT DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS score_l2 INT DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS score_l3 INT DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS score_l4 INT DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS score_l5 INT DEFAULT 0;

-- Índice para acelerar el ranking y consultas por puntaje total
CREATE INDEX IF NOT EXISTS idx_teams_total ON teams (total DESC);

-- 2. Tabla de Configuración Global (PIN de calidad, versión)
CREATE TABLE IF NOT EXISTS app_config (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla Histórica / Detallada de Intentos (Para reportes y auditoría de Calidad)
CREATE TABLE IF NOT EXISTS attempt_logs (
    id SERIAL PRIMARY KEY,
    team_id VARCHAR(50) REFERENCES teams(id) ON DELETE CASCADE,
    level INT NOT NULL,
    attempt_type VARCHAR(20) NOT NULL, -- 'practice', 'practice2', 'final'
    status VARCHAR(20) NOT NULL,       -- 'en curso', 'completado'
    score INT DEFAULT 0,
    success BOOLEAN DEFAULT FALSE,
    reason VARCHAR(50),
    cpk NUMERIC(6,2),
    cp NUMERIC(6,2),
    in_ctrl INT,
    quiz BOOLEAN,
    rings VARCHAR(20),
    signals JSONB,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_attempt_logs_team_level ON attempt_logs (team_id, level);

-- 4. Inserción inicial de los 12 equipos de planta (Semilla inicial)
INSERT INTO teams (id, name, shift, color, total, unlocked, attempts, created_at)
VALUES
    ('mv9z71b79ipggi', 'BLUCOSH', '', 1, 0, '{}', '{}', NOW()),
    ('mv9z5qn50wze3k', 'CENTINELAS DEL MÉTODO', '', 3, 0, '{}', '{}', NOW()),
    ('mv9z66qra77opu', 'DREAM TEAM', '', 7, 0, '{}', '{}', NOW()),
    ('mv9z6ujp18zhg8', 'EL MEJOR EQUIPO', '', 9, 0, '{}', '{}', NOW()),
    ('mv9z7crhd99qki', 'GUARDIANES DE LA CALIDAD', '', 5, 0, '{}', '{}', NOW()),
    ('mv9z7tfhn9d1hb', 'LOS CONFIABLES', '', 11, 0, '{}', '{}', NOW()),
    ('mv9z7lrsju4sz8', 'LOS EXPORTADORES', '', 10, 0, '{}', '{}', NOW()),
    ('mv9z6hgvaf9soa', 'LOS GENIOS DE LAS ETIQUETAS', '', 8, 0, '{}', '{}', NOW()),
    ('mv9z6q7ogtjne9', 'TEAM CHAMPION LABEL', '', 4, 0, '{}', '{}', NOW()),
    ('mv9z60ixnqro4a', 'TEAM KAIZEN', '', 2, 0, '{}', '{}', NOW()),
    ('mv9z6biipkt6qo', 'TEAM MAZTER', '', 6, 0, '{}', '{}', NOW()),
    ('mv9z0xoa4j0o7m', 'ÁREA 51', '', 0, 0, '{}', '{}', NOW())
ON CONFLICT (id) DO NOTHING;
