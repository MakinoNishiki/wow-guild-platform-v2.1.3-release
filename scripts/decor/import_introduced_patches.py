"""Intersect Housing Codex patch facts with this site's current mainland decor catalog."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import textwrap

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("patch_file", type=Path, help="HousingCodex/Core/DecorPatchData.lua")
args = parser.parse_args()
source = args.patch_file.read_bytes()
patches = {int(record): patch for record, patch in re.findall(
    r'\[(\d+)\]\s*=\s*"(\d+\.\d+\.\d+)"', source.decode("utf-8-sig")
)}
catalog = json.loads((root / "data/task083/catalog-current-2335.json").read_text(encoding="utf-8-sig"))
groups = collections.defaultdict(list)
for item in catalog:
    record = item["record_id"]
    if item["entry_type"] == 1 and record in patches:
        groups[patches[record]].append(record)
if not groups:
    raise ValueError("输入文件没有与当前图鉴匹配的加入版本")
lines = [
    "// Record IDs grouped by introduced patch. Source: HousingCodex/Core/DecorPatchData.lua",
    "// Source SHA-256: " + hashlib.sha256(source).hexdigest(),
    "// Regenerate with scripts/decor/import_introduced_patches.py.",
    "window.DecorIntroducedPatches = {"
]
for version in sorted(groups, key=lambda s: tuple(map(int, s.split(".")))):
    lines.append(f'  "{version}": [')
    lines.extend("    " + line for line in textwrap.wrap(", ".join(map(str, sorted(groups[version]))), width=108))
    lines.append("  ],")
lines.append("};")
(root / "js/decorIntroducedPatches.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
print({k: len(v) for k, v in groups.items()})
