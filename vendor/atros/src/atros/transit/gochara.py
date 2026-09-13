"""
Gochara (Transit) and Double Transit calculations.

Evaluates planetary transits relative to natal Moon sign, including
favorable/unfavorable assessment and Vedha (obstruction) analysis.
"""

from typing import Dict, List, Optional, Tuple

from atros.core.constants import (
    GOCHARA_FAVORABLE,
    JUPITER_ASPECT_OFFSETS,
    RASHI_NAMES,
    SATURN_ASPECT_OFFSETS,
    VEDHA_EXCEPTIONS,
    VEDHA_TABLE,
)
from atros.core.models import TransitResult


def calculate_house_from_moon(natal_moon_sign: int, transit_sign: int) -> int:
    """House from Moon (1-12). Same sign = 1."""
    return ((transit_sign - natal_moon_sign) % 12) + 1


def is_favorable_transit(planet: str, house_from_moon: int) -> bool:
    """Check if this house is favorable for this planet."""
    favorable_houses = GOCHARA_FAVORABLE.get(planet, [])
    return house_from_moon in favorable_houses


def check_vedha(
    planet: str,
    house_from_moon: int,
    all_transit_houses: Dict[str, int],
) -> Tuple[bool, Optional[str]]:
    """Check if a favorable transit is obstructed by Vedha.

    all_transit_houses maps each planet to its house_from_moon.
    Returns (is_obstructed, obstructing_planet_name).
    Respects VEDHA_EXCEPTIONS.
    """
    vedha_map = VEDHA_TABLE.get(planet, {})
    vedha_house = vedha_map.get(house_from_moon)

    if vedha_house is None:
        return False, None

    # Check if any other planet is in the vedha house
    for other_planet, other_house in all_transit_houses.items():
        if other_planet == planet:
            continue
        if other_house != vedha_house:
            continue

        # Check if this pair is an exception
        pair = tuple(sorted([planet, other_planet]))
        is_exception = any(
            tuple(sorted(exc)) == pair for exc in VEDHA_EXCEPTIONS
        )
        if is_exception:
            continue

        return True, other_planet

    return False, None


def calculate_transit_results(
    natal_moon_sign: int,
    transit_positions: Dict[str, int],
) -> List[TransitResult]:
    """Calculate transit results for all 9 planets.

    transit_positions maps planet name to transit sign index (0-11).
    """
    # First, compute house_from_moon for every planet
    all_transit_houses: Dict[str, int] = {}
    for planet, sign_index in transit_positions.items():
        all_transit_houses[planet] = calculate_house_from_moon(
            natal_moon_sign, sign_index
        )

    results: List[TransitResult] = []
    for planet, sign_index in transit_positions.items():
        house = all_transit_houses[planet]
        favorable = is_favorable_transit(planet, house)

        is_obstructed = False
        vedha_planet: Optional[str] = None
        if favorable:
            is_obstructed, vedha_planet = check_vedha(
                planet, house, all_transit_houses
            )

        results.append(
            TransitResult(
                planet=planet,
                transit_sign=RASHI_NAMES[sign_index],
                transit_sign_index=sign_index,
                house_from_moon=house,
                is_favorable=favorable,
                is_vedha_obstructed=is_obstructed,
                vedha_planet=vedha_planet,
            )
        )

    return results


def calculate_double_transit(jupiter_sign: int, saturn_sign: int) -> set:
    """Return set of sign indices influenced by both Jupiter and Saturn.

    Jupiter aspects signs at offsets 0, 4, 6, 8 from its position (1st, 5th, 7th, 9th).
    Saturn aspects signs at offsets 0, 2, 6, 9 from its position (1st, 3rd, 7th, 10th).
    """
    jupiter_signs = {(jupiter_sign + offset) % 12 for offset in JUPITER_ASPECT_OFFSETS}
    saturn_signs = {(saturn_sign + offset) % 12 for offset in SATURN_ASPECT_OFFSETS}
    return jupiter_signs & saturn_signs
