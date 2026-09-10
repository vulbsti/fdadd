"""Bhava Chalit chart calculation for Vedic astrology.

The Bhava Chalit system uses the ascendant degree as the MIDPOINT of
the first house (not the start). Each house spans exactly 30 degrees.
This means house cusps (start degrees) are offset by -15 degrees from
the ascendant, and each subsequent cusp is 30 degrees apart.
"""

from typing import Dict, List

from atros.core.models import BhavaChalitChart, BhavaPosition


def get_house_cusps(ascendant_abs: float) -> List[float]:
    """Calculate 12 house cusp START degrees.

    House N start = (ascendant - 15 + (N-1)*30) % 360
    N goes from 0 to 11 (house 1 to 12).

    Args:
        ascendant_abs: Absolute sidereal longitude of the ascendant (0-360).

    Returns:
        List of 12 floats, each rounded to 4 decimal places.
    """
    cusps: List[float] = []
    for n in range(12):
        cusp = (ascendant_abs - 15 + n * 30) % 360
        cusps.append(round(cusp, 4))
    return cusps


def get_bhava_for_longitude(longitude: float, cusps: List[float]) -> int:
    """Determine which house (1-12) a longitude falls in.

    For each house i (0-11), check if longitude is between cusps[i]
    and cusps[(i+1) % 12].

    Handle wrap-around at 360/0 boundary:
    - If start < end: longitude is in house if start <= lng < end
    - If start >= end (wraps): longitude is in house if lng >= start OR lng < end

    Args:
        longitude: Absolute sidereal longitude of the planet (0-360).
        cusps: List of 12 house cusp start degrees.

    Returns:
        House number (1-12). Defaults to 1 if no match found.
    """
    for i in range(12):
        start = cusps[i]
        end = cusps[(i + 1) % 12]

        if start < end:
            if start <= longitude < end:
                return i + 1
        else:
            # Wraps around 360/0 boundary
            if longitude >= start or longitude < end:
                return i + 1

    return 1


def calculate_bhava_chalit(
    ascendant_abs: float, planet_positions: Dict[str, Dict]
) -> BhavaChalitChart:
    """Calculate complete Bhava Chalit chart.

    Args:
        ascendant_abs: Absolute sidereal longitude of the ascendant (0-360).
        planet_positions: Maps planet name to dict with 'abs_pos' (absolute
                          sidereal longitude, 0-360) and 'house' (rashi
                          house, 1-12).

    Returns:
        BhavaChalitChart with house cusps and planet positions.
    """
    cusps = get_house_cusps(ascendant_abs)
    positions: List[BhavaPosition] = []

    for planet_name, pos_data in planet_positions.items():
        abs_pos = pos_data["abs_pos"]
        rashi_house = pos_data["house"]
        bhava_house = get_bhava_for_longitude(abs_pos, cusps)
        has_shifted = rashi_house != bhava_house

        positions.append(
            BhavaPosition(
                planet=planet_name,
                rashi_house=rashi_house,
                bhava_house=bhava_house,
                has_shifted=has_shifted,
            )
        )

    return BhavaChalitChart(
        ascendant_abs=ascendant_abs,
        house_cusps=cusps,
        positions=positions,
    )
