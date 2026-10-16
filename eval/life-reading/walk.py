#!/usr/bin/env python3
"""Life-reading walk: builds each Analyst step's workspace, seals readings,
reveals one chapter at a time, and checks outputs. The agents themselves are
Opus sessions started by whoever drives the walk; this script only moves files.

Case data lives outside the repo (it is private): LIFE_READING_HOME, default
/mnt/project-files/life-reading. Layout:

  cases/<id>/case.json      birth, cut-off, walk start, ages to count
  cases/<id>/chart/         chart.json, periods-antar/pratyantar.json, transits-slow.json
                            (prompt sets that name window.md also get signals.py's output per window)
  cases/<id>/profile/       Profiler output: events.json, inner/YYYY.md
  cases/<id>/hidden/        events after the cut-off (scorer only)
  runs/<id>/<run>/          one walk: chapters/NN-<chain>/{reading,match,score}, notes/

Commands:
  walk.py chapters <case>                       list the chapters of the walk
  walk.py prepare <case> <run> <n> read|match   build the workspace for chapter n
  walk.py collect <case> <run> <n> read|match   copy the step's output back and seal it
  walk.py prepare <case> <run> final forecast   workspace for the hidden-years forecast
  walk.py collect <case> <run> final forecast
  walk.py check <case> <run> <n|final> read|forecast   run collect's checks on the workspace output without sealing
  walk.py score-prep <case> <run> <n|final|regression>  workspace for the Scorer
  walk.py score-collect <case> <run> <n|final|regression>
  walk.py sensitivity <case>                    write chart/sensitivity-placements.json (birth time +-5 min)
  walk.py report <case> <run>                   misses by chapter

A prompt set may carry `settings.json` with a list of `features`; without one a set runs exactly as v3 did.
  signals-v4        window.md from `signals.py --v4` (orb spans, egress, derived houses, birth-time marks)
  arena-record      window.md ends with the run's computed record by part of life (from earlier score.json files)
  situations-check  collect/check parse the situations block and flag chain gaps (checks-*.json "chain")
  scorer-inner      the Scorer also gets the revealed inner/ years
  sensitivity       the workspace gets chart/sensitivity-placements.json
The regression set for the Scorer lives in the data dir, `regression/items.json` (it quotes private records).
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

HOME = Path(os.environ.get('LIFE_READING_HOME', '/mnt/project-files/life-reading'))
WORK = Path(os.environ.get('LIFE_READING_WORK', '/tmp/life-reading-work'))
PROFILE = os.environ.get('LIFE_READING_PROFILE', 'profile')
PROMPTS = Path(__file__).resolve().parent / 'prompts' / os.environ.get('LIFE_READING_PROMPTS', 'v1')
ATROS = os.environ.get('ATROS_BIN', '/tmp/atros-venv/bin/atros')
PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']
FEATURES = set(json.loads((PROMPTS / 'settings.json').read_text()).get('features', [])) if (PROMPTS / 'settings.json').exists() else set()
SENS = 'sensitivity-placements.json'


def load(p):
    return json.loads(Path(p).read_text())


def case(cid):
    c = load(HOME / 'cases' / cid / 'case.json')
    c['dir'] = HOME / 'cases' / cid
    return c


def age(c, iso):
    b = date.fromisoformat(c['birth']['date'])
    return round((date.fromisoformat(iso) - b).days / 365.25, 1)


def chapters(c):
    """Antardashas from the walk start to the cut-off; the last one is clipped at the cut-off."""
    rows = load(c['dir'] / 'chart' / 'periods-antar.json')['rows']
    out = []
    for r in rows:
        s, e = r['antardasha']['start'], r['antardasha']['end']
        if e <= c['walkStart'] or s >= c['cutoff']:
            continue
        out.append({'chain': r['chain'], 'start': max(s, c['walkStart']), 'end': min(e, c['cutoff']), 'fullStart': s, 'fullEnd': e})
    # A sliver of a chapter just before the cut-off has nothing to read; the forecast covers it.
    if out and (date.fromisoformat(out[-1]['end']) - date.fromisoformat(out[-1]['start'])).days < 60:
        out.pop()
    for i, ch in enumerate(out, 1):
        ch['n'] = i
        ch['age'] = age(c, ch['start'])
        ch['counts'] = ch['age'] >= c.get('countFromAge', 20)
    return out


def chapter(c, n):
    if n == 'final':
        return {'n': 'final', 'chain': 'hidden years', 'start': c['cutoff'], 'end': c['hiddenEnd'], 'age': age(c, c['cutoff'])}
    return chapters(c)[int(n) - 1]


def slug(ch):
    return 'final' if ch['n'] == 'final' else f"{ch['n']:02d}-{ch['chain']}"


def mask(c, text):
    for old, new in c.get('mask', []):
        text = re.sub(r'\b' + re.escape(old) + r'\b', new, text)
    return text


def events(c):
    return load(c['dir'] / PROFILE / 'events.json')


def when(e):
    """The date an event is placed at: the middle of the span its precision allows."""
    d = date.fromisoformat(e['date'])
    p = e.get('precision', 'day')
    if p in ('year', 'approx') and e['date'].endswith('-01-01'):
        d = d.replace(month=7, day=2)
    elif p == 'month' and d.day == 1:
        d = d.replace(day=15)
    elif p == 'season' and d.day == 1:
        d = d + timedelta(days=45)
    return d.isoformat()


def write_life(c, dest, until, since=None):
    """Events dated before `until` (and on/after `since`), plus inner/ for years wholly before `until`."""
    dest.mkdir(parents=True, exist_ok=True)
    ev = [e for e in events(c) if when(e) < until and (since is None or when(e) >= since)]
    (dest / 'events.json').write_text(mask(c, json.dumps(ev, indent=1, ensure_ascii=False)))
    inner = dest / 'inner'
    inner.mkdir(exist_ok=True)
    first = int(since[:4]) if since else 0
    # A year counts as over if it ends within two weeks of `until` (chapters often end late in December).
    over_by = (date.fromisoformat(until) + timedelta(days=14)).isoformat()
    for f in sorted((c['dir'] / PROFILE / 'inner').glob('*.md')):
        y = int(f.stem[:4])
        # Only whole years that are over by `until`, so no file describes time still ahead.
        if first <= y and f'{y}-12-31' <= over_by:
            (inner / f.name).write_text(mask(c, f.read_text()))
    return ev


def workspace(cid, run, ch, step):
    # An opaque folder name: the path must not tell the agent whose life this is.
    return WORK / hashlib.sha256(cid.encode()).hexdigest()[:10] / run / slug(ch) / step


def run_dir(c, run):
    d = HOME / 'runs' / c['id'] / run
    d.mkdir(parents=True, exist_ok=True)
    return d


def fill(text, c, ch):
    return (text.replace('{{START}}', ch['start']).replace('{{END}}', ch['end'])
            .replace('{{CHAIN}}', ch['chain'])
            .replace('{{FULLSTART}}', ch.get('fullStart', ch['start'])).replace('{{FULLEND}}', ch.get('fullEnd', ch['end'])).replace('{{AGE}}', str(ch['age'])))


def prepare(cid, run, n, step):
    c = case(cid)
    ch = chapter(c, n)
    rd = run_dir(c, run)
    ws = workspace(cid, run, ch, step)
    if ws.exists():
        shutil.rmtree(ws)
    ws.mkdir(parents=True)
    (ws / 'chart').mkdir()
    for f in (c['dir'] / 'chart').glob('*.json'):
        if f.name == SENS and 'sensitivity' not in FEATURES:
            continue
        (ws / 'chart' / f.name).write_text(mask(c, f.read_text()))
    notes = rd / 'notes'
    if notes.exists():
        shutil.copytree(notes, ws / 'notes')
    else:
        (ws / 'notes').mkdir()
    write_life(c, ws / 'life', ch['start'])
    task = (PROMPTS / f'task-{step}.md').read_text()
    if 'window.md' in task:
        # The chart signals for the window this step reads (see signals.py); prompt sets from v3 on use them.
        py = Path(ATROS).parent / 'python'
        sig = subprocess.run([str(py), str(Path(__file__).resolve().parent / 'signals.py'), str(c['dir'] / 'chart'), ch['start'], ch['end']]
                             + (['--v4'] if 'signals-v4' in FEATURES else []),
                             check=True, capture_output=True, text=True).stdout
        if 'arena-record' in FEATURES and step in ('read', 'forecast'):
            sig += '\n' + arena_record(c, rd, ch)
        (ws / 'chart' / 'window.md').write_text(mask(c, sig))
    if step == 'match':
        shutil.copy(rd / 'chapters' / slug(ch) / 'reading.md', ws / 'reading.md')
        write_life(c, ws / 'revealed', ch['end'], since=ch['start'])
    birth = {k: v for k, v in c['birth'].items() if k not in ('name', 'place_name')}
    header = (f"Birth: {birth['date']} {birth['time']} ({birth['timezone']}), lat {birth['latitude']}, lng {birth['longitude']}.\n"
              f"Birth time source: {c.get('timeSource', 'unknown')}.\n"
              f"atros: `{ATROS}` (`{ATROS} --help` lists commands). `--date`/`--time` are always the BIRTH date and time. Transits on a date:\n"
              f"`{ATROS} transit --date {birth['date']} --time {birth['time']} --lat {birth['latitude']} --lng {birth['longitude']} --tz {birth['timezone']} --as-of YYYY-MM-DD --output json`\n"
              f"Its houses are counted from the natal Moon (`house_from_moon`); count from the lagna yourself with the sign index. Degrees come from `{ATROS} chart`.\n\n")
    (ws / 'TASK.md').write_text(header + fill(task, c, ch))
    (ws / 'ANALYST.md').write_text((PROMPTS / 'analyst.md').read_text())
    print(ws)


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def collect(cid, run, n, step):
    c = case(cid)
    ch = chapter(c, n)
    rd = run_dir(c, run)
    ws = workspace(cid, run, ch, step)
    out = rd / 'chapters' / slug(ch)
    out.mkdir(parents=True, exist_ok=True)
    name = {'read': 'reading.md', 'match': 'match.md', 'forecast': 'forecast.md'}[step]
    if not (ws / name).exists():
        sys.exit(f'{ws / name} is missing')
    if step in ('read', 'forecast') and (out / name).exists():
        sys.exit(f'{out / name} is already sealed')
    shutil.copy(ws / name, out / name)
    if step in ('read', 'forecast'):
        with open(out / 'SEAL.txt', 'a') as f:
            f.write(f"{sha(out / name)}  {name}  sealed before {ch['start'] if step == 'read' else c['cutoff']} was revealed\n")
    # Notes carry forward; keep a copy per chapter so a run can be replayed.
    if (rd / 'notes').exists():
        shutil.rmtree(rd / 'notes')
    shutil.copytree(ws / 'notes', rd / 'notes')
    shutil.copytree(ws / 'notes', out / f'notes-after-{step}', dirs_exist_ok=True)
    checks = run_checks(c, ch, step, ws, out / name)
    (out / f'checks-{step}.json').write_text(json.dumps(checks, indent=1))
    print_checks(ch, step, checks)


def run_checks(c, ch, step, ws, path):
    checks = {'leaks': leak_check(c, ch, path, seen_to=ch['end'] if step == 'match' else None), 'dasha': dasha_check(c, path)}
    if step in ('read', 'forecast') and (ws / 'chart' / 'window.md').exists():
        checks['signals'] = signal_check(ws / 'chart' / 'window.md', path)
    if step in ('read', 'forecast') and 'situations-check' in FEATURES:
        checks['chain'] = chain_check(path)
    return checks


def print_checks(ch, step, checks):
    print(json.dumps({'chapter': slug(ch), 'step': step, 'leaks': len(checks['leaks']), 'dashaErrors': len(checks['dasha']),
                      **({'signalsUnanswered': checks['signals']} if 'signals' in checks else {}),
                      **({'chainFlags': len(checks['chain']['flags'])} if 'chain' in checks else {})}))
    for f in checks.get('chain', {}).get('flags', []):
        print('  chain: ' + f['problem'])


def check(cid, run, n, step):
    """The collect checks on the workspace output, before it is sealed: re-run the Analyst until they are clean."""
    c = case(cid)
    ch = chapter(c, n)
    ws = workspace(cid, run, ch, step)
    name = {'read': 'reading.md', 'match': 'match.md', 'forecast': 'forecast.md'}[step]
    if not (ws / name).exists():
        sys.exit(f'{ws / name} is missing')
    checks = run_checks(c, ch, step, ws, ws / name)
    # Left in the workspace so the Analyst can read what to fix.
    (ws / 'CHECKS.json').write_text(json.dumps(checks, indent=1))
    print_checks(ch, step, checks)


def signal_check(window, path):
    """Signal ids in chart/window.md that the reading never answers."""
    ids = re.findall(r'\*\*(S\d+)\*\*', Path(window).read_text())
    text = Path(path).read_text()
    named = set(re.findall(r'\bS(\d+)\b', text))
    # Grouped signals are often written as a range, e.g. "S26-S31" or "S26–31".
    for a, b in re.findall(r'\bS(\d+)\s*[-–]\s*S?(\d+)\b', text):
        named.update(str(k) for k in range(int(a), int(b) + 1))
    return [i for i in ids if i[1:] not in named]


WORD = re.compile(r"\b[A-Z][A-Za-z0-9.'-]{3,}\b")
COMMON = set(PLANETS) | {'Sept', 'India', 'America', 'United', 'States', 'Everything', 'January', 'February', 'March', 'April', 'June', 'July', 'August', 'September', 'October',
                         'November', 'December', 'Monday', 'Friday', 'Saturday', 'Sunday', 'This', 'That', 'There', 'They',
                         'Their', 'When', 'What', 'Where', 'With', 'From', 'After', 'Before', 'During', 'Expected', 'Lagna'}
MONTHS = {'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec', 'January', 'February', 'March', 'April',
          'June', 'July', 'August', 'September', 'October', 'November', 'December'}


def mid_sentence(body):
    """Capitalised words that appear at least once in the middle of a sentence: a sentence-initial 'Moves' is not a name."""
    out = set()
    for m in WORD.finditer(body):
        before = body[max(0, m.start() - 3):m.start()].rstrip(' "\'(*_')
        if before and before[-1] not in '.!?:;\n-#|':
            out.add(m.group())
    return out


def leak_check(c, ch, path, seen_to=None):
    """Proper names that first appear in the profile after this point and show up in the text."""
    text = Path(path).read_text()
    cut = seen_to or (ch['start'] if ch['n'] != 'final' else c['cutoff'])
    past, future, lower, past_text = set(), set(), set(), []
    for e in events(c):
        body = mask(c, e['title'] + ' ' + e['story'])
        lower.update(re.findall(r'\b[a-z][a-z0-9.\'-]{3,}\b', body))
        if when(e) < cut:
            past.update(WORD.findall(body))
            past_text.append(body.lower())
        else:
            future.update(mid_sentence(body))
    # Inner-life years the agent was shown count as known too.
    for f in (c['dir'] / PROFILE / 'inner').glob('*.md'):
        if f'{int(f.stem[:4])}-12-31' < cut:
            body = mask(c, f.read_text())
            past.update(WORD.findall(body))
            past_text.append(body.lower())
    # Proper names only: capitalised words that the profile never writes in lower case, and not dates ("May-June").
    names = {w for w in future - past - COMMON if w.lower() not in lower and not set(re.split(r'[-.]', w)) <= MONTHS | {''}}
    suspicious = sorted(names & set(WORD.findall(text)))
    # A case leak term the agent was already shown before this point (in life/) is not a leak.
    seen = '\n'.join(past_text)
    later_terms = [t for t in c.get('leakTerms', []) if t.lower() in text.lower() and t.lower() not in seen]
    return [{'term': t, 'kind': 'name-from-later'} for t in suspicious] + [{'term': t, 'kind': 'case-leak-term'} for t in later_terms]


def dasha_check(c, path):
    """Every 'Planet-Planet' chain named in the text must exist, and dates written next to it must fall inside it."""
    text = Path(path).read_text()
    rows = load(c['dir'] / 'chart' / 'periods-pratyantar.json')['rows']
    ad = {(r['mahadasha']['planet'], r['antardasha']['planet']): r['antardasha'] for r in rows}
    pd = {(r['mahadasha']['planet'], r['antardasha']['planet'], r['pratyantar']['planet']): r['pratyantar'] for r in rows}
    P = '|'.join(PLANETS)
    # Up to five levels (down to prana); only the first three are checked against the stored tables.
    pat = re.compile(r'(?<![-–\w])(' + P + r')\s*[-–]\s*(' + P + r')(?:\s*[-–]\s*(' + P + r'))?(?:\s*[-–]\s*(?:' + P + r')){0,2}\b')
    errors = []
    for m in pat.finditer(text):
        key = tuple(x for x in m.groups() if x)
        table = pd if len(key) == 3 else ad
        if key not in table:
            # A two-planet name may also mean antardasha-pratyantar inside the running MD; only flag impossible chains.
            if len(key) == 3 or not any(k[1:] == key for k in pd):
                errors.append({'chain': '-'.join(key), 'problem': 'no such period'})
            continue
        span = table[key]
        near = text[m.end():m.end() + 60].split('\n')[0]
        nxt = pat.search(near)
        near = near[:nxt.start()] if nxt else near  # dates after the next chain belong to it
        for d in re.findall(r'\d{4}-\d{2}-\d{2}', near)[:2]:
            # A date years away from the span means the pair named a conjunction, not a period.
            far = d < str(int(span['start'][:4]) - 2) or d > str(int(span['end'][:4]) + 2)
            if not far and not (span['start'] <= d <= span['end']):
                errors.append({'chain': '-'.join(key), 'date': d, 'stored': [span['start'], span['end']]})
    return errors


def inner_years(c, dest, start, end, profile=None):
    """Inner-life years that overlap [start, end]: the Scorer judges inner-life items against them."""
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted((c['dir'] / (profile or PROFILE) / 'inner').glob('*.md')):
        if int(start[:4]) <= int(f.stem[:4]) <= int(end[:4]):
            (dest / f.name).write_text(mask(c, f.read_text()))


def span_events(c, start, end, hidden, profile=None):
    if hidden:
        return [e for e in load(c['dir'] / 'hidden' / 'events.json') if start[:len(e['date'])] <= e['date'] <= end]
    return [e for e in load(c['dir'] / (profile or PROFILE) / 'events.json') if start <= when(e) < end]


def score_prep(cid, run, n):
    if n == 'regression':
        return regression_prep(cid, run)
    c = case(cid)
    ch = chapter(c, n)
    rd = run_dir(c, run)
    out = rd / 'chapters' / slug(ch)
    ws = workspace(cid, run, ch, 'score')
    if ws.exists():
        shutil.rmtree(ws)
    ws.mkdir(parents=True)
    if n == 'final':
        shutil.copy(out / 'forecast.md', ws / 'reading.md')
        ev = [e for e in load(c['dir'] / 'hidden' / 'events.json') if e['date'] <= c['hiddenEnd']]
    else:
        shutil.copy(out / 'reading.md', ws / 'reading.md')
        ev = [e for e in events(c) if ch['start'] <= when(e) < ch['end']]
    (ws / 'events.json').write_text(json.dumps(ev, indent=1, ensure_ascii=False))
    if 'scorer-inner' in FEATURES:
        inner_years(c, ws / 'inner', ch['start'], ch['end'])
    (ws / 'SCORER.md').write_text((PROMPTS / 'scorer.md').read_text())
    print(ws)


def tally(s):
    big = [e for e in s['events'] if e.get('magnitude', 0) >= 3]
    has_cov = any('covered' in e for e in s['events'])
    return {'events3+': len(big), 'seen': sum(e['verdict'] == 'seen' for e in big),
            'partly': sum(e['verdict'] == 'partly' for e in big), 'missed': sum(e['verdict'] == 'missed' for e in big),
            'covered': sum(bool(e.get('covered')) for e in big) if has_cov else None,
            'missedButNamed': sum(e['verdict'] == 'missed' and bool(e.get('namedAsTail')) for e in big),
            'falseAlarms': sum(x['verdict'] == 'false-alarm' for x in s.get('expected', [])),
            # A bet at .50 or more that the Scorer left among the tails (v4 scorers file these under expected).
            'tailBetsLeft': sum(num(t.get('probability')) >= .5 for t in s.get('tails', []))}


def score_collect(cid, run, n):
    if n == 'regression':
        return regression_collect(cid, run)
    c = case(cid)
    ch = chapter(c, n)
    ws = workspace(cid, run, ch, 'score')
    out = run_dir(c, run) / 'chapters' / slug(ch)
    s = load(ws / 'score.json')
    shutil.copy(ws / 'score.json', out / 'score.json')
    t = tally(s)
    print(json.dumps({'chapter': slug(ch), **{k: v for k, v in t.items() if v is not None}}))


# The Scorer regression set: past items with agreed verdicts, re-scored each run to catch drift. It quotes private
# records, so it lives in the data dir: $LIFE_READING_HOME/regression/items.json, a list of
#   {"id", "case", "profile", "span": [start, end], "hidden": bool, "reading": "the item as filed, with its ## heading",
#    "target": {"kind": "item", "contains": "..."} or {"kind": "event", "id": "..."}, "field": "verdict"|"covered",
#    "agreed": [allowed values], "why": "..."}

def regression_ws(cid, run):
    return WORK / hashlib.sha256(cid.encode()).hexdigest()[:10] / run / 'regression' / 'score'


def regression_prep(cid, run):
    items = load(HOME / 'regression' / 'items.json')
    ws = regression_ws(cid, run)
    if ws.exists():
        shutil.rmtree(ws)
    ws.mkdir(parents=True)
    for it in items:
        c = case(it['case'])
        d = ws / 'cases' / it['id']
        d.mkdir(parents=True)
        (d / 'reading.md').write_text(mask(c, it['reading']))
        ev = span_events(c, it['span'][0], it['span'][1], it.get('hidden'), it.get('profile'))
        (d / 'events.json').write_text(mask(c, json.dumps(ev, indent=1, ensure_ascii=False)))
        if 'scorer-inner' in FEATURES:
            inner_years(c, d / 'inner', it['span'][0], it['span'][1], it.get('profile'))
    (ws / 'SCORER.md').write_text((PROMPTS / 'scorer.md').read_text())
    (ws / 'TASK.md').write_text('Each folder under `cases/` is a separate, small scoring job: a short excerpt of a sealed reading and the record '
                                'for its period. Score each one exactly as `SCORER.md` describes, as if it were the whole reading, and write '
                                '`cases/<id>/score.json`. Judge each folder on its own.\n')
    print(ws)


def regression_collect(cid, run):
    items = load(HOME / 'regression' / 'items.json')
    ws = regression_ws(cid, run)
    res = []
    for it in items:
        f = ws / 'cases' / it['id'] / 'score.json'
        got = None
        if f.exists():
            s = load(f)
            tg, field = it['target'], it.get('field', 'verdict')
            if tg['kind'] == 'event':
                got = next((e.get(field) for e in s.get('events', []) if e.get('id') == tg['id']), None)
            else:
                got = next((x.get(field) for x in s.get('expected', []) + s.get('tails', [])
                            if tg['contains'].lower() in x.get('item', '').lower()), None)
        res.append({'id': it['id'], 'field': it.get('field', 'verdict'), 'agreed': it['agreed'], 'got': got, 'agrees': got in it['agreed']})
    summary = {'agree': sum(r['agrees'] for r in res), 'of': len(res), 'drift': [r for r in res if not r['agrees']]}
    (run_dir(case(cid), run) / 'regression.json').write_text(json.dumps({**summary, 'items': res}, indent=1))
    print(json.dumps(summary, indent=1))


def report(cid, run):
    c = case(cid)
    rd = run_dir(c, run)
    lines = ['| Chapter | Age | Counts | Events 3+ | Seen | Partly | Missed | Covered | Missed but named as a tail | False alarms | Dasha errors | Leak flags | '
             'Signals unanswered | Chain flags |',
             '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    for ch in chapters(c) + [chapter(c, 'final')]:
        out = rd / 'chapters' / slug(ch)
        if not (out / 'score.json').exists():
            continue
        t = tally(load(out / 'score.json'))
        chk = load(out / ('checks-read.json' if ch['n'] != 'final' else 'checks-forecast.json'))
        lines.append(f"| {ch['chain']} ({ch['start']} to {ch['end']}) | {ch['age']} | {'yes' if ch.get('counts', True) else 'no'} | {t['events3+']} | "
                     f"{t['seen']} | {t['partly']} | {t['missed']} | {'-' if t['covered'] is None else t['covered']} | {t['missedButNamed']} | "
                     f"{t['falseAlarms']} | "
                     f"{len(chk['dasha'])} | {len(chk['leaks'])} | "
                     f"{len(chk['signals']) if 'signals' in chk else '-'} | {len(chk['chain']['flags']) if 'chain' in chk else '-'} |")
    text = '\n'.join(lines)
    text += '\n\nCovered: a size-3+ event the reading named, as a bet or a tail, with a date window and direction that fit (v4 scorers).'
    if (rd / 'regression.json').exists():
        r = load(rd / 'regression.json')
        text += f"\n\nScorer regression set: {r['agree']} of {r['of']} agree with the agreed verdicts" + (
            '; drift on ' + ', '.join(f"{d['id']} ({d['field']}: got {d['got']}, agreed {'/'.join(map(str, d['agreed']))})" for d in r['drift'])
            if r['drift'] else '') + '.'
    (rd / 'REPORT.md').write_text(f'# {cid} / {run}\n\n{text}\n')
    print(text)


def sensitivity(cid):
    c = case(cid)
    out = c['dir'] / 'chart' / SENS
    subprocess.run([sys.executable, str(Path(__file__).resolve().parent / 'sensitivity.py'), str(c['dir'] / 'case.json'), str(out)], check=True)
    print(out)


# ---------------------------------------------------------------------------------------------------------------
# Situations chain (prompt sets with situations-check)

PROB = re.compile(r'(?<![\d.\w])(0?\.\d{1,3}|1\.0|\d{1,3}(?:\.\d+)?%)(?![\d.])')


def probs(line):
    out = []
    for x in PROB.findall(line):
        v = float(x[:-1]) / 100 if x.endswith('%') else float(x)
        if 0 < v <= 1:
            out.append(v)
    return out


def section(text, title):
    """The body of a `## title` section (up to the next `## `)."""
    m = re.search(r'^##\s+' + re.escape(title) + r'\b.*$', text, re.M | re.I)
    if not m:
        return ''
    nxt = re.search(r'^##\s', text[m.end():], re.M)
    return text[m.end():m.end() + nxt.start()] if nxt else text[m.end():]


def situations_block(text):
    """The machine-readable situations block: a fenced ```json situations``` (or ```situations```) block."""
    m = re.search(r'```(?:json)?\s*situations\s*\n(.*?)```', text, re.S | re.I)
    if not m:
        return None, None
    try:
        return json.loads(m.group(1)), None
    except json.JSONDecodeError as e:
        return None, f'the situations block is not valid JSON: {e}'


def situations_table(text):
    """Fallback for readings without the block: rows of the markdown table under a heading that names situations."""
    m = re.search(r'^#+ .*situation.*$', text, re.M | re.I)
    if not m:
        return []
    rows = []
    for line in text[m.end():].splitlines():
        if line.startswith('#'):
            break
        if not line.startswith('|') or set(line) <= set('|-: '):
            continue
        cells = [x.strip() for x in line.strip('|').split('|')]
        nums = [probs(x)[:1] for x in cells[1:]]
        if all(nums) and len(nums) >= 2:
            rows.append({'row': cells[0], 'shares': [x[0] for x in nums]})
    return rows


def chain_check(path):
    """Is the chain of situations run through to the bets? See the review that motivated v4, Change 1.

    Flags: a whole-span figure more than .05 from what its own window risks add up to; window risks that the table
    of situations does not carry; Expected items written for one situation but not scaled by its odds; shares that
    don't add to 1; and any item at .50 or more filed under Named tails."""
    text = Path(path).read_text()
    flags, out = [], {}
    for line in section(re.sub(r'```.*?```', '', text, flags=re.S), 'Named tails').splitlines():
        p = probs(line)
        if p and max(p) >= .5:
            flags.append({'kind': 'tail-at-or-above-.50', 'problem': f'Named tails holds a bet at {max(p):.2f} or more; '
                          f'a bet that likely belongs under Expected: {line.strip()[:160]}'})
    blk, err = situations_block(text)
    if err:
        flags.append({'kind': 'block', 'problem': err})
    if blk:
        wins = blk.get('windows', [])
        turns = sorted({t for w in wins for t in w.get('risks', {})} | set(blk.get('span', {})))
        hazard = {}
        for t in turns:
            q = 1.0
            for w in wins:
                q *= 1 - float(w.get('risks', {}).get(t, 0))
            hazard[t] = round(1 - q, 3)
        out['spanComputed'] = hazard
        out['spanStated'] = blk.get('span', {})
        for t, v in blk.get('span', {}).items():
            if t in hazard and any(t in w.get('risks', {}) for w in wins) and abs(float(v) - hazard[t]) > .05:
                flags.append({'kind': 'span-vs-windows', 'turn': t, 'stated': v, 'computed': hazard[t],
                              'problem': f'"{t}": the whole-span figure is {float(v):.2f}, but the window risks add up to {hazard[t]:.2f} '
                                         '(1 minus the product of each window\'s chance it does not happen)'})
        for w in wins:
            sh = w.get('share', {})
            if sh and abs(sum(float(v) for v in sh.values()) - 1) > .05:
                flags.append({'kind': 'shares', 'window': w.get('name'), 'problem': f"window {w.get('name')}: the situation odds add to "
                              f"{sum(float(v) for v in sh.values()):.2f}, not 1"})
        # A turn that leads into a situation: the window's chance of the turn should show up in that situation's odds.
        for t, into in blk.get('leadsTo', {}).items():
            for w in wins:
                r, sh = float(w.get('risks', {}).get(t, 0)), w.get('share', {})
                if into in sh and r > float(sh[into]) + .05:
                    flags.append({'kind': 'table-vs-window', 'window': w.get('name'), 'turn': t,
                                  'problem': f"window {w.get('name')}: \"{t}\" is put at {r:.2f} inside the window, yet \"{into}\" "
                                             f"is only {float(sh[into]):.2f} at its end"})
        # Expected items written for one situation can't be likelier than that situation.
        byname = {w.get('name'): i for i, w in enumerate(wins)}
        for it in blk.get('items', []):
            sit = it.get('situation')
            if not sit or sit in ('all', 'any'):
                continue
            idx = [byname[it['window']]] if it.get('window') in byname else range(len(wins))
            odds = [float(wins[i].get('share', {}).get(sit, 0)) for i in idx]
            # The window's odds at its start (the previous window's end) or its end, whichever is higher.
            odds += [float(wins[i - 1].get('share', {}).get(sit, 0)) for i in idx if i > 0]
            top = max(odds) if odds else 0
            if float(it.get('p', 0)) > top + .02:
                flags.append({'kind': 'item-not-scaled', 'item': it.get('n'),
                              'problem': f"Expected item {it.get('n')} is written for \"{sit}\" at {float(it['p']):.2f}, but that situation's "
                                         f"odds are at most {top:.2f} there; scale it by them, or say what it is in the other situations"})
    elif not err:
        out['table'] = situations_table(text)
        for r in out['table']:
            if abs(sum(r['shares']) - 1) > .05:
                flags.append({'kind': 'shares', 'window': r['row'], 'problem': f"table row {r['row']}: the situation odds add to {sum(r['shares']):.2f}, not 1"})
        if out['table']:
            out['note'] = 'no situations block: span hazards and item scaling could not be computed'
    return {**out, 'flags': flags}


