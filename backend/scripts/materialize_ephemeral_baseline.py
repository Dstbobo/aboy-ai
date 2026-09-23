"""Extract Aboy's canonical migrations through 012 for an ephemeral database.

The security migrations are deliberately applied from their standalone files so
CI proves the exact production candidates work after the complete historical
baseline. This script never connects to a database or reads environment values.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1]
BUNDLE = BACKEND / "all_migrations.sql"
MARKER_013 = "-- 013: Server-controlled roles and backend-only service access"
MARKER_014 = "-- 014: Derived-data RLS and account-deletion cascades"
REQUIRED_BASELINE_MARKERS = (
    "-- User Profiles",
    "-- Query Sessions",
    "-- 008: Personal learning intelligence",
    "-- 009-011: Medical image registry and operational counters",
    "-- 012: Feedback uniqueness and aggregate activation funnel",
)


def materialize(output_dir: Path) -> Path:
    sql = BUNDLE.read_text(encoding="utf-8")
    if sql.count(MARKER_013) != 1 or sql.count(MARKER_014) != 1:
        raise RuntimeError("canonical security migration markers are missing or duplicated")
    index_013 = sql.index(MARKER_013)
    index_014 = sql.index(MARKER_014)
    if index_013 >= index_014:
        raise RuntimeError("canonical security migrations are out of order")
    missing = [marker for marker in REQUIRED_BASELINE_MARKERS if marker not in sql[:index_013]]
    if missing:
        raise RuntimeError("canonical baseline is incomplete")

    baseline = sql[:index_013]
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "001_through_012.sql"
    output.write_text(baseline, encoding="utf-8", newline="\n")
    print(
        json.dumps(
            {
                "file": output.name,
                "sha256": hashlib.sha256(baseline.encode("utf-8")).hexdigest(),
                "source": BUNDLE.name,
                "through": "012",
            },
            sort_keys=True,
        )
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    materialize(args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
