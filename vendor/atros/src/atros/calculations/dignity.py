"""
Planetary Dignity Calculations.

This module determines a planet's dignity (strength) based on its sign placement:
- Exalted (Uccha) - Maximum strength
- Moolatrikona - Strong (special zone in own sign)
- Own Sign (Swakshetra) - Comfortable
- Friend's Sign - Supported
- Neutral Sign - Average
- Enemy's Sign - Uncomfortable
- Debilitated (Neecha) - Minimum strength
"""

from typing import Optional

from ..core.constants import (
    DEBILITATION,
    EXALTATION,
    MOOLATRIKONA,
    NATURAL_ENEMIES,
    NATURAL_FRIENDS,
    NATURAL_NEUTRALS,
    OWN_SIGNS,
    RASHI_LORDS,
    RASHI_NAMES,
)
from ..core.enums import Dignity


def calculate_dignity(
    planet: str, sign_index: int, degree: Optional[float] = None
) -> Optional[Dignity]:
    """
    Determine planetary dignity based on sign placement.

    Priority order (checked first to last):
    1. Exalted (Uccha)
    2. Debilitated (Neecha)
    3. Moolatrikona (if degree provided)
    4. Own Sign (Swakshetra)
    5. Friend/Neutral/Enemy sign

    Args:
        planet: Planet name (Sun, Moon, Mars, etc.)
        sign_index: Sign index (0-11, where 0=Aries)
        degree: Optional degree in sign (0-30) for Moolatrikona check

    Returns:
        Dignity enum value, or None for Rahu/Ketu (which have no traditional dignities)
    """
    # Rahu and Ketu don't have traditional dignities
    if planet in ["Rahu", "Ketu"]:
        return None

    sign_name = RASHI_NAMES[sign_index] if 0 <= sign_index <= 11 else "Aries"

    # Check exaltation (strongest)
    if planet in EXALTATION:
        if EXALTATION[planet]["sign"] == sign_name:
            return Dignity.EXALTED

    # Check debilitation (weakest)
    if planet in DEBILITATION:
        if DEBILITATION[planet]["sign"] == sign_name:
            return Dignity.DEBILITATED

    # Check moolatrikona (if degree is provided)
    if degree is not None and planet in MOOLATRIKONA:
        mt_sign, mt_start, mt_end = MOOLATRIKONA[planet]
        if sign_name == mt_sign and mt_start <= degree <= mt_end:
            return Dignity.MOOLATRIKONA

    # Check own sign
    if planet in OWN_SIGNS:
        if sign_name in OWN_SIGNS[planet]:
            return Dignity.OWN_SIGN

    # Check relationship with sign lord
    sign_lord = RASHI_LORDS.get(sign_name)
    if sign_lord:
        relationship = get_natural_relationship(planet, sign_lord)
        if relationship == "friend":
            return Dignity.FRIEND
        elif relationship == "enemy":
            return Dignity.ENEMY
        else:
            return Dignity.NEUTRAL

    return Dignity.NEUTRAL


def get_natural_relationship(planet1: str, planet2: str) -> str:
    """
    Get the natural (Naisargika) relationship between two planets.

    Args:
        planet1: First planet name
        planet2: Second planet name

    Returns:
        "friend", "enemy", or "neutral"
    """
    # Handle same planet case
    if planet1 == planet2:
        return "friend"

    # Check if planet2 is a friend of planet1
    if planet1 in NATURAL_FRIENDS:
        if planet2 in NATURAL_FRIENDS[planet1]:
            return "friend"

    # Check if planet2 is an enemy of planet1
    if planet1 in NATURAL_ENEMIES:
        if planet2 in NATURAL_ENEMIES[planet1]:
            return "enemy"

    # Check explicit neutrals
    if planet1 in NATURAL_NEUTRALS:
        if planet2 in NATURAL_NEUTRALS[planet1]:
            return "neutral"

    # Default to neutral
    return "neutral"


def get_exaltation_degree(planet: str) -> Optional[float]:
    """
    Get the exact exaltation degree for a planet.

    Args:
        planet: Planet name

    Returns:
        Exaltation degree, or None if planet has no exaltation
    """
    if planet in EXALTATION:
        return EXALTATION[planet]["degree"]
    return None


def get_debilitation_degree(planet: str) -> Optional[float]:
    """
    Get the exact debilitation degree for a planet.

    Args:
        planet: Planet name

    Returns:
        Debilitation degree, or None if planet has no debilitation
    """
    if planet in DEBILITATION:
        return DEBILITATION[planet]["degree"]
    return None


def calculate_dignity_strength(
    planet: str, sign_index: int, degree: float
) -> float:
    """
    Calculate the strength of a planet's dignity as a percentage.

    This is based on the Uchcha Bala (exaltation strength) concept:
    - At exact exaltation degree: 100%
    - At exact debilitation degree: 0%
    - Linear interpolation between

    Args:
        planet: Planet name
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        Strength percentage (0-100)
    """
    if planet in ["Rahu", "Ketu"]:
        return 50.0  # Neutral for nodes

    if planet not in EXALTATION or planet not in DEBILITATION:
        return 50.0

    # Get exaltation and debilitation positions
    exalt = EXALTATION[planet]
    debil = DEBILITATION[planet]

    # Calculate absolute positions
    exalt_abs = exalt["sign_index"] * 30 + exalt["degree"]
    debil_abs = debil["sign_index"] * 30 + debil["degree"]
    planet_abs = sign_index * 30 + degree

    # Calculate angular distance from debilitation point
    # The closer to exaltation, the higher the strength
    total_distance = 180.0  # Exaltation and debilitation are always 180 apart

    # Distance from debilitation point
    dist_from_debil = abs(planet_abs - debil_abs)
    if dist_from_debil > 180:
        dist_from_debil = 360 - dist_from_debil

    # Strength is proportional to distance from debilitation
    strength = (dist_from_debil / total_distance) * 100

    return min(max(strength, 0.0), 100.0)


def is_in_own_sign(planet: str, sign_name: str) -> bool:
    """
    Check if a planet is in its own sign.

    Args:
        planet: Planet name
        sign_name: Sign name

    Returns:
        True if planet is in own sign
    """
    if planet in OWN_SIGNS:
        return sign_name in OWN_SIGNS[planet]
    return False


def is_exalted(planet: str, sign_name: str) -> bool:
    """
    Check if a planet is exalted in the given sign.

    Args:
        planet: Planet name
        sign_name: Sign name

    Returns:
        True if planet is exalted in this sign
    """
    if planet in EXALTATION:
        return EXALTATION[planet]["sign"] == sign_name
    return False


def is_debilitated(planet: str, sign_name: str) -> bool:
    """
    Check if a planet is debilitated in the given sign.

    Args:
        planet: Planet name
        sign_name: Sign name

    Returns:
        True if planet is debilitated in this sign
    """
    if planet in DEBILITATION:
        return DEBILITATION[planet]["sign"] == sign_name
    return False


def get_sign_lord(sign_name: str) -> str:
    """
    Get the lord (ruler) of a sign.

    Args:
        sign_name: Sign name

    Returns:
        Planet that rules this sign
    """
    return RASHI_LORDS.get(sign_name, "Unknown")
