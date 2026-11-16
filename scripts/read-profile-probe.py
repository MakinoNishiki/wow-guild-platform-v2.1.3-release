"""Parse probe SavedVariables as data, never execute it. Prints a local summary only."""
import argparse
import json
from pathlib import Path
from wjdc_convert import _Parser, _tokenize, LuaParseError


def read_probe(path):
    text = Path(path).read_text(encoding='utf-8-sig')
    if len(text) > 10_000_000:
        raise ValueError('Probe file exceeds diagnostic size limit')
    parser = _Parser(_tokenize(text))
    kind, name = parser.next()
    if kind != 'ident' or name != 'WoWButlerProfileProbeDB':
        raise LuaParseError('Not a profile probe SavedVariables file')
    parser.expect('=')
    result = parser.parse_value()
    if parser.peek()[0] is not None:
        raise LuaParseError('Unexpected trailing content')
    return result


def rows(value):
    return list(value.values()) if isinstance(value, dict) else value or []


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('input')
    args = ap.parse_args()
    db = read_probe(args.input)
    snap = db.get('latest', {})
    equipment = rows(snap.get('equipment'))
    housing = snap.get('housing', {})
    decor = rows(housing.get('entries'))
    summary = {
        'probeVersion': snap.get('probeVersion'), 'client': snap.get('client'),
        'startedAt': snap.get('startedAt'), 'finishedAt': snap.get('finishedAt'),
        'identity': snap.get('identity'), 'itemLevel': snap.get('itemLevel'),
        'equipmentSlots': len(equipment),
        'equippedItems': sum(x.get('itemID') is not None for x in equipment),
        'itemsWithActualLevel': sum(x.get('actualItemLevel') is not None for x in equipment),
        'mythicPlus': snap.get('mythicPlus'), 'raidLockouts': snap.get('raidLockouts'),
        'housing': {'state': housing.get('state'), 'returnedEntries': len(decor),
                    'entriesWithStoredCount': sum('totalNumStored' in x for x in decor),
                    'entriesWithPlacedCount': sum('totalNumPlaced' in x for x in decor),
                    'truncated': housing.get('truncated', False)},
        'diagnostics': snap.get('diagnostics'), 'hasPreviousSnapshot': bool(db.get('previous')),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
