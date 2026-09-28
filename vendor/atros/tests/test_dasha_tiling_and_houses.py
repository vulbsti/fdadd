"""Regression tests: dasha periods tile their parents; lagna houses are whole-sign.

Run from vendor/atros with:  PYTHONPATH=src python -m pytest tests -q
"""

from datetime import date, datetime

import pytest

from atros.core.constants import RASHI_NAMES
from atros.core.models import BirthData
from atros.dashas.antardasha import (
    generate_antardasha_timeline,
    generate_pratyantardasha_timeline,
)
from atros.dashas.timeline import periods_for_window, subdivide_period
from atros.dashas.vimshottari import generate_mahadasha_timeline
from atros.dashas.yogini import generate_yogini_timeline
from atros.services.chart_service import ChartService


def _bd(name, y, mo, d, hh, mm, lat, lng, tz):
    return BirthData(
        name=name,
        birth_date=date(y, mo, d),
        birth_time=datetime(y, mo, d, hh, mm),
        latitude=lat,
        longitude=lng,
        timezone=tz,
    )


BANGALORE_1991 = _bd("Bangalore", 1991, 2, 3, 4, 56, 12.97194, 77.59369, "Asia/Kolkata")
BIRTHS = {
    "bangalore_1991": BANGALORE_1991,  # Sagittarius lagna
    "kanpur_2000": _bd("Kanpur", 2000, 4, 22, 9, 15, 26.4499, 80.3319, "Asia/Kolkata"),  # Gemini
    "new_york_1985": _bd("NYC", 1985, 7, 15, 18, 30, 40.7128, -74.0060, "America/New_York"),
    "london_1972": _bd("London", 1972, 11, 30, 23, 40, 51.5074, -0.1278, "Europe/London"),
}


@pytest.fixture(scope="module")
def charts():
    service = ChartService()
    return {k: service.generate_full_chart(b) for k, b in BIRTHS.items()}


def _moon(chart):
    return next(p for p in chart.lagna_chart.planets if p.planet == "Moon").absolute_degree


def _assert_tiles(parent, children):
    assert len(children) == 9, parent
    assert children[0].start_date == parent.start_date, (parent, children[0])
    assert children[-1].end_date == parent.end_date, (parent, children[-1])
    for prev, nxt in zip(children, children[1:]):
        assert prev.end_date == nxt.start_date, (parent, prev, nxt)
    for c in children:
        assert c.start_date <= c.end_date, c


def test_births_cover_different_ascendants(charts):
    ascs = {c.lagna_chart.ascendant.sign for c in charts.values()}
    assert len(ascs) >= 3, ascs


@pytest.mark.parametrize("key", list(BIRTHS))
def test_dasha_levels_tile_parent_over_100_years(charts, key):
    birth = BIRTHS[key].birth_date
    horizon = date(birth.year + 100, birth.month, birth.day)
    mds = generate_mahadasha_timeline(_moon(charts[key]), birth, 120)

    # Mahadashas: contiguous and covering birth .. +100y.
    assert mds[0].start_date <= birth
    assert mds[-1].end_date >= horizon
    for prev, nxt in zip(mds, mds[1:]):
        assert prev.end_date == nxt.start_date

    for md in mds:
        if md.end_date < birth or md.start_date > horizon:
            continue
        ads = generate_antardasha_timeline(md)
        _assert_tiles(md, ads)
        for ad in ads:
            pds = generate_pratyantardasha_timeline(ad)
            _assert_tiles(ad, pds)
            for pd in pds:
                _assert_tiles(pd, subdivide_period(pd, 4))


@pytest.mark.parametrize("key", list(BIRTHS))
def test_mahadasha_boundaries_do_not_drift(charts, key):
    """Each MD boundary is within one day of the exact cumulative value."""
    birth = BIRTHS[key].birth_date
    mds = generate_mahadasha_timeline(_moon(charts[key]), birth, 120)
    first = mds[0]
    first_end_exact = None
    cumulative = 0.0
    for md in mds:
        cumulative += md.duration_years
        if first_end_exact is None:
            first_end_exact = first.end_date.toordinal()
            base = first_end_exact - cumulative * 365.25
        exact = base + cumulative * 365.25
        assert abs(md.end_date.toordinal() - exact) <= 1.0, md


@pytest.mark.parametrize("key", list(BIRTHS))
def test_yogini_periods_do_not_drift(charts, key):
    birth = BIRTHS[key].birth_date
    periods = generate_yogini_timeline(_moon(charts[key]), birth)
    for prev, nxt in zip(periods, periods[1:]):
        assert prev.end_date == nxt.start_date
    # 3 cycles of 36 years after the first (balance) period.
    span = periods[-1].end_date.toordinal() - periods[0].end_date.toordinal()
    assert abs(span - 108 * 365.25) <= 1.0


@pytest.mark.parametrize("key", list(BIRTHS))
def test_planet_houses_are_whole_sign(charts, key):
    lagna = charts[key].lagna_chart
    asc_idx = lagna.ascendant.sign_index
    assert len(lagna.planets) == 9
    for p in lagna.planets:
        assert p.sign_index == RASHI_NAMES.index(p.sign)
        assert p.house == ((p.sign_index - asc_idx) % 12) + 1, p
    # House cusps agree with planet houses (same whole-sign system).
    cusp_sign = {h.house: h.sign_index for h in lagna.houses}
    for p in lagna.planets:
        assert cusp_sign[p.house] == p.sign_index, p
    # Bhava Chalit's rashi_house input is the whole-sign house.
    rashi = {bp.planet: bp.rashi_house for bp in charts[key].bhava_chalit.positions}
    for p in lagna.planets:
        assert rashi[p.planet] == p.house


def test_bangalore_1991_regression(charts):
    chart = charts["bangalore_1991"]
    lagna = chart.lagna_chart
    assert lagna.ascendant.sign == "Sagittarius"
    houses = {p.planet: p.house for p in lagna.planets}
    assert houses["Sun"] == 2
    assert houses["Mercury"] == 2
    assert houses["Saturn"] == 2
    assert houses["Rahu"] == 2
    assert houses["Jupiter"] == 8
    assert houses["Ketu"] == 8

    names = [y.name for y in chart.yogas]
    assert not any("Hamsa" in n for n in names), names
    for y in chart.yogas:
        assert "7th house (Kendra)" not in y.description or "Jupiter" not in y.description

    moon = _moon(chart)
    birth = BIRTHS["bangalore_1991"].birth_date
    rahu = next(m for m in generate_mahadasha_timeline(moon, birth, 120) if m.planet == "Rahu")
    ads = generate_antardasha_timeline(rahu)
    assert ads[-1].planet == "Mars"
    # Exact cumulative arithmetic puts the end of Rahu MD on 2026-12-05 (the
    # old truncating code drifted it to 2026-12-03 and cut Rahu-Mars at 11-28).
    assert rahu.end_date == date(2026, 12, 5)
    assert ads[-1].end_date == rahu.end_date
    pds = generate_pratyantardasha_timeline(ads[-1])
    assert pds[-1].planet == "Moon"
    assert pds[-1].end_date == rahu.end_date

    rows = periods_for_window(moon, birth, date(2026, 11, 1), date(2027, 1, 1), "pratyantar")
    chains = [r["chain"] for r in rows]
    assert chains[-2:] == ["Rahu-Mars-Moon", "Jupiter-Jupiter-Jupiter"]
    assert rows[-2]["pratyantar"]["end"] == rows[-1]["pratyantar"]["start"] == "2026-12-05"
