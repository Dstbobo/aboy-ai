"""Validate the canonical Aboy migration bundle without touching a database.

Database application is intentionally performed only through the separately
approved staging workflow. This script makes local/CI checks safe by default.
"""

import hashlib
import json
import re
import sys
from pathlib import Path


BUNDLE = Path(__file__).resolve().parent / "all_migrations.sql"
REQUIRED_MARKERS = (
    "-- 008:",
    "-- 009-011:",
    "-- 012:",
    "-- 013:",
    "-- 014:",
)
FORBIDDEN = (
    re.compile(r"postgres(?:ql)?://[^\s:/]+:[^\s@]+@", re.IGNORECASE),
    re.compile(r"(?:service_role|anon)_key\s*=\s*['\"][^'\"]+", re.IGNORECASE),
)


def validate_bundle() -> dict:
    if not BUNDLE.is_file():
        raise RuntimeError("Canonical migration bundle is missing")
    sql = BUNDLE.read_text(encoding="utf-8")
    missing = [marker for marker in REQUIRED_MARKERS if marker not in sql]
    if missing:
        raise RuntimeError("Canonical migration bundle is incomplete")
    if any(pattern.search(sql) for pattern in FORBIDDEN):
        raise RuntimeError("Canonical migration bundle contains credential material")
    if sql.rfind("-- 014:") < sql.rfind("-- 013:"):
        raise RuntimeError("Security migrations are out of order")
    return {
        "status": "valid",
        "file": BUNDLE.name,
        "bytes": len(sql.encode("utf-8")),
        "sha256": hashlib.sha256(sql.encode("utf-8")).hexdigest(),
        "applied": False,
    }


def main() -> int:
    try:
        print(json.dumps(validate_bundle(), sort_keys=True))
        return 0
    except RuntimeError as exc:
        print(json.dumps({"status": "invalid", "detail": str(exc), "applied": False}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
