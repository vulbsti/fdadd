"""Write the chart signals for one window: the period lords running in it, the houses that carry each part of life,
and every slow-transit ingress, station and exact contact with a natal point. Each signal gets an id (S1, S2, ...)
so `walk.py collect` can check that a reading answered every one.

Runs under the atros venv (it needs swisseph):
    /tmp/atros-venv/bin/python signals.py <chart-dir> <start> <end> > window.md
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import swisseph as swe

SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
LORD = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter']
SLOW = {'Jupiter': swe.JUPITER, 'Saturn': swe.SATURN, 'Rahu': swe.TRUE_NODE}
ORB = 2.0
# Full aspects counted as houses from the transiting planet (1 = conjunction).
ASPECTS = {'Jupiter': [1, 5, 7, 9], 'Saturn': [1, 3, 7, 10], 'Rahu': [1], 'Ketu': [1]}
# Houses that carry each part of life, counted from the lagna; derived houses (6th, 8th, 12th from the house) included.
AREAS = [
    ('career', [10, 3, 5, 9], '10th; 6th, 8th and 12th from it are the 3rd, 5th and 9th'),
    ('money', [2, 11, 1, 10], '2nd and 11th; 12th from them are the 1st and 10th'),
    ('home and mother', [4], '4th'),
    ('partner and relationships', [7, 5], '7th; 5th for romance'),
    ('father, teachers, beliefs', [9], '9th'),
    ('health, conflict, debt', [6, 8], '6th and 8th'),
    ('loss, isolation, abroad', [12], '12th'),
]


def lon(body, d):
    jd = swe.julday(d.year, d.month, d.day, 12.0)
    xx, _ = swe.calc_ut(jd, body, swe.FLG_SIDEREAL | swe.FLG_SPEED)
    return xx[0] % 360, xx[3]


def sep(a, b):
    x = abs(a - b) % 360
    return min(x, 360 - x)


def house(sign, from_sign):
    return (sign - from_sign) % 12 + 1


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def main(chart_dir, start, end):
    swe.set_sid_mode(swe.SIDM_LAHIRI)
    chart_dir = Path(chart_dir)
    c = json.loads((chart_dir / 'chart.json').read_text())
    lag = c['lagna_chart']['ascendant']['sign_index']
    planets = {p['planet']: p for p in c['lagna_chart']['planets']}
    moon = planets['Moon']['sign_index']
    chalit = {p['planet']: p['bhava_house'] for p in c['bhava_chalit']['positions']}
    div = c['divisional_charts']
    vargas = {k: ({p['planet']: p['sign_index'] for p in div[k]['positions']}, div[k].get('ascendant', {}).get('sign_index'))
              for k in ('D9', 'D10') if k in div}
    natal = {name: p['absolute_degree'] for name, p in planets.items()}
    natal['Lagna'] = c['lagna_chart']['ascendant'].get('absolute_degree', lag * 30 + c['lagna_chart']['ascendant']['degree'])

    out, n = [], 0

    def sid():
        nonlocal n
        n += 1
        return f'S{n}'

    out.append(f'# Chart signals, {start} to {end}\n')
    out.append('Computed from the birth chart and the Swiss Ephemeris (Lahiri, true node, positions at 12:00 UT). '
               'Each line is a signal; answer every one by its id. Houses are whole-sign from the lagna '
               f'({SIGNS[lag]}) unless marked; "from Moon" counts from the natal Moon ({SIGNS[moon]}).\n')

    # Period lords
    rows = json.loads((chart_dir / 'periods-pratyantar.json').read_text())['rows']
    live = [r for r in rows if r['pratyantar']['start'] < end and r['pratyantar']['end'] > start]
    out.append('## Periods running\n')
    seen = []
    for r in live:
        a, p = r['antardasha'], r['pratyantar']
        out.append(f"- {r['chain']}: {max(p['start'], start)} to {min(p['end'], end)}")
        for x in (r['mahadasha']['planet'], a['planet'], p['planet']):
            if x not in seen:
                seen.append(x)
    out.append('\n## What each period lord is in this chart\n')
    for x in seen:
        pl = planets[x]
        s = pl['sign_index']
        rules = [house(i, lag) for i in range(12) if LORD[i] == x]
        rules_m = [house(i, moon) for i in range(12) if LORD[i] == x]
        joined = [o for o, q in planets.items() if o != x and q['sign_index'] == s]
        bits = [f"in {SIGNS[s]} {pl['degree']:.1f}, {ordinal(house(s, lag))} house"
                + (f" ({ordinal(chalit[x])} by chalit)" if chalit.get(x) and chalit[x] != house(s, lag) else ''),
                f"{ordinal(house(s, moon))} from Moon",
                ('rules ' + ', '.join(ordinal(h) for h in sorted(rules)) + ' (from Moon: ' + ', '.join(ordinal(h) for h in sorted(rules_m)) + ')') if rules else 'rules no sign',
                f"star {pl['nakshatra']} ({pl.get('nakshatra_lord', '?')})",
                pl.get('dignity') or '', 'retrograde' if pl.get('retrograde') else '',
                ('with ' + ', '.join(joined)) if joined else '']
        for k, (pos, asc) in vargas.items():
            if x in pos:
                bits.append(f"{k} {SIGNS[pos[x]]}" + (f" ({ordinal(house(pos[x], asc))})" if asc is not None else ''))
        out.append(f"- **{sid()}** {x}: " + '; '.join(b for b in bits if b))

    out.append('\n## Houses for each part of life\n')
    for area, hs, why in AREAS:
        parts = []
        for h in hs:
            sgn = (lag + h - 1) % 12
            occ = [o for o, q in planets.items() if q['sign_index'] == sgn]
            parts.append(f"{ordinal(h)} {SIGNS[sgn]}, lord {LORD[sgn]}" + (f", holds {', '.join(occ)}" if occ else ''))
        out.append(f"- **{sid()}** {area} ({why}): " + '; '.join(parts))

    # Slow transits, from 60 days before the window so contacts on their approach are caught.
    d0, d1 = date.fromisoformat(start) - timedelta(days=60), date.fromisoformat(end)
    days = [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]
    out.append('\n## Slow transits\n')
    for name, body in list(SLOW.items()) + [('Ketu', None)]:
        track = []
        for d in days:
            if body is None:
                l, sp = lon(swe.TRUE_NODE, d)
                l = (l + 180) % 360
            else:
                l, sp = lon(body, d)
            track.append((d, l, sp))
        # Sign at the window start, then ingresses inside the window.
        w0 = date.fromisoformat(start)
        at0 = next(l for d, l, _ in track if d >= w0)
        s0 = int(at0 // 30)
        out.append(f"- **{sid()}** {name} is in {SIGNS[s0]} at {start} ({ordinal(house(s0, lag))}, {ordinal(house(s0, moon))} from Moon)")
        for (pd, pl, _), (d, l, _) in zip(track, track[1:]):
            if d > w0 and int(l // 30) != int(pl // 30):
                s = int(l // 30)
                out.append(f"- **{sid()}** {d}: {name} enters {SIGNS[s]} ({ordinal(house(s, lag))}, {ordinal(house(s, moon))} from Moon)")
        # Stations (not for the nodes)
        if name in ('Jupiter', 'Saturn'):
            for (pd, pl, ps), (d, l, s) in zip(track, track[1:]):
                if d >= w0 and (ps > 0) != (s > 0):
                    near = min(natal, key=lambda k: sep(natal[k], l))
                    out.append(f"- **{sid()}** {d}: {name} stations {'retrograde' if s < 0 else 'direct'} at {SIGNS[int(l // 30)]} {l % 30:.1f}"
                               f" (nearest natal point {near} {natal[near] % 30:.1f} {SIGNS[int(natal[near] // 30)]}, {sep(natal[near], l):.1f} deg)")
        # Conjunctions and full aspects to natal points within the orb, with entry, closest and exit dates.
        for asp in ASPECTS[name]:
            for k, nl in natal.items():
                run = []
                for d, l, _ in track + [(None, None, None)]:
                    close = l is not None and sep((l + 30 * (asp - 1)) % 360, nl) <= ORB
                    if close:
                        run.append((d, sep((l + 30 * (asp - 1)) % 360, nl)))
                    elif run:
                        if run[-1][0] >= w0:
                            best = min(run, key=lambda r: r[1])
                            how = 'conjunct' if asp == 1 else f'{ordinal(asp)}-house aspect on'
                            out.append(f"- **{sid()}** {run[0][0]} to {run[-1][0]}: {name} {how} natal {k}"
                                       f" ({SIGNS[int(nl // 30)]} {nl % 30:.1f}) within {ORB:.0f} deg; closest {best[0]} ({best[1]:.2f} deg)")
                        run = []
    # Mars: stations, and the days it passes exactly over a natal point (fast, but these mattered in earlier runs).
    out.append('\n## Mars\n')
    track = [(d, *lon(swe.MARS, d)) for d in days if d >= date.fromisoformat(start)]
    for (pd, pl, ps), (d, l, s) in zip(track, track[1:]):
        if (ps > 0) != (s > 0):
            out.append(f"- **{sid()}** {d}: Mars stations {'retrograde' if s < 0 else 'direct'} at {SIGNS[int(l // 30)]} {l % 30:.1f}")
    hits = sorted((b[0], k, nl) for k, nl in natal.items() for a, b, cc in zip(track, track[1:], track[2:])
                  if sep(b[1], nl) <= 1.0 and sep(b[1], nl) <= sep(a[1], nl) and sep(b[1], nl) < sep(cc[1], nl))
    for d, k, nl in hits:
        out.append(f"- **{sid()}** {d}: Mars conjunct natal {k} ({SIGNS[int(nl // 30)]} {nl % 30:.1f})")
    print('\n'.join(out))


if __name__ == '__main__':
    main(*sys.argv[1:4])