# ---------------------------------------------------------------------------------------------------------------
# Arena lean record (prompt sets with arena-record)

ARENAS = ['career', 'money', 'relationships', 'family', 'health', 'inner life', 'place']
DOMAIN_ARENA = {'career': 'career', 'education': 'career', 'reputation': 'career', 'network': 'career', 'money': 'money',
                'relationships': 'relationships', 'family': 'family', 'health': 'health', 'inner': 'inner life', 'mind': 'inner life',
                'mind-worldview': 'inner life', 'home': 'place', 'travel': 'place'}
KEYWORDS = [('career', r'career|work|job|education|degree|college|study|research|business|venture|startup|paper|offer|employ'),
            ('money', r'money|income|salary|financ|pay|earn|savings|debt'),
            ('relationships', r'relationship|romance|romantic|partner|love|girlfriend|connection|marriage|dating|crush|friend'),
            ('family', r'family|father|mother|sister|brother|parent'),
            ('health', r'health|illness|injur|body|substance|alcohol|drug|drink|sleep'),
            ('inner life', r'inner|mood|belief|mind|spirit|depress|low|panic|breakdown|anxiety'),
            ('place', r'home|move|location|residence|abroad|travel|city|relocat')]


def arena_of(text, given=None):
    if given in ARENAS:
        return given
    if given and given.lower() in DOMAIN_ARENA:
        return DOMAIN_ARENA[given.lower()]
    text = re.sub(r'^\s*\d+[.)]\s*', '', text or '')
    head = re.split(r'\s[-–]\s|:', text, maxsplit=1)[0].lower()
    for probe in (head, text.lower()):
        for a, pat in KEYWORDS:
            if re.search(pat, probe):
                return a
    return None


