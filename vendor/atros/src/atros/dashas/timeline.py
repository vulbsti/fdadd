"""Nested dasha timeline for arbitrary windows.

Exposes Maha/Antar/Pratyantar/Sookshma chains over a [from_date, to_date]
window. Pure functions over moon_longitude + birth_date; no I/O, no Click.
Any agent harness can import this or call `atros timeline --output json`.
"""

from datetime import date, timedelta
from typing import Dict, List, Optional
from .antardasha import (
    generate_antardasha_timeline,
    generate_pratyantardasha_timeline,
    get_antardasha_sequence,
)
from ..core.constants import VIMSHOTTARI_YEARS
from ..core.models import DashaPeriod
from .vimshottari import generate_mahadasha_timeline


def _overlaps(a_start: date, a_end: date, b_start: date, b_end: date) -> bool:
    return a_start <= b_end and b_start <= a_end


def subdivide_period(period: DashaPeriod, child_level: int) -> List[DashaPeriod]:
    """Generic subdivision of a dasha period into 9 children.

    Child duration = parent_actual_days * (child_years / 120).
    Same math as generate_pratyantardasha_timeline, extended to any level
    (pratyantar -> sookshma -> praana).
    """
    sequence = get_antardasha_sequence(period.planet)
    parent_days = (period.end_date - period.start_date).days
    children: List[DashaPeriod] = []
    current = period.start_date
    for lord in sequence:
        frac = VIMSHOTTARI_YEARS.get(lord, 7) / 120.0
        days = max(1, int(parent_days * frac))
        end = min(current + timedelta(days=days), period.end_date)
        children.append(
            DashaPeriod(
                planet=lord,
                start_date=current,
                end_date=end,
                level=child_level,
                duration_years=days / 365.25,
            )
        )
        current = end
        if current >= period.end_date:
            break
    return children


def chain_for_date(moon_longitude: float, birth_date: date, on: date) -> Dict[str, Optional[DashaPeriod]]:
    """Full MD/AD/PD/SD chain active on a single date."""
    mds = generate_mahadasha_timeline(moon_longitude, birth_date, 120)
    md = next((m for m in mds if m.start_date <= on <= m.end_date), None)
    if md is None:
        return {"mahadasha": None, "antardasha": None, "pratyantar": None, "sookshma": None}
    ads = generate_antardasha_timeline(md)
    ad = next((a for a in ads if a.start_date <= on <= a.end_date), None)
    if ad is None:
        return {"mahadasha": md, "antardasha": None, "pratyantar": None, "sookshma": None}
    pds = generate_pratyantardasha_timeline(ad)
    pd = next((p for p in pds if p.start_date <= on <= p.end_date), None)
    if pd is None:
        return {"mahadasha": md, "antardasha": ad, "pratyantar": None, "sookshma": None}
    sds = subdivide_period(pd, 4)
    sd = next((s for s in sds if s.start_date <= on <= s.end_date), None)
    return {"mahadasha": md, "antardasha": ad, "pratyantar": pd, "sookshma": sd}


def _row(md, ad, pd, sd) -> Dict:
    def dump(p):
        return None if p is None else {
            "planet": p.planet,
            "start": p.start_date.isoformat(),
            "end": p.end_date.isoformat(),
        }

    parts = [p.planet for p in (md, ad, pd, sd) if p is not None]
    return {
        "chain": "-".join(parts),
        "mahadasha": dump(md),
        "antardasha": dump(ad),
        "pratyantar": dump(pd),
        "sookshma": dump(sd),
    }


def periods_for_window(
    moon_longitude: float,
    birth_date: date,
    from_date: date,
    to_date: date,
    level: str = "pratyantar",
) -> List[Dict]:
    """Flat rows covering the window at the requested depth.

    level: maha | antar | pratyantar | sookshma. Each row carries the full
    chain so callers never re-derive parentage. Rows clipped to window end;
    rows fully outside window omitted.
    """
    depth = {"maha": 1, "antar": 2, "pratyantar": 3, "sookshma": 4}[level]
    rows: List[Dict] = []
    for md in generate_mahadasha_timeline(moon_longitude, birth_date, 120):
        if not _overlaps(md.start_date, md.end_date, from_date, to_date):
            continue
        if depth == 1:
            rows.append(_row(md, None, None, None))
            continue
        for ad in generate_antardasha_timeline(md):
            if not _overlaps(ad.start_date, ad.end_date, from_date, to_date):
                continue
            if depth == 2:
                rows.append(_row(md, ad, None, None))
                continue
            for pd in generate_pratyantardasha_timeline(ad):
                if not _overlaps(pd.start_date, pd.end_date, from_date, to_date):
                    continue
                if depth == 3:
                    rows.append(_row(md, ad, pd, None))
                    continue
                for sd in subdivide_period(pd, 4):
                    if not _overlaps(sd.start_date, sd.end_date, from_date, to_date):
                        continue
                    rows.append(_row(md, ad, pd, sd))
    if len(rows) > 5000:
        raise ValueError(f"Window too wide for level={level} ({len(rows)} rows); narrow dates.")
    return rows
