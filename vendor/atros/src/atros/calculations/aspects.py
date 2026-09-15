"""Planetary aspect (Graha Drishti) calculations.

Calculates sign-based planetary aspects. Every planet aspects the 7th house
from its position. Mars also aspects the 4th/8th, Jupiter the 5th/9th,
Saturn the 3rd/10th, and Rahu/Ketu the 5th/7th/9th.
"""

from typing import Dict, List

from atros.core.constants import FULL_ASPECTS, PARTIAL_ASPECTS
from atros.core.models import Aspect


def get_aspect_strength(planet: str, house_distance: int) -> float:
    """Get aspect strength (0-100) for a planet at a given house distance.

    Args:
        planet: Planet name (e.g., "Mars", "Jupiter").
        house_distance: House distance from 1 to 12.

    Returns:
        Aspect strength as a percentage (0-100). Returns 0.0 if the planet
        has no aspect at that distance.
    """
    planet_aspects = PARTIAL_ASPECTS.get(planet, {})
    return float(planet_aspects.get(house_distance, 0.0))


def get_aspected_signs(planet: str, sign_index: int) -> Dict[int, float]:
    """Get all signs aspected by a planet with nonzero strength.

    Args:
        planet: Planet name (e.g., "Mars", "Jupiter").
        sign_index: The sign index (0-11) where the planet is placed.

    Returns:
        Dictionary mapping aspected sign index (0-11) to strength (0-100).
        Only includes signs with nonzero aspect strength.
    """
    planet_aspects = PARTIAL_ASPECTS.get(planet, {})
    result: Dict[int, float] = {}
    for distance, strength in planet_aspects.items():
        target_sign = (sign_index + distance - 1) % 12
        result[target_sign] = strength
    return result


def calculate_all_aspects(
    planet_positions: Dict[str, Dict],
    include_partial: bool = False,
) -> List[Aspect]:
    """Calculate aspects between all planet pairs.

    Args:
        planet_positions: Maps planet name to a dict containing at least
            a 'sign_index' key (int, 0-11).
        include_partial: If False (default), only return aspects with 100%
            strength. If True, also include 25%, 50%, and 75% aspects.

    Returns:
        List of Aspect objects for all valid planet-to-planet aspects.
    """
    aspects: List[Aspect] = []
    planet_names = list(planet_positions.keys())

    for aspecting in planet_names:
        aspecting_sign = planet_positions[aspecting]["sign_index"]
        aspected_signs = get_aspected_signs(aspecting, aspecting_sign)

        for aspected in planet_names:
            if aspected == aspecting:
                continue

            aspected_sign = planet_positions[aspected]["sign_index"]

            if aspected_sign not in aspected_signs:
                continue

            strength = aspected_signs[aspected_sign]

            if not include_partial and strength < 100:
                continue

            # House distance: counting from aspecting sign as 1 (1-12)
            house_distance = (aspected_sign - aspecting_sign) % 12 + 1

            # An aspect is "special" when:
            # 1. It is NOT the universal 7th house aspect, AND
            # 2. It is a full (100%) aspect for that planet
            full_aspects = FULL_ASPECTS.get(aspecting, [7])
            is_special = (
                house_distance != 7
                and house_distance in full_aspects
                and strength == 100
            )

            aspects.append(
                Aspect(
                    aspecting_planet=aspecting,
                    aspected_planet=aspected,
                    aspecting_sign_index=aspecting_sign,
                    aspected_sign_index=aspected_sign,
                    house_distance=house_distance,
                    strength=strength,
                    is_special=is_special,
                )
            )

    return aspects
