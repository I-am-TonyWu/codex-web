"""Private host data snapshot. No credentials are printed. Run on the original host."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import stat
import tempfile
import zipfile

def long_path(path):
    path = pathlib.Path(path).absolute()
    if os.name == 'nt' and not str(path).startswith('\\\\?\\'):
        return pathlib.Path('\\\\?\\' + str(path))
    return path


BUNDLE = long_path(pathlib.Path(__file__).resolve().parents[1])
LINK_ROOTS = [long_path(pathlib.Path.home() / p) for p in ['.codex', 'Documents/Codex', '.cache/codex-runtimes', 'AppData/Local/CodexWebTray/workspace']]
GENERATED_EXCLUSIONS = []
EXCLUDE_CODEX_DIRS = {
    'accounts', 'browser', '.sandbox', '.sandbox-bin', '.sandbox-secrets',
    '.tmp', 'tmp', 'cache', 'computer-use', 'node_repl', 'thread-writer-locks',
}
EXCLUDE_CODEX_FILES = {
    'auth.json', 'accounts.json', 'cap_sid', 'installation_id',
    'chrome-native-hosts-v2.json', 'webui-auth-sessions.json', 'models_cache.json',
    'logs_2.sqlite', 'queue_1.sqlite',
}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')


def inside(path, root):
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def remove_old_backup(root):
    # Only remove this bundle's superseded snapshot, never an original host directory.
    if root.parent != BUNDLE or root.name != 'backup-previous' or not inside(root, BUNDLE):
        raise RuntimeError('Unsafe backup cleanup target')
    def readonly_handler(function, filename, error):
        candidate = long_path(filename)
        if not isinstance(error, PermissionError) or not inside(candidate, root):
            raise error
        os.chmod(candidate, stat.S_IWRITE | stat.S_IREAD)
        function(candidate)
    shutil.rmtree(root, onexc=readonly_handler)


def copy_tree(src, dst, stats, codex=False, is_root=True, ancestors=frozenset()):
    src, dst = long_path(src), long_path(dst)
    identity = str(src.resolve()).lower()
    if identity in ancestors:
        raise RuntimeError('Directory link cycle: ' + str(src))
    ancestors = ancestors | {identity}
    dst.mkdir(parents=True, exist_ok=True)
    if not src.exists():
        stats['missing_roots'].append(str(src))
        return
    for entry in sorted(src.iterdir()):
        # Exclude this bundle and its convenience ZIP to prevent recursive copies.
        if inside(entry, BUNDLE) or entry == pathlib.Path(str(BUNDLE) + '.zip') or (entry.parent.name == 'outputs' and entry.name.startswith('CodexWeb-Migration-')):
            stats['excluded'].append({'path': str(entry), 'reason': 'migration bundle itself'})
            continue
        if any(inside(entry, root) for root in GENERATED_EXCLUSIONS) or (entry.parent.name == 'outputs' and entry.name.startswith('desktop-project-code-')):
            stats['excluded'].append({'path': str(entry), 'reason': 'generated build/inspection files; program and source supplied separately'})
            continue
        info = entry.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            resolved = entry.resolve(strict=True)
            if not any(inside(resolved, root) for root in LINK_ROOTS):
                stats['excluded'].append({'path': str(entry), 'reason': 'reparse point outside backed-up roots and Codex runtime dependencies'})
                continue
            stats['materialized_links'].append({'path': str(entry), 'target': str(resolved)})
            info = entry.stat()
        if codex and is_root:
            if entry.name in EXCLUDE_CODEX_DIRS or entry.name in EXCLUDE_CODEX_FILES or entry.name.endswith(('-wal', '-shm', '.guard', '.lock')) or '.tmp.' in entry.name or entry.name.endswith('.bak'):
                stats['excluded'].append({'path': str(entry), 'reason': 'login credential, machine cache, live queue, log, or SQLite sidecar'})
                continue
        if codex and entry.name in {'.plugin-appserver', '.remote-plugin-install-staging'}:
            stats['excluded'].append({'path': str(entry), 'reason': 'plugin runtime/staging'})
            continue
        target = dst / entry.name
        if entry.is_dir():
            copy_tree(entry, target, stats, codex=codex, is_root=False, ancestors=ancestors)
        else:
            if codex and entry.name.endswith(('-wal', '-shm')):
                continue
            with entry.open('rb') as f:
                header = f.read(16)
            if codex and header == b'SQLite format 3\x00':
                plain_source = pathlib.Path(str(entry)[4:] if str(entry).startswith('\\\\?\\') else str(entry))
                original = sqlite3.connect(plain_source.as_uri() + '?mode=ro', uri=True, timeout=30)
                snapshot = sqlite3.connect(target)
                try:
                    original.backup(snapshot, pages=256, sleep=0.1)
                    result = snapshot.execute('pragma integrity_check').fetchone()[0]
                    if result != 'ok':
                        raise RuntimeError('SQLite integrity check failed: ' + entry.name)
                    snapshot.execute('pragma journal_mode=delete')
                    stats['databases'].append({'path': str(entry), 'backup': str(target.relative_to(BUNDLE)), 'integrity': 'ok'})
                finally:
                    snapshot.close()
                    original.close()
            else:
                # Limit reads to the observed length so an actively appended JSONL cannot grow forever.
                size = info.st_size
                with entry.open('rb') as source, target.open('wb') as dest:
                    left = size
                    while left:
                        chunk = source.read(min(left, 1024 * 1024))
                        if not chunk:
                            raise OSError('Source changed while copying: ' + str(entry))
                        dest.write(chunk)
                        left -= len(chunk)
                shutil.copystat(entry, target)
            stats['files'] += 1
            stats['bytes'] += target.stat().st_size


def snapshot():
    manifest = json.loads((BUNDLE / 'manifest.json').read_text(encoding='utf-8-sig'))
    GENERATED_EXCLUSIONS[:] = [long_path(p) for p in manifest.get('generatedExclusions', [])]
    LINK_ROOTS.extend(long_path(item['source']) for item in manifest.get('extraRoots', []))
    current = pathlib.Path.home()
    if str(current).lower() != manifest['oldProfile'].lower() or os.environ.get('COMPUTERNAME', '').lower() != manifest['oldComputerName'].lower():
        raise RuntimeError('Re-export is only allowed on the original host/profile.')
    for key in ['oldCodexHome', 'oldDocumentsCodex']:
        if not pathlib.Path(manifest[key]).is_dir():
            raise RuntimeError('Required backup source is missing: ' + key)
    started = datetime.datetime.now().astimezone().isoformat()
    staging = pathlib.Path(tempfile.mkdtemp(prefix='backup-next-', dir=BUNDLE))
    stats = {'files': 0, 'bytes': 0, 'databases': [], 'excluded': [], 'materialized_links': [], 'missing_roots': []}
    try:
        copy_tree(pathlib.Path(manifest['oldCodexHome']), staging / 'codex', stats, codex=True)
        copy_tree(pathlib.Path(manifest['oldDocumentsCodex']), staging / 'Documents-Codex', stats)
        copy_tree(pathlib.Path(manifest['oldTrayWorkspace']), staging / 'tray-workspace', stats)
        for item in manifest.get('extraRoots', []):
            copy_tree(pathlib.Path(item['source']), staging / item['backup'], stats)
        final = BUNDLE / 'backup'
        prior = BUNDLE / 'backup-previous'
        if prior.exists():
            if not inside(prior, BUNDLE):
                raise RuntimeError('Unsafe cleanup target')
            remove_old_backup(prior)
        if final.exists():
            final.rename(prior)
        staging.rename(final)
        # Report paths must reference the committed backup rather than staging.
        for record in stats['databases']:
            record['backup'] = record['backup'].replace(staging.name + '/', 'backup/').replace(staging.name + '\\', 'backup/')
        manifest['snapshotStartedAt'] = started
        manifest['snapshotCompletedAt'] = datetime.datetime.now().astimezone().isoformat()
        manifest['snapshotMode'] = 'online-per-database; quiescent refresh recommended before final cutover'
        manifest['dataFiles'] = stats['files']
        manifest['dataBytes'] = stats['bytes']
        write_json(BUNDLE / 'manifest.json', manifest)
        write_json(BUNDLE / 'backup-report.json', stats)
        if prior.exists():
            remove_old_backup(prior)
        print(json.dumps({'snapshot_files': stats['files'], 'snapshot_bytes': stats['bytes'], 'databases': len(stats['databases']), 'missing_roots': len(stats['missing_roots'])}))
    except Exception:
        # Retain partial staging for diagnosis; it is excluded by the bundle parent.
        raise


def checksums():
    entries = []
    for p in sorted(BUNDLE.rglob('*')):
        if p.is_file() and not (p.parent == BUNDLE and p.name in {'SHA256SUMS.txt', 'checksums.json'}):
            entries.append({'path': p.relative_to(BUNDLE).as_posix(), 'sha256': digest(p), 'bytes': p.stat().st_size})
    write_json(BUNDLE / 'checksums.json', entries)
    (BUNDLE / 'SHA256SUMS.txt').write_text(''.join(e['sha256'] + '  ' + e['path'] + '\n' for e in entries), encoding='utf-8')
    print(json.dumps({'package_files': len(entries), 'package_bytes': sum(x['bytes'] for x in entries)}))


def archive():
    target = pathlib.Path(str(BUNDLE) + '.zip')
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=4, allowZip64=True, strict_timestamps=False) as z:
        for p in sorted(BUNDLE.rglob('*')):
            if p.is_file():
                z.write(p, arcname=str(pathlib.Path(BUNDLE.name) / p.relative_to(BUNDLE)))
    with zipfile.ZipFile(target) as z:
        bad = z.testzip()
        if bad:
            raise RuntimeError('ZIP CRC failed: ' + bad)
    target.with_suffix('.zip.sha256').write_text(digest(target) + '  ' + target.name + '\n', encoding='utf-8')
    print(json.dumps({'zip_bytes': target.stat().st_size, 'zip_crc': 'ok'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--checksums-only', action='store_true')
    parser.add_argument('--zip', action='store_true')
    args = parser.parse_args()
    if not args.checksums_only:
        snapshot()
    checksums()
    if args.zip:
        archive()
