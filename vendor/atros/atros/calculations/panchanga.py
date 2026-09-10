"""Panchanga (five limbs) calculator for Vedic astrology.

Calculates the five elements of the Panchanga from Sun/Moon positions and date:
1. Tithi - lunar day based on Moon-Sun elongation
2. Nithya Yoga - combination of Sun and Moon longitudes
3. Karana - half-tithi
4. Vara - weekday and its planetary lord
5. Nakshatra - Moon's lunar mansion (passed in from chart data)
"""

import math
from datetime import date
from typing import Tuple

from atros.core.constants import (
    FIXED_KARANAS,
    MOVABLE_KARANA_NAMES,
    NAKSHATRA_SPAN,
    NITHYA_YOGA_NAMES,
    TITHI_NAMES,
    VARA_DATA,
)
from atros.core.models import Panchanga


def calculate_tithi(moon_longitude: float, sun_longitude: float) -> Tuple[int, str, str]:
    """Calculate tithi from sidereal longitudes.

    The tithi is determined by the angular distance (elongation) between the Moon
    and Sun. Each tithi spans 12 degrees of elongation.

    Args:
        moon_longitude: Moon's sidereal longitude (0-360).
        sun_longitude: Sun's sidereal longitude (0-360).

    Returns:
        Tuple of (tithi_number, tithi_name, paksha).
        tithi_number is 1-30, paksha is 'Shukla' or 'Krishna'.
    """
    elongation = (moon_longitude - sun_longitude) % 360

    if elongation == 0:
        tithi_number = 1
    else:
        tithi_number = min(math.floor(elongation / 12) + 1, 30)

    tithi_name = TITHI_NAMES[tithi_number - 1]
    paksha = "Shukla" if tithi_number <= 15 else "Krishna"

    return tithi_number, tithi_name, paksha


def calculate_nithya_yoga(moon_longitude: float, sun_longitude: float) -> Tuple[int, str]:
    """Calculate Nithya Yoga from sidereal longitudes.

    The yoga is determined by the sum of Moon and Sun longitudes. Each yoga
    spans one nakshatra span (13.3333... degrees).

    Args:
        moon_longitude: Moon's sidereal longitude (0-360).
        sun_longitude: Sun's sidereal longitude (0-360).

    Returns:
        Tuple of (yoga_number, yoga_name). yoga_number is 1-27.
    """
    total = (moon_longitude + sun_longitude) % 360

    yoga_number = min(math.floor(total / NAKSHATRA_SPAN) + 1, 27)

    yoga_name = NITHYA_YOGA_NAMES[yoga_number - 1]

    return yoga_number, yoga_name


def calculate_karana(moon_longitude: float, sun_longitude: float) -> Tuple[int, str]:
    """Calculate Karana (half-tithi) from sidereal longitudes.

    The karana is determined by the Moon-Sun elongation divided into 6-degree
    segments. There are 60 karanas in a lunar month: 4 fixed and 56 movable
    (7 names cycling 8 times).

    Args:
        moon_longitude: Moon's sidereal longitude (0-360).
        sun_longitude: Sun's sidereal longitude (0-360).

    Returns:
        Tuple of (karana_number, karana_name). karana_number is 1-60.
    """
    elongation = (moon_longitude - sun_longitude) % 360

    if elongation == 0:
        karana_number = 1
    else:
        karana_number = min(math.floor(elongation / 6) + 1, 60)

    if karana_number in FIXED_KARANAS:
        karana_name = FIXED_KARANAS[karana_number]
    else:
        index = (karana_number - 2) % 7
        karana_name = MOVABLE_KARANA_NAMES[index]

    return karana_number, karana_name


def calculate_vara(birth_date: date) -> Tuple[str, str]:
    """Get weekday name and its planetary lord from a date.

    Uses Python's isoweekday() (Monday=1 ... Sunday=7) to look up
    the vara data.

    Args:
        birth_date: The date to determine the weekday for.

    Returns:
        Tuple of (day_name, lord).
    """
    iso_day = birth_date.isoweekday()
    day_name, _sanskrit, lord = VARA_DATA[iso_day]

    return day_name, lord


def calculate_panchanga(
    moon_longitude: float,
    sun_longitude: float,
    birth_date: date,
    moon_nakshatra: str,
    moon_nakshatra_lord: str,
) -> Panchanga:
    """Calculate the complete Panchanga for a given moment.

    Combines all five limbs: tithi, nithya yoga, karana, vara, and nakshatra.

    Args:
        moon_longitude: Moon's sidereal longitude (0-360).
        sun_longitude: Sun's sidereal longitude (0-360).
        birth_date: Date of the moment.
        moon_nakshatra: Name of the Moon's nakshatra.
        moon_nakshatra_lord: Lord of the Moon's nakshatra.

    Returns:
        A Panchanga model with all five elements populated.
    """
    tithi_number, tithi_name, paksha = calculate_tithi(moon_longitude, sun_longitude)
    yoga_number, yoga_name = calculate_nithya_yoga(moon_longitude, sun_longitude)
    karana_number, karana_name = calculate_karana(moon_longitude, sun_longitude)
    vara, vara_lord = calculate_vara(birth_date)

    return Panchanga(
        tithi_number=tithi_number,
        tithi_name=tithi_name,
        paksha=paksha,
        nithya_yoga_number=yoga_number,
        nithya_yoga_name=yoga_name,
        karana_number=karana_number,
        karana_name=karana_name,
        vara=vara,
        vara_lord=vara_lord,
        nakshatra=moon_nakshatra,
        nakshatra_lord=moon_nakshatra_lord,
    )
