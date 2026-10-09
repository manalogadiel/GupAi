"""SQLite connections and C1 startup initialization."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "gupai.db"
SCHEMA_PATH = Path(__file__).with_name("schema.sql")


@contextmanager
def connect(path=None):
    conn = sqlite3.connect(path if path is not None else DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def initialize(path=None):
    target = Path(path if path is not None else DB_PATH)
    target.parent.mkdir(parents=True, exist_ok=True)
    with connect(target) as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8-sig"))
        elif version in (1, 2, 3):
            if version == 1:
                _upgrade_v2(conn)
            _rebuild_media(conn)
        elif version != 4:
            raise RuntimeError("Unsupported database schema version.")


def _upgrade_v2(conn):
    """Rebuild v1 CHECK constraints in one transaction without breaking FK targets."""
    from .consult import empty_state

    schema = SCHEMA_PATH.read_text(encoding="utf-8-sig")
    stages = {"created": "photos", "concern": "goal", "observations": "reveal",
              "options": "sides", "agreement": "summary", "completed": "done"}
    conn.execute("PRAGMA foreign_keys=OFF")
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("ALTER TABLE visits ADD COLUMN rating INTEGER")
        conn.execute("ALTER TABLE visits ADD COLUMN rating_tags TEXT")
        conn.execute("ALTER TABLE consultations ADD COLUMN chair_label TEXT")
        # SQLite cannot ALTER a CHECK. Identifiers below come only from our schema,
        # never from request data. Preserve rowid so queued jobs keep FIFO order.
        for table in ("consultations", "contributions", "jobs"):
            prefix = f"CREATE TABLE IF NOT EXISTS {table} ("
            definition = prefix + schema.split(prefix, 1)[1].split(";", 1)[0] + ";"
            conn.execute(definition.replace(prefix, f"CREATE TABLE {table}_v2 (", 1))
            columns = [r["name"] for r in conn.execute(f"PRAGMA table_info({table})")]
            names = "rowid," + ",".join(columns)
            if table == "consultations":
                for number, row in enumerate(conn.execute("SELECT rowid,* FROM consultations ORDER BY rowid"), 1):
                    value = dict(row)
                    value["stage"] = stages.get(value["stage"], value["stage"])
                    value["state_json"] = json.dumps({**empty_state(), **json.loads(value["state_json"])})
                    value["chair_label"] = f"Upuan {number}"
                    conn.execute(f"INSERT INTO consultations_v2 ({names}) VALUES ({','.join('?' for _ in value)})", tuple(value[name] for name in ["rowid", *columns]))
            else:
                conn.execute(f"INSERT INTO {table}_v2 ({names}) SELECT {names} FROM {table} ORDER BY rowid")
            conn.execute(f"DROP TABLE {table}")
            conn.execute(f"ALTER TABLE {table}_v2 RENAME TO {table}")
        if conn.execute("PRAGMA foreign_key_check").fetchone():
            raise RuntimeError("Database migration found invalid resource links.")
        conn.execute("PRAGMA user_version=2")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys=ON")


def _rebuild_media(conn):
    """v3 left/right and v4 reference photo views: rebuild only media (SQLite cannot ALTER a CHECK), keeping rowids."""
    schema = SCHEMA_PATH.read_text(encoding="utf-8-sig")
    prefix = "CREATE TABLE IF NOT EXISTS media ("
    definition = prefix + schema.split(prefix, 1)[1].split(";", 1)[0] + ";"
    conn.execute("PRAGMA foreign_keys=OFF")
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(definition.replace(prefix, "CREATE TABLE media_v3 (", 1))
        conn.execute("INSERT INTO media_v3 (rowid,id,consultation_id,kind,view,storage_key,keep,created_at) "
                     "SELECT rowid,id,consultation_id,kind,view,storage_key,keep,created_at FROM media ORDER BY rowid")
        conn.execute("DROP TABLE media")
        conn.execute("ALTER TABLE media_v3 RENAME TO media")
        conn.execute("PRAGMA user_version=4")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys=ON")


def recover_running_jobs():
    with connect() as conn:
        conn.execute(
            "UPDATE jobs SET status=?, error_code=?, finished_at=? WHERE status=?",
            ("failed", "interrupted", datetime.now(timezone.utc).isoformat(), "running"),
        )