def num(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def direction_of(d):
    d = (d or '').lower()
    if d in ('build', 'up', 'positive'):
        return 'build'
    if d in ('break', 'down', 'negative'):
        return 'break'
    return 'mixed' if d in ('mixed', 'both') else ''


def all_events(c):
    ev = {e['id']: e for e in events(c)}
    if (c['dir'] / 'hidden' / 'events.json').exists():
        ev.update({e['id']: e for e in load(c['dir'] / 'hidden' / 'events.json')})
    return ev


def arena_record(c, rd, ch):
    """A per-arena table of how the run's earlier bets went, from every earlier chapter's score.json in this run."""
    evs = all_events(c)
    before = [x for x in chapters(c) if ch['n'] == 'final' or x['n'] < ch['n']]
    rec = {a: {'build': [0, 0, 0, 0], 'break': [0, 0, 0, 0], '': [0, 0, 0, 0], 'missBuild': 0, 'missBreak': 0, 'missOther': 0,
               'tailsHappened': 0, 'tails': 0, 'lost': []} for a in ARENAS}
    col = {'happened': 0, 'partly': 1, 'false-alarm': 2, 'unrecorded': 3}
    n = 0
    for x in before:
        f = rd / 'chapters' / slug(x) / 'score.json'
        if not f.exists():
            continue
        n += 1
        s = load(f)
        for it in s.get('expected', []):
            a = arena_of(it.get('item', ''), it.get('arena'))
            if not a or num(it.get('size'), 3) < 3 or it.get('verdict') not in col:
                continue
            d = direction_of(it.get('direction'))
            rec[a][d if d != 'mixed' else ''][col[it['verdict']]] += 1
            if it['verdict'] == 'false-alarm':
                rec[a]['lost'].append(f"{x['chain']}: bet {d or 'unmarked'}, did not happen: {it.get('item', '')[:90]}")
        for e in s.get('events', []):
            if num(e.get('magnitude')) < 3 or e.get('verdict') != 'missed':
                continue
            src = evs.get(e.get('id'), {})
            a = arena_of(src.get('title', ''), e.get('arena') or next((dd for dd in src.get('domains', []) if dd in DOMAIN_ARENA), None))
            if not a:
                continue
            d = direction_of(e.get('direction') or src.get('valence'))
            rec[a]['missBuild' if d == 'build' else 'missBreak' if d == 'break' else 'missOther'] += 1
            rec[a]['lost'].append(f"{x['chain']}: missed a {d or 'mixed'} event: {src.get('title', e.get('id'))[:90]}"
                                  + (' (you had named it as a tail)' if e.get('namedAsTail') else ''))
        for t in s.get('tails', []):
            a = arena_of(t.get('item', ''), t.get('arena'))
            if not a or num(t.get('size'), 3) < 3:
                continue
            rec[a]['tails'] += 1
            rec[a]['tailsHappened'] += t.get('verdict') == 'happened'
    lines = ['## Your record so far, by part of life', '',
             f'Computed from the Scorer\'s verdicts on {n} earlier chapter(s) of this walk, items and events of size 3 or more. '
             'Bets are your Expected items, by the direction they leaned (build: things go up or come together; break: things go down or come apart): '
             'held / partly / failed / unrecorded. Misses are events you did not see, by their direction. '
             'Tails that happened are turns you named but bet against.', '',
             '| Part of life | Bets on build | Bets on break | Bets, direction not marked | Missed: build / break / mixed | Tails that happened / named |',
             '|---|---|---|---|---|---|']
    for a in ARENAS:
        r = rec[a]
        fmt = lambda v: ' / '.join(map(str, v)) if any(v) else '-'
        lines.append(f"| {a} | {fmt(r['build'])} | {fmt(r['break'])} | {fmt(r[''])} | {r['missBuild']} / {r['missBreak']} / {r['missOther']} | "
                     f"{r['tailsHappened']} / {r['tails']} |")
    lost = [(a, l) for a in ARENAS for l in rec[a]['lost']]
    if lost:
        lines += ['', 'Where you lost:']
        lines += [f'- {a}: {l}' for a, l in lost]
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'chapters':
        print(json.dumps(chapters(case(a[1])), indent=1))
    elif a[0] == 'prepare':
        prepare(a[1], a[2], a[3], a[4])
    elif a[0] == 'collect':
        collect(a[1], a[2], a[3], a[4])
    elif a[0] == 'score-prep':
        score_prep(a[1], a[2], a[3])
    elif a[0] == 'score-collect':
        score_collect(a[1], a[2], a[3])
    elif a[0] == 'report':
        report(a[1], a[2])
    elif a[0] == 'check':
        check(a[1], a[2], a[3], a[4])
    elif a[0] == 'sensitivity':
        sensitivity(a[1])
