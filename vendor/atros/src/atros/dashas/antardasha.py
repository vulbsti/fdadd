"""
Antardasha (Sub-Period) Calculations.

Antardashas are sub-periods within each Mahadasha.
Each Mahadasha contains 9 Antardashas, starting with the Mahadasha lord.

Formula for Antardasha duration:
Duration = (Mahadasha_years × Antardasha_years) / 120

Example: Venus Mahadasha (20 years) contains:
- Venus-Venus: (20 × 20) / 120 = 3.33 years
- Venus-Sun: (20 × 6) / 120 = 1.00 year
- Venus-Moon: (20 × 10) / 120 = 1.67 years
... and so on
"""

import math
from datetime import date, timedelta
from typing import List, Sequence

from ..core.constants import VIMSHOTTARI_SEQUENCE, VIMSHOTTARI_YEARS
from ..core.models import DashaPeriod


def calculate_antardasha_duration(
    mahadasha_lord: str, antardasha_lord: str
) -> float:
    """
    Calculate Antardasha duration using the formula:
    Duration = (MD_years × AD_years) / 120

    Args:
        mahadasha_lord: Planet ruling the Mahadasha
        antardasha_lord: Planet ruling the Antardasha

    Returns:
        Duration in years
    """
    md_years = VIMSHOTTARI_YEARS.get(mahadasha_lord, 7)
    ad_years = VIMSHOTTARI_YEARS.get(antardasha_lord, 7)

    return (md_years * ad_years) / 120.0


def get_antardasha_sequence(mahadasha_lord: str) -> List[str]:
    """
    Get the sequence of Antardashas within a Mahadasha.

    The sequence starts with the Mahadasha lord and follows
    the standard Vimshottari sequence.

    Args:
        mahadasha_lord: Planet ruling the Mahadasha

    Returns:
        List of 9 planet names in Antardasha sequence
    """
    try:
        start_idx = VIMSHOTTARI_SEQUENCE.index(mahadasha_lord)
    except ValueError:
        start_idx = 0

    sequence = []
    for i in range(9):
        idx = (start_idx + i) % 9
        sequence.append(VIMSHOTTARI_SEQUENCE[idx])

    return sequence


def _round_half_up(x: float) -> int:
    """Deterministic rounding (Python's round() is banker's rounding)."""
    return math.floor(x + 0.5)


def tile_boundaries(start: date, end: date, weights: Sequence[float]) -> List[date]:
    """Split [start, end] into len(weights) contiguous pieces proportional to weights.

    Boundaries are computed from the *cumulative* fraction of the parent span
    and rounded to a whole day once each, so rounding error never accumulates.
    The first boundary is ``start`` and the last is pinned to ``end`` exactly.

    Returns:
        List of len(weights) + 1 dates (non-decreasing).
    """
    total_days = (end - start).days
    total_weight = float(sum(weights))
    bounds = [start]
    cumulative = 0.0
    for w in weights[:-1]:
        cumulative += w
        offset = _round_half_up(total_days * cumulative / total_weight)
        bounds.append(start + timedelta(days=offset))
    bounds.append(end)
    return bounds


def subdivide_dasha(period: DashaPeriod, child_level: int) -> List[DashaPeriod]:
    """Subdivide any dasha period into its 9 Vimshottari children.

    Child span = parent span x (child_years / 120), sequence starting from the
    parent's lord. Children are contiguous and exactly tile the parent: the
    first starts at parent.start_date and the last ends at parent.end_date.
    """
    sequence = get_antardasha_sequence(period.planet)
    weights = [VIMSHOTTARI_YEARS.get(lord, 7) for lord in sequence]
    bounds = tile_boundaries(period.start_date, period.end_date, weights)
    total_years = float(sum(VIMSHOTTARI_YEARS.values()))  # 120

    children = []
    for i, lord in enumerate(sequence):
        if child_level == 2:
            # Traditional Antardasha length in years: (MD_years x AD_years) / 120
            duration_years = calculate_antardasha_duration(period.planet, lord)
        else:
            duration_years = (bounds[i + 1] - bounds[i]).days / 365.25
        children.append(
            DashaPeriod(
                planet=lord,
                start_date=bounds[i],
                end_date=bounds[i + 1],
                level=child_level,
                duration_years=duration_years,
            )
        )
    return children


def generate_antardasha_timeline(mahadasha: DashaPeriod) -> List[DashaPeriod]:
    """
    Generate Antardasha periods within a Mahadasha.

    Duration = (MD_years x AD_years) / 120, i.e. the Mahadasha span split in
    proportion AD_years / 120. The 9 Antardashas exactly tile the Mahadasha.

    Args:
        mahadasha: The parent Mahadasha period

    Returns:
        List of Antardasha periods
    """
    return subdivide_dasha(mahadasha, 2)


def generate_pratyantardasha_timeline(antardasha: DashaPeriod) -> List[DashaPeriod]:
    """
    Generate Pratyantardasha (sub-sub-period) within an Antardasha.

    PAD span = AD span x (PAD_years / 120). The 9 Pratyantardashas exactly
    tile the Antardasha.

    Args:
        antardasha: The parent Antardasha period

    Returns:
        List of Pratyantardasha periods
    """
    return subdivide_dasha(antardasha, 3)


def find_current_antardasha(
    antardashas: List[DashaPeriod], as_of_date: date = None
) -> DashaPeriod:
    """
    Find the currently running Antardasha.

    Args:
        antardashas: List of Antardasha periods
        as_of_date: Date to check (default: today)

    Returns:
        The current DashaPeriod or None
    """
    check_date = as_of_date or date.today()

    for period in antardashas:
        if period.start_date <= check_date <= period.end_date:
            return period

    return None


def format_dasha_period(period: DashaPeriod) -> str:
    """
    Format a dasha period for display.

    Args:
        period: DashaPeriod object

    Returns:
        Formatted string like "Venus (Mar 2022 - May 2025)"
    """
    start_str = period.start_date.strftime("%b %Y")
    end_str = period.end_date.strftime("%b %Y")
    return f"{period.planet} ({start_str} - {end_str})"


def format_full_dasha_string(
    mahadasha: DashaPeriod, antardasha: DashaPeriod = None
) -> str:
    """
    Format the full dasha period string.

    Args:
        mahadasha: Current Mahadasha
        antardasha: Current Antardasha (optional)

    Returns:
        String like "Venus-Mars" or "Venus" if no antardasha
    """
    if antardasha:
        return f"{mahadasha.planet}-{antardasha.planet}"
    return mahadasha.planet
