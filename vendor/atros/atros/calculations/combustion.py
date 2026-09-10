"""Combustion (Asta) detection for Vedic astrology.

A planet is combust (asta) when it is too close to the Sun.
Each planet has a threshold angular distance; planets closer than the
threshold are considered combust and lose strength.
"""

from typing import Dict, List

from atros.core.constants import COMBUSTION_THRESHOLDS
from atros.core.models import CombustionStatus


def _angular_distance(deg1: float, deg2: float) -> float:
    """Shortest angular distance between two positions (0-180)."""
    diff = abs(deg1 - deg2) % 360
    return min(diff, 360 - diff)


def is_combust(planet: str, distance: float, retrograde: bool) -> bool:
    """Check if a planet is combust.

    Returns False for planets not in COMBUSTION_THRESHOLDS (Sun, Rahu, Ketu).
    Uses direct_threshold or retrograde_threshold based on retrograde flag.
    If threshold is 0 (outer planets when retrograde), returns False.
    Planet is combust when distance < threshold (strictly less than).
    """
    if planet not in COMBUSTION_THRESHOLDS:
        return False

    direct_threshold, retrograde_threshold = COMBUSTION_THRESHOLDS[planet]
    threshold = retrograde_threshold if retrograde else direct_threshold

    if threshold == 0:
        return False

    return distance < threshold


def calculate_combustion(
    planet_positions: Dict[str, Dict],
) -> List[CombustionStatus]:
    """Calculate combustion for all applicable planets.

    Args:
        planet_positions: Maps planet name to dict with 'abs_pos' (0-360)
                          and 'retrograde' (bool).

    Returns:
        List of CombustionStatus for planets in COMBUSTION_THRESHOLDS only.
        Excludes Sun, Rahu, Ketu.
    """
    if "Sun" not in planet_positions:
        return []

    sun_pos = planet_positions["Sun"]["abs_pos"]
    results: List[CombustionStatus] = []

    for planet in COMBUSTION_THRESHOLDS:
        if planet not in planet_positions:
            continue

        pos_data = planet_positions[planet]
        abs_pos = pos_data["abs_pos"]
        retrograde = pos_data.get("retrograde", False)

        distance = _angular_distance(abs_pos, sun_pos)

        direct_threshold, retrograde_threshold = COMBUSTION_THRESHOLDS[planet]
        threshold = retrograde_threshold if retrograde else direct_threshold

        combust = is_combust(planet, distance, retrograde)

        results.append(
            CombustionStatus(
                planet=planet,
                is_combust=combust,
                distance_from_sun=distance,
                threshold=threshold,
            )
        )

    return results
