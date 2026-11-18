"""Offline comparison against the November 18 CN blueprint. See REQ-203."""

import argparse
import hashlib
import json
import sys
from pathlib import Path


EVIDENCE = Path(__file__).resolve().parents[1] / "docs/evidence/req203-20261118"


def native_rows(payload, expected_code_hash):
    code = payload.get("shareCode")
    if not isinstance(code, str) or hashlib.sha256(code.encode()).hexdigest() != expected_code_hash:
        raise ValueError("missing shareCode or code belongs to another blueprint")
    groups = payload.get("contentGroups")
    if not isinstance(groups, list):
        raise ValueError("missing contentGroups list")
    rows = []
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("entries"), list):
            raise ValueError("invalid content group")
        for entry in group["entries"]:
            if not isinstance(entry, dict) or entry.get("invalid"):
                raise ValueError("invalid content entry")
            rows.append([group.get("contentType"), entry.get("recordID"), entry.get("total")])
    return rows


def canonical_digest(rows):
    if not isinstance(rows, list) or not rows:
        raise ValueError("expected a non-empty list of [contentType, recordID, total]")
    keys = set()
    for row in rows:
        if not isinstance(row, list) or len(row) != 3 or any(type(v) is not int or v < 1 for v in row):
            raise ValueError("each row must contain three positive integers")
        key = tuple(row[:2])
        if key in keys:
            raise ValueError("duplicate entry within the same content type")
        keys.add(key)
    encoded = json.dumps(sorted(rows), separators=(",", ":")).encode("ascii")
    return hashlib.sha256(encoded).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="JSON file, or - to read JSON from stdin")
    args = parser.parse_args()
    try:
        expected = json.loads((EVIDENCE / "native-list-catalog-match.json").read_bytes())
        payload = json.loads(sys.stdin.buffer.read() if args.input == "-" else Path(args.input).read_bytes())
        if isinstance(payload, dict):
            sample = json.loads((EVIDENCE / "native-blueprint-sample-summary.json").read_bytes())
            rows = native_rows(payload, sample["code_sha256"])
            mode = "code and content"
        else:
            rows = payload
            mode = "content only"
        if canonical_digest(rows) != expected["sorted_tuples_sha256"]:
            raise ValueError("content types, record IDs or quantities differ from the CN sample")
    except (OSError, ValueError) as err:
        print(f"FAIL: {err}", file=sys.stderr)
        return 1
    print(f"PASS ({mode}): {len(rows)} entries, {sum(row[2] for row in rows)} units")
    return 0


if __name__ == "__main__":
    sys.exit(main())
