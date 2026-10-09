"""Prepare demo-safe-v1 separately; never switch or reset the working checkout."""
from pathlib import Path
import json
import sqlite3
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.local-backup/v1-recovery'
ARCHIVE = ROOT / '.local-backup/demo-safe-v1.zip'
if DEST.exists():
    raise SystemExit('Recovery directory already exists; preserving it. See docs/DEMO.md.')
DEST.mkdir(parents=True)
subprocess.run(['git', 'archive', '--format=zip', '--output=' + str(ARCHIVE), 'demo-safe-v1'], cwd=ROOT, check=True)
with zipfile.ZipFile(ARCHIVE) as archive:
    for name in archive.namelist():
        if not (DEST / name).resolve().is_relative_to(DEST.resolve()):
            raise RuntimeError('Archive entry escapes recovery directory.')
    archive.extractall(DEST)
(DEST / 'data').mkdir(exist_ok=True)
restored = None
for source in sorted((ROOT / '.local-backup').glob('*/gupai.db'), reverse=True):
    with sqlite3.connect(source) as conn:
        if conn.execute('PRAGMA user_version').fetchone()[0] != 1:
            continue
        with sqlite3.connect(DEST / 'data/gupai.db') as target:
            conn.backup(target)
        restored = str(source.relative_to(ROOT))
    media = source.parent / 'media.zip'
    if media.exists():
        with zipfile.ZipFile(media) as archive:
            archive.extractall(DEST / 'data/media')
    break
(DEST / 'recovery-manifest.json').write_text(json.dumps({'tag':'demo-safe-v1', 'database_backup':restored,
    'database_mode':'restored v1 copy' if restored else 'fresh v1 database on startup',
    'warning':'Never point v1 at the main v2 data directory.'}, indent=2), encoding='utf-8')
print('Prepared isolated v1 source at', DEST)
print('Database:', restored or 'fresh, isolated v1 database on startup')
