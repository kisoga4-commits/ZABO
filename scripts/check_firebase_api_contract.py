#!/usr/bin/env python3
"""Cross-check methods used by core.js vs provided by firebase-sync adapter."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / 'js' / 'core.js'
ADAPTER = ROOT / 'js' / 'firebase-sync.js'


def main() -> int:
    core_text = CORE.read_text(encoding='utf-8')
    if not ADAPTER.exists():
        print("ℹ️ SKIP: firebase-sync adapter not found (LAN-only mode).")
        return 0
    adapter_text = ADAPTER.read_text(encoding='utf-8')

    used = set(re.findall(r'\bapi\.([A-Za-z_][A-Za-z0-9_]*)\(', core_text))
    start_token = 'const api = {'
    end_token = '\n\n  window.FakduFirebaseSync'
    start = adapter_text.find(start_token)
    end = adapter_text.find(end_token, start + len(start_token))
    api_block = adapter_text[start + len(start_token):end] if (start >= 0 and end > start) else ''
    provided = set(re.findall(r'^\s{4}(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(', api_block, flags=re.MULTILINE))

    # keep only callable API names expected on sync adapter
    skip = {
        'resolveApi', 'nowMs', 'toNumber', 'setValue', 'readOnce', 'updateValue', 'removeValue',
        'listenValue', 'listenChildAdded', 'normalizePin', 'normalizeShopId', 'normalizeClientId', 'makeId'
    }
    provided_api = {name for name in provided if name not in skip}

    missing = sorted(name for name in used if name not in provided_api)

    print('Methods used by core.js:')
    for name in sorted(used):
        print(f' - {name}')

    print('\nMethods provided by firebase-sync.js:')
    for name in sorted(provided_api):
        print(f' - {name}')

    if missing:
        print('\n❌ Missing methods in adapter:')
        for name in missing:
            print(f' - {name}')
        return 1

    print('\n✅ API contract OK: firebase-sync adapter covers all methods used by core.js')
    return 0


if __name__ == '__main__':
    sys.exit(main())
