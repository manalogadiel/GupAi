BEGIN;
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    nickname TEXT,
    preferred_visit_id TEXT REFERENCES visits(id),
    retention_consent_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consultations (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES customers(id),
    status TEXT NOT NULL CHECK (status IN ('active','completed','abandoned')),
    stage TEXT NOT NULL CHECK (stage IN ('photos','goal','reveal','sides','top','summary','cutting','done','abandoned')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    state_json TEXT NOT NULL,
    pair_code_hash TEXT,
    pair_expires_at TEXT,
    phone_token_hash TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    chair_label TEXT
);
CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    consultation_id TEXT NOT NULL REFERENCES consultations(id),
    speaker TEXT NOT NULL CHECK (speaker IN ('customer','barber')),
    input_type TEXT NOT NULL CHECK (input_type IN ('typed','voice','chip','photo','audio','observation','observation_add','face_shape','select_option','resolve_conflict','stage','problem','reveal','pick_style','choose_part')),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    consultation_id TEXT NOT NULL REFERENCES consultations(id),
    kind TEXT NOT NULL CHECK (kind IN ('photo','audio')),
    view TEXT CHECK (view IN ('front','side')),
    storage_key TEXT NOT NULL UNIQUE,
    keep INTEGER NOT NULL DEFAULT 0 CHECK (keep IN (0,1)),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agreements (
    id TEXT PRIMARY KEY,
    consultation_id TEXT NOT NULL REFERENCES consultations(id),
    version INTEGER NOT NULL CHECK (version >= 1),
    plan_json TEXT NOT NULL,
    customer_confirmed_at TEXT,
    barber_confirmed_at TEXT,
    UNIQUE (consultation_id, version)
);
CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    consultation_id TEXT NOT NULL REFERENCES consultations(id),
    agreement_id TEXT NOT NULL REFERENCES agreements(id),
    actual_notes TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    rating INTEGER,
    rating_tags TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    consultation_id TEXT NOT NULL REFERENCES consultations(id),
    type TEXT NOT NULL CHECK (type IN ('transcribe','observe','faceshape','propose','chat','recommend','suggest','checkpoint')),
    requested_revision INTEGER NOT NULL CHECK (requested_revision >= 0),
    status TEXT NOT NULL CHECK (status IN ('queued','running','done','failed','cancelled','stale')),
    result_json TEXT,
    error_code TEXT,
    started_at TEXT,
    finished_at TEXT
);
-- Face shape remains inside consultations.state_json; no landmarks or embeddings.
PRAGMA user_version=2;
COMMIT;
