"""SQLite connections and C1 startup initialization."""
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
        elif version != 1:
            raise RuntimeError("Unsupported database schema version.")


def recover_running_jobs():
    with connect() as conn:
        conn.execute(
            "UPDATE jobs SET status=?, error_code=?, finished_at=? WHERE status=?",
            ("failed", "interrupted", datetime.now(timezone.utc).isoformat(), "running"),
        )
