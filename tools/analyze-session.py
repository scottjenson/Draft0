"""Print a readable summary of a saved Mirror session (session-*.json from mirror.html or mirror-cloud.html).

Usage:  python3 -I tools/analyze-session.py sessions/<file>.json [--all-versions]
"""
import collections
import json
import sys


def cloud(S, all_versions):
    print(f"cloud session | source {S['source']} | topic {S.get('topic')!r} | utterances {len(S['utterances'])} | "
          f"versions {len(S['versions'])} | calls {len(S['calls'])} | cost ${S.get('cost', 0):.3f}")
    errs = [c['error'] for c in S['calls'] if c.get('error')]
    if errs:
        print('errors:', errs)
    print('=== UTTERANCES')
    for i, u in enumerate(S['utterances']):
        print(f"{i + 1:>3} [{u['t'] / 1000:>4.0f}s] {u['text']}")
    shown = S['versions'] if all_versions else S['versions'][-1:]
    for k, v in enumerate(shown):
        n = S['versions'].index(v) + 1
        print(f"\n=== VERSION {n}/{len(S['versions'])} at {v['at'] / 1000:.0f}s, utterances 1-{v['upto']}, "
              f"{v['model']}, {v['ms'] / 1000:.1f}s | {v.get('changes', '')}")
        for p in v['points']:
            print(f"  [{p['id']}] {p['title']} | {p['summary']}")
            for b in p['bullets']:
                print(f"        - {b}")


def nano(S):
    st = S['statements']
    print(f"nano session | source {S['source']} | topic {S.get('topic')!r} | utterances {len(S['utterances'])} | "
          f"statements {len(st)} | groups {len(S['groups'])} | mains {len(S['mains'])} | calls {len(S['calls'])}")
    print(collections.Counter(c['task'] for c in S['calls']), 'errors', [c['error'][:50] for c in S['calls'] if c.get('error')])
    print('roles', collections.Counter(s.get('role') for s in st))
    print('=== UTTERANCES')
    for i, u in enumerate(S['utterances']):
        print(f"{i + 1} [{u['t'] / 1000:.0f}s {len(u['text'].split())}w] {u['text']}")
        for k in (u.get('statements') or []):
            s = st[k]
            print(f"      > [{s.get('role', '?')}{'/' + s['detectedBy'] if s.get('detectedBy') else ''}] {s['text']}")
    print('=== MAINS')
    for m in S['mains']:
        how = f"declared/{m.get('detectedBy')}" if m.get('declared') else 'auto'
        print(f"#{m['n']} {m['title']} ({how}) | {m['text']}")
        for g in S['groups']:
            if g.get('mainId') == m['id']:
                print(f"     {g['id']} {g['kind']} {len(g['members'])} | {g['label']}")
    print('=== NOT IN MAINS')
    for g in S['groups']:
        if not g.get('mainId'):
            print(f"   {g['id']} {g['kind']} {len(g['members'])} | {g['label'][:60]} | {[st[x]['text'][:50] for x in g['members']]}")


if __name__ == '__main__':
    S = json.load(open(sys.argv[1]))
    cloud(S, '--all-versions' in sys.argv) if 'versions' in S else nano(S)
