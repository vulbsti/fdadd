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
  walk.py score-prep <case> <run> <n|final>     workspace for the Scorer
  walk.py score-collect <case> <run> <n|final>
  walk.py report <case> <run>                   misses by chapter
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
        sig = subprocess.run([str(py), str(Path(__file__).resolve().parent / 'signals.py'), str(c['dir'] / 'chart'), ch['start'], ch['end']],
                             check=True, capture_output=True, text=True).stdout
        (ws / 'chart' / 'window.md').write_text(sig)
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
    checks = {'leaks': leak_check(c, ch, out / name, seen_to=ch['end'] if step == 'match' else None), 'dasha': dasha_check(c, out / name)}
    if step in ('read', 'forecast') and (ws / 'chart' / 'window.md').exists():
        checks['signals'] = signal_check(ws / 'chart' / 'window.md', out / name)
    (out / f'checks-{step}.json').write_text(json.dumps(checks, indent=1))
    print(json.dumps({'chapter': slug(ch), 'step': step, 'leaks': len(checks['leaks']), 'dashaErrors': len(checks['dasha']),
                      **({'signalsUnanswered': checks['signals']} if 'signals' in checks else {})}))


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


def leak_check(c, ch, path, seen_to=None):
    """Proper names that first appear in the profile after this point and show up in the text."""
    text = Path(path).read_text()
    cut = seen_to or (ch['start'] if ch['n'] != 'final' else c['cutoff'])
    past, future, lower = set(), set(), set()
    for e in events(c):
        body = mask(c, e['title'] + ' ' + e['story'])
        lower.update(re.findall(r'\b[a-z][a-z0-9.\'-]{3,}\b', body))
        (past if when(e) < cut else future).update(WORD.findall(body))
    # Inner-life years the agent was shown count as known too.
    for f in (c['dir'] / PROFILE / 'inner').glob('*.md'):
        if f'{int(f.stem[:4])}-12-31' < cut:
            past.update(WORD.findall(mask(c, f.read_text())))
    # Proper names only: capitalised words that the profile never writes in lower case.
    names = {w for w in future - past - COMMON if w.lower() not in lower}
    suspicious = sorted(names & set(WORD.findall(text)))
    later_terms = [t for t in c.get('leakTerms', []) if t.lower() in text.lower()]
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


def score_prep(cid, run, n):
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
    (ws / 'SCORER.md').write_text((PROMPTS / 'scorer.md').read_text())
    print(ws)


def score_collect(cid, run, n):
    c = case(cid)
    ch = chapter(c, n)
    ws = workspace(cid, run, ch, 'score')
    out = run_dir(c, run) / 'chapters' / slug(ch)
    s = load(ws / 'score.json')
    shutil.copy(ws / 'score.json', out / 'score.json')
    big = [e for e in s['events'] if e.get('magnitude', 0) >= 3]
    print(json.dumps({'chapter': slug(ch), 'events3+': len(big), 'seen': sum(e['verdict'] == 'seen' for e in big),
                      'partly': sum(e['verdict'] == 'partly' for e in big), 'missed': sum(e['verdict'] == 'missed' for e in big),
                      'missedButNamed': sum(e['verdict'] == 'missed' and bool(e.get('namedAsTail')) for e in big),
                      'falseAlarms': sum(x['verdict'] == 'false-alarm' for x in s.get('expected', []))}))


def report(cid, run):
    c = case(cid)
    rd = run_dir(c, run)
    lines = ['| Chapter | Age | Counts | Events 3+ | Seen | Partly | Missed | Missed but named as a tail | False alarms | Dasha errors | Leak flags | Signals unanswered |',
             '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for ch in chapters(c) + [chapter(c, 'final')]:
        out = rd / 'chapters' / slug(ch)
        if not (out / 'score.json').exists():
            continue
        s = load(out / 'score.json')
        big = [e for e in s['events'] if e.get('magnitude', 0) >= 3]
        chk = load(out / ('checks-read.json' if ch['n'] != 'final' else 'checks-forecast.json'))
        lines.append(f"| {ch['chain']} ({ch['start']} to {ch['end']}) | {ch['age']} | {'yes' if ch.get('counts', True) else 'no'} | {len(big)} | "
                     f"{sum(e['verdict'] == 'seen' for e in big)} | {sum(e['verdict'] == 'partly' for e in big)} | {sum(e['verdict'] == 'missed' for e in big)} | "
                     f"{sum(e['verdict'] == 'missed' and bool(e.get('namedAsTail')) for e in big)} | "
                     f"{sum(x['verdict'] == 'false-alarm' for x in s.get('expected', []))} | {len(chk['dasha'])} | {len(chk['leaks'])} | "
                     f"{len(chk['signals']) if 'signals' in chk else '-'} |")
    text = '\n'.join(lines)
    (rd / 'REPORT.md').write_text(f'# {cid} / {run}\n\n{text}\n')
    print(text)


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
