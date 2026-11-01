#!/usr/bin/env python3
"""Verify hosted/offline parity and reproducible manual output in a temporary copy."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ManualBuildTest(unittest.TestCase):
    def test_offline_edition_has_the_same_chapters_and_is_reproducible(self):
        with tempfile.TemporaryDirectory(prefix='eu5-manual-test-') as temporary:
            source = Path(temporary) / 'manual'
            source.mkdir()
            for name in ['assets', 'content', 'scripts']:
                shutil.copytree(ROOT / name, source / name, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
            for name in ['LICENSE.txt', 'THIRD_PARTY_NOTICES.md']:
                shutil.copy2(ROOT / name, source / name)

            def build(offline, windows_newlines=False):
                environment = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
                command = [sys.executable, str(source / 'scripts/build.py'), *(['--offline'] if offline else [])]
                if windows_newlines:
                    # Emulate Windows text-mode newline translation on any OS.
                    # Explicit newline='\\n' writes must produce identical bytes.
                    bootstrap = """import io, runpy, sys
original_open = io.open
def windows_open(file, mode='r', buffering=-1, encoding=None, errors=None, newline=None, closefd=True, opener=None):
    if 'b' not in mode and any(flag in mode for flag in 'wax') and newline is None:
        newline = '\\r\\n'
    return original_open(file, mode, buffering, encoding, errors, newline, closefd, opener)
io.open = windows_open
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')
"""
                    command = [sys.executable, '-c', bootstrap, *command[1:]]
                subprocess.run(command, check=True, env=environment, capture_output=True)
                subprocess.run([sys.executable, str(source / 'scripts/check.py')], check=True, env=environment, capture_output=True)
                return {p.relative_to(source / 'dist').as_posix(): p.read_bytes() for p in sorted((source / 'dist').rglob('*')) if p.is_file()}

            hosted = build(False)
            offline = build(True)
            self.assertIn('.nojekyll', hosted)
            self.assertNotIn('.nojekyll', offline)
            hosted_info = json.loads(hosted['manual.json'])
            offline_info = json.loads(offline['manual.json'])
            self.assertEqual(hosted_info['version'], offline_info['version'])
            self.assertEqual(hosted_info['pages'], offline_info['pages'])
            self.assertEqual(offline_info['edition'], 'offline')
            for page in hosted_info['pages']:
                hosted_text = hosted[page].decode('utf-8')
                offline_text = offline[page].decode('utf-8')
                self.assertEqual(re.search(r'<article>.*?</article>', hosted_text, re.S).group(), re.search(r'<article>.*?</article>', offline_text, re.S).group())
                self.assertNotIn('/blob/master/', offline_text)
                self.assertIn('Latest online manual', offline_text)
                self.assertIn('class="icon-button theme-toggle"', hosted_text)
                self.assertNotIn('class="icon-button theme-toggle"', offline_text)
                self.assertIn('<html lang="en" data-edition="offline">', offline_text)
            self.assertEqual(hosted['assets/search-index.js'], offline['assets/search-index.js'])
            repeated = build(True)
            self.assertEqual({k: hashlib.sha256(v).hexdigest() for k, v in offline.items()}, {k: hashlib.sha256(v).hexdigest() for k, v in repeated.items()})
            windows = build(True, windows_newlines=True)
            self.assertEqual({k: hashlib.sha256(v).hexdigest() for k, v in offline.items()}, {k: hashlib.sha256(v).hexdigest() for k, v in windows.items()}, 'Manual output depends on OS newline defaults')


if __name__ == '__main__':
    unittest.main()
