"""Which placements change if the birth time is off by a few minutes.

Recomputes the chart with atros at every minute from -N to +N around the recorded birth time and lists every
placement that differs from the recorded chart: the lagna sign, bhava chalit houses, each divisional chart's lagna,
each planet's divisional sign, and how far the dasha dates move. `signals.py --v4` reads the result and marks the
signals that depend on a placement that changes.

    python3 sensitivity.py <case.json> <out.json> [minutes]

`walk.py sensitivity <case>` runs it and writes `chart/sensitivity-placements.json` in the case.
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta

ATROS = os.environ.get('ATROS_BIN', '/tmp/atros-venv/bin/atros')
SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']


def chart(b, hhmm):
    out = subprocess.run([ATROS, 'chart', '--name', 'x', '--date', b['date'], '--time', hhmm, '--lat', str(b['latitude']),
                          '--lng', str(b['longitude']), '--tz', b['timezone'], '--output', 'json'],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def summary(c):
    lag = c['lagna_chart']['ascendant']
    return {
        'lagna': SIGNS[lag['sign_index']],
        'lagnaDegree': lag['sign_index'] * 30 + lag['degree'],
        'chalit': {p['planet']: p['bhava_house'] for p in c['bhava_chalit']['positions']},
        'vargaLagna': {k: v['ascendant']['sign'] for k, v in c['divisional_charts'].items() if v.get('ascendant')},
        'vargaPlanets': {k: {p['planet']: p['sign'] for p in v['positions']} for k, v in c['divisional_charts'].items()},
        'mahadashaStart': {m['planet']: m['start_date'] for m in c['dasha_timeline']['mahadashas']},
    }


def main(case_path, out_path, minutes=5):
    b = json.load(open(case_path))['birth']
    t0 = datetime.strptime(b['time'], '%H:%M')
    snaps = {k: summary(chart(b, (t0 + timedelta(minutes=k)).strftime('%H:%M'))) for k in range(-minutes, minutes + 1)}
    base = snaps[0]
    res = {'minutes': minutes, 'lagna': {'base': base['lagna'], 'changes': []}, 'lagnaDegreeRange': None,
           'chalit': {}, 'vargaLagna': {}, 'vargaPlanets': {}, 'dashaShiftDays': {}, 'fragile': []}
    degs = [s['lagnaDegree'] for s in snaps.values()]
    res['lagnaDegreeRange'] = [round(min(degs), 2), round(max(degs), 2)]

    def note(bucket, key, base_v, off, v):
        e = bucket.setdefault(key, {'base': base_v, 'changes': []})
        if not any(x['value'] == v and (x['offset'] > 0) == (off > 0) for x in e['changes']):
            e['changes'].append({'offset': off, 'value': v})

    # Closest offsets first, so the first change listed on each side is where it flips.
    for off in sorted((k for k in snaps if k), key=abs):
        s = snaps[off]
        if s['lagna'] != base['lagna']:
            res['lagna']['changes'].append({'offset': off, 'value': s['lagna']})
        for p, h in s['chalit'].items():
            if h != base['chalit'].get(p):
                note(res['chalit'], p, base['chalit'].get(p), off, h)
        for k, v in s['vargaLagna'].items():
            if v != base['vargaLagna'].get(k):
                note(res['vargaLagna'], k, base['vargaLagna'].get(k), off, v)
        for k, pos in s['vargaPlanets'].items():
            for p, v in pos.items():
                if v != base['vargaPlanets'].get(k, {}).get(p):
                    note(res['vargaPlanets'].setdefault(k, {}), p, base['vargaPlanets'][k].get(p), off, v)
    res['vargaPlanets'] = {k: v for k, v in res['vargaPlanets'].items() if v}
    for off in (-minutes, minutes):
        d = [(date.fromisoformat(snaps[off]['mahadashaStart'][p]) - date.fromisoformat(base['mahadashaStart'][p])).days
             for p in base['mahadashaStart']]
        res['dashaShiftDays'][str(off)] = max(d, key=abs)

    def first(ch):
        return ', '.join(f"{x['value']} at {x['offset']:+d} min" for x in ch)

    if res['lagna']['changes']:
        res['fragile'].append(f"Lagna {base['lagna']} becomes {first(res['lagna']['changes'])}")
    for p, e in res['chalit'].items():
        res['fragile'].append(f"{p} by chalit: {e['base']} becomes {first(e['changes'])}")
    for k, e in res['vargaLagna'].items():
        res['fragile'].append(f"{k} lagna {e['base']} becomes {first(e['changes'])} (every planet's {k} house moves)")
    for k, ps in res['vargaPlanets'].items():
        for p, e in ps.items():
            res['fragile'].append(f"{p} in {k}: {e['base']} becomes {first(e['changes'])}")
    json.dump(res, open(out_path, 'w'), indent=1)
    print('\n'.join(res['fragile']) or 'nothing changes')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 5)
