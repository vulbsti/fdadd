"""Write the chart signals for one window: the period lords running in it, the houses that carry each part of life,
and every slow-transit ingress, station and exact contact with a natal point. Each signal gets an id (S1, S2, ...)
so `walk.py collect` can check that a reading answered every one.

Runs under the atros venv (it needs swisseph):
    /tmp/atros-venv/bin/python signals.py <chart-dir> <start> <end> [--v4] > window.md

With --v4 (prompt sets from v4 on) each slow contact also lists the stations and sub-periods inside its orb, a
contact that began before the window keeps its true entry date, every period lord gets its houses counted from the
10th, 2nd, 11th, 7th and 4th, Jupiter leaving the Moon, the lagna or a period lord is a signal of its own (egress),
and anything that moves within the birth-time uncertainty (`sensitivity-placements.json`, from sensitivity.py) is
marked. Without the flag the output is what v3 saw.
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


# Houses counted from these, for each period lord's derived roles (v4).
BASES = [(10, 'the 10th'), (2, 'the 2nd'), (11, 'the 11th'), (7, 'the 7th'), (4, 'the 4th')]


def derived(h):
    """House h (from the lagna) counted from each base house, e.g. 3 -> '6th from the 10th'."""
    return [((h - b) % 12 + 1, name) for b, name in BASES]


def sign_aspects(name, sign):
    """Signs a slow planet in `sign` occupies or aspects by whole sign."""
    return {(sign + a - 1) % 12 for a in ASPECTS[name]}


def main(chart_dir, start, end, v4=False):
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

    sens = {}
    if v4 and (chart_dir / 'sensitivity-placements.json').exists():
        sens = json.loads((chart_dir / 'sensitivity-placements.json').read_text())

    def fragile(what):
        """A short birth-time warning for a placement, or ''."""
        if not sens:
            return ''
        kind, key, *rest = what
        if kind == 'chalit':
            e, say = sens['chalit'].get(key), lambda v: f'the {ordinal(v)} by chalit'
        elif kind == 'varga-lagna':
            e, say = sens['vargaLagna'].get(key), lambda v: f'{key} lagna becomes {v}, so this house moves'
        elif kind == 'varga-planet':
            e, say = sens['vargaPlanets'].get(key, {}).get(rest[0]), lambda v: f'{key} sign becomes {v}'
        else:
            e = None
        if not e:
            return ''
        flip = min(e['changes'], key=lambda x: abs(x['offset']))
        return f" [birth-time fragile: {say(flip['value'])} at {flip['offset']:+d} min]"

    out, n = [], 0

    def sid():
        nonlocal n
        n += 1
        return f'S{n}'

    out.append(f'# Chart signals, {start} to {end}\n')
    out.append('Computed from the birth chart and the Swiss Ephemeris (Lahiri, true node, positions at 12:00 UT). '
               'Each line is a signal; answer every one by its id. Houses are whole-sign from the lagna '
               f'({SIGNS[lag]}) unless marked; "from Moon" counts from the natal Moon ({SIGNS[moon]}).\n')
    if sens:
        m = sens['minutes']
        sh = sens['dashaShiftDays']
        out.append(f"Birth time: within {m} minutes either way of the recorded time, every dasha date moves by up to "
                   f"{max(abs(v) for v in sh.values())} days, and the lagna runs from {SIGNS[int(sens['lagnaDegreeRange'][0] // 30)]} "
                   f"{sens['lagnaDegreeRange'][0] % 30:.1f} to {SIGNS[int(sens['lagnaDegreeRange'][1] // 30)]} {sens['lagnaDegreeRange'][1] % 30:.1f}. "
                   'Placements that change in that range are marked "birth-time fragile" below; '
                   + ('; '.join(sens['fragile']) if sens['fragile'] else 'none do') + '.\n')

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
                + (f" ({ordinal(chalit[x])} by chalit)" if chalit.get(x) and chalit[x] != house(s, lag) else '')
                + fragile(('chalit', x)),
                f"{ordinal(house(s, moon))} from Moon",
                ('rules ' + ', '.join(ordinal(h) for h in sorted(rules)) + ' (from Moon: ' + ', '.join(ordinal(h) for h in sorted(rules_m)) + ')') if rules else 'rules no sign',
                f"star {pl['nakshatra']} ({pl.get('nakshatra_lord', '?')})",
                pl.get('dignity') or '', 'retrograde' if pl.get('retrograde') else '',
                ('with ' + ', '.join(joined)) if joined else '']
        for k, (pos, asc) in vargas.items():
            if x in pos:
                bits.append(f"{k} {SIGNS[pos[x]]}" + (f" ({ordinal(house(pos[x], asc))})" if asc is not None else '')
                            + (fragile(('varga-planet', k, x)) or fragile(('varga-lagna', k))))
        out.append(f"- **{sid()}** {x}: " + '; '.join(b for b in bits if b))
        if v4:
            roles = []
            for h, how in [(h, f'rules the {ordinal(h)}') for h in sorted(rules)] + [(house(s, lag), f'sits in the {ordinal(house(s, lag))}')]:
                roles.append(f"{how} = " + ', '.join(f"{ordinal(r)} from {b}" for r, b in derived(h)))
            hard = sorted({f"{ordinal(r)} from {b}" for h in rules + [house(s, lag)] for r, b in derived(h) if r in (6, 8, 12)})
            out.append(f"  - houses counted from the arenas: {'; '.join(roles)}."
                       + (f" Hard roles (6th, 8th or 12th from an arena): {', '.join(hard)}." if hard else ''))

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
    w0, w1 = date.fromisoformat(start), date.fromisoformat(end)
    if v4:
        # Long enough to find where a contact running at the window start began (Jupiter and Saturn loops) and ended.
        d0, d1 = w0 - timedelta(days=400), w1 + timedelta(days=150)
    days = [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]
    lords = set(seen)
    targets = {'Moon', 'Lagna'} | lords

    def subs(a, b):
        """Sub-periods running between dates a and b, clipped to the window."""
        a, b = max(a, w0).isoformat(), min(b, w1).isoformat()
        return [f"{r['chain']} ({max(r['pratyantar']['start'], a)} to {min(r['pratyantar']['end'], b)})"
                for r in live if r['pratyantar']['start'] < b and r['pratyantar']['end'] > a]
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
            if w0 < d <= w1 and int(l // 30) != int(pl // 30):
                s = int(l // 30)
                out.append(f"- **{sid()}** {d}: {name} enters {SIGNS[s]} ({ordinal(house(s, lag))}, {ordinal(house(s, moon))} from Moon)")
                if v4 and name == 'Jupiter':
                    # Egress by sign: Jupiter stops occupying or aspecting the sign of the Moon, the lagna or a period lord.
                    before, after = sign_aspects(name, int(pl // 30)), sign_aspects(name, s)
                    lost = [f"{k} ({SIGNS[ks]})" for k in sorted(targets)
                            for ks in [lag if k == 'Lagna' else planets[k]['sign_index']] if ks in before and ks not in after]
                    if lost:
                        out.append(f"- **{sid()}** {d}: egress: with this move Jupiter stops falling on or aspecting, by whole sign, natal "
                                   + ', '.join(lost))
        # Stations (not for the nodes)
        stations = []
        if name in ('Jupiter', 'Saturn'):
            for (pd, pl, ps), (d, l, s) in zip(track, track[1:]):
                if (ps > 0) != (s > 0):
                    stations.append((d, 'retrograde' if s < 0 else 'direct'))
                if w0 <= d <= w1 and (ps > 0) != (s > 0):
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
                        a, b = run[0][0], run[-1][0]
                        how = 'conjunct' if asp == 1 else f'{ordinal(asp)}-house aspect on'
                        if not v4 and b >= w0:
                            best = min(run, key=lambda r: r[1])
                            out.append(f"- **{sid()}** {a} to {b}: {name} {how} natal {k}"
                                       f" ({SIGNS[int(nl // 30)]} {nl % 30:.1f}) within {ORB:.0f} deg; closest {best[0]} ({best[1]:.2f} deg)")
                        elif v4 and b >= w0 and a <= w1:
                            best = min(run, key=lambda r: r[1])
                            st = [f"{sd} {sk}" for sd, sk in stations if a <= sd <= b]
                            sp = subs(a, b)
                            lag_note = ''
                            if k == 'Lagna' and sens:
                                lag_note = (f" [birth-time fragile: the lagna degree runs {sens['lagnaDegreeRange'][0] % 30:.1f}"
                                            f" to {sens['lagnaDegreeRange'][1] % 30:.1f} within {sens['minutes']} min, so these dates move]")
                            out.append(f"- **{sid()}** {a}{' (in orb before ' + str(d0) + ')' if a == d0 else ''} to {b}"
                                       f"{' (still in orb after ' + str(d1) + ')' if b == days[-1] else ''}: {name} {how} natal {k}"
                                       f" ({SIGNS[int(nl // 30)]} {nl % 30:.1f}) within {ORB:.0f} deg; closest {best[0]} ({best[1]:.2f} deg)"
                                       + (f"; stations inside the orb: {', '.join(st)}" if st else '')
                                       + (f"; sub-periods inside the window it overlaps: {', '.join(sp)}" if sp else '') + lag_note)
                            if name == 'Jupiter' and k in targets and w0 <= b < w1 and b != days[-1]:
                                what = 'conjunction with' if asp == 1 else f'{ordinal(asp)}-house aspect on'
                                out.append(f"- **{sid()}** {b + timedelta(days=1)}: egress: Jupiter's {what} natal {k} "
                                           f"leaves the {ORB:.0f}-deg orb (held since {a})")
                        run = []
    # Mars: stations, and the days it passes exactly over a natal point (fast, but these mattered in earlier runs).
    out.append('\n## Mars\n')
    track = [(d, *lon(swe.MARS, d)) for d in days if w0 <= d <= w1]
    for (pd, pl, ps), (d, l, s) in zip(track, track[1:]):
        if (ps > 0) != (s > 0):
            out.append(f"- **{sid()}** {d}: Mars stations {'retrograde' if s < 0 else 'direct'} at {SIGNS[int(l // 30)]} {l % 30:.1f}")
    hits = sorted((b[0], k, nl) for k, nl in natal.items() for a, b, cc in zip(track, track[1:], track[2:])
                  if sep(b[1], nl) <= 1.0 and sep(b[1], nl) <= sep(a[1], nl) and sep(b[1], nl) < sep(cc[1], nl))
    for d, k, nl in hits:
        out.append(f"- **{sid()}** {d}: Mars conjunct natal {k} ({SIGNS[int(nl // 30)]} {nl % 30:.1f})"
                   + (' [birth-time fragile: the lagna degree moves, so this date can shift by days]' if k == 'Lagna' and sens else ''))
    print('\n'.join(out))


if __name__ == '__main__':
    main(*sys.argv[1:4], v4='--v4' in sys.argv[4:])
