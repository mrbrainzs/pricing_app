#!/usr/bin/env python3
"""Online SQLite backup, including committed WAL data. Keeps the last 14 days."""
import datetime
import pathlib
import sqlite3

root = pathlib.Path('/var/backups/quinsuper')
root.mkdir(mode=0o700, parents=True, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc)
target = root / (now.strftime('%Y%m%dT%H%M%SZ') + '.sqlite')
with sqlite3.connect('file:/var/lib/quinsuper/prices.sqlite?mode=ro', uri=True) as source:
    with sqlite3.connect(target) as dest:
        source.backup(dest)
        if dest.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup integrity check failed')
cutoff = now.timestamp() - 14 * 86400
for path in root.glob('*.sqlite'):
    if path.stat().st_mtime < cutoff:
        path.unlink()
print('Verified backup:', target.name)
