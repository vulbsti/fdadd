"""
Nakshatra (Lunar Mansion) Calculations.

This module calculates:
- Nakshatra from sidereal longitude
- Pada (quarter) within nakshatra
- Nakshatra lord (for Vimshottari dasha)
- Balance of nakshatra at birth
"""

from typing import Tuple

from ..core.constants import (
    NAKSHATRA_LORDS_CYCLE,
    NAKSHATRA_SPAN,
    NAKSHATRAS,
    PADA_SPAN,
)


def calculate_nakshatra(sidereal_longitude: float) -> Tuple[int, str, int, str]:
    """
    Calculate nakshatra and pada from sidereal longitude.

    Each nakshatra spans 13°20' (13.3333... degrees).
    Each pada (quarter) spans 3°20' (3.3333... degrees).

    Args:
        sidereal_longitude: 0-360 sidereal position

    Returns:
        Tuple of (nakshatra_index, nakshatra_name, pada, nakshatra_lord)
    """
    # Normalize to 0-360
    longitude = sidereal_longitude % 360

    # Calculate nakshatra index (0-26)
    nakshatra_index = int(longitude / NAKSHATRA_SPAN)
    # Clamp to valid range in case of floating point edge cases
    nakshatra_index = min(nakshatra_index, 26)

    # Calculate position within nakshatra
    position_in_nakshatra = longitude % NAKSHATRA_SPAN

    # Calculate pada (1-4)
    pada = int(position_in_nakshatra / PADA_SPAN) + 1
    # Clamp to valid range
    pada = min(pada, 4)

    # Get nakshatra name
    nakshatra_data = NAKSHATRAS[nakshatra_index]
    nakshatra_name = nakshatra_data["name"]

    # Get lord from the cycling pattern (repeats every 9)
    lord_index = nakshatra_index % 9
    nakshatra_lord = NAKSHATRA_LORDS_CYCLE[lord_index]

    return nakshatra_index, nakshatra_name, pada, nakshatra_lord


def get_nakshatra_name(index: int) -> str:
    """
    Get nakshatra name from index.

    Args:
        index: Nakshatra index (0-26)

    Returns:
        Nakshatra name
    """
    if 0 <= index <= 26:
        return NAKSHATRAS[index]["name"]
    return "Unknown"


def get_nakshatra_lord(index: int) -> str:
    """
    Get the lord of a nakshatra by index.

    The lords cycle through: Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury

    Args:
        index: Nakshatra index (0-26)

    Returns:
        Planet name of the nakshatra lord
    """
    lord_index = index % 9
    return NAKSHATRA_LORDS_CYCLE[lord_index]


def get_birth_nakshatra(moon_longitude: float) -> Tuple[str, str, int]:
    """
    Get the birth nakshatra (Janma Nakshatra) from Moon's position.

    This determines the starting point for Vimshottari dasha.

    Args:
        moon_longitude: Moon's sidereal longitude (0-360)

    Returns:
        Tuple of (nakshatra_name, nakshatra_lord, pada)
    """
    _, name, pada, lord = calculate_nakshatra(moon_longitude)
    return name, lord, pada


def get_nakshatra_balance(moon_longitude: float) -> float:
    """
    Calculate the remaining portion of the birth nakshatra.

    This is used to determine the dasha balance at birth.
    If Moon is at the very beginning of a nakshatra, balance is ~1.0.
    If Moon is at the very end, balance is ~0.0.

    Args:
        moon_longitude: Moon's sidereal longitude (0-360)

    Returns:
        Float 0-1 representing portion of nakshatra remaining
    """
    # Get position within current nakshatra
    position_in_nakshatra = moon_longitude % NAKSHATRA_SPAN

    # Calculate remaining portion
    remaining = NAKSHATRA_SPAN - position_in_nakshatra

    # Return as fraction of total nakshatra span
    return remaining / NAKSHATRA_SPAN


def get_nakshatra_start_degree(nakshatra_index: int) -> float:
    """
    Get the starting degree of a nakshatra.

    Args:
        nakshatra_index: Nakshatra index (0-26)

    Returns:
        Starting degree (0-360)
    """
    return nakshatra_index * NAKSHATRA_SPAN


def get_nakshatra_end_degree(nakshatra_index: int) -> float:
    """
    Get the ending degree of a nakshatra.

    Args:
        nakshatra_index: Nakshatra index (0-26)

    Returns:
        Ending degree (0-360)
    """
    return (nakshatra_index + 1) * NAKSHATRA_SPAN


def get_pada_sublord(nakshatra_index: int, pada: int) -> str:
    """
    Get the sublord for a specific pada.

    Each pada of 3°20' corresponds to one navamsa, which has its own sublord.
    The sublord sequence follows: starting from the navamsa sign's lord.

    For now, this returns the nakshatra lord as the sublord.
    A more accurate implementation would calculate the navamsa lord.

    Args:
        nakshatra_index: Nakshatra index (0-26)
        pada: Pada number (1-4)

    Returns:
        Sublord planet name
    """
    # For basic implementation, return nakshatra lord
    # More advanced: calculate navamsa sign lord for this pada
    return get_nakshatra_lord(nakshatra_index)


def format_nakshatra_position(
    nakshatra_name: str, pada: int, degree_in_nakshatra: float
) -> str:
    """
    Format nakshatra position for display.

    Args:
        nakshatra_name: Name of the nakshatra
        pada: Pada number (1-4)
        degree_in_nakshatra: Degree within the nakshatra (0-13.333)

    Returns:
        Formatted string like "Ashwini Pada 2 (5°30')"
    """
    degrees = int(degree_in_nakshatra)
    minutes = int((degree_in_nakshatra - degrees) * 60)
    return f"{nakshatra_name} Pada {pada} ({degrees}°{minutes:02d}')"
