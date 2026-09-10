"""
Yogini Dasha Calculations.

The Yogini Dasha is a 36-year planetary period system used in Vedic astrology.
It determines life phases based on the Moon's nakshatra at birth.

Key concepts:
- 8 Yoginis in a fixed sequence, each ruled by a planet
- Total cycle = 36 years (1+2+3+4+5+6+7+8)
- Starting Yogini determined by (birth_nakshatra_index + 3) % 8
- Balance at birth = remaining fraction of nakshatra * first Yogini's duration

Sequence: Mangala(Moon,1) -> Pingala(Sun,2) -> Dhanya(Jupiter,3) -> Bhramari(Mars,4)
         -> Bhadrika(Mercury,5) -> Ulka(Saturn,6) -> Siddha(Venus,7) -> Sankata(Rahu,8)
"""

import math
from datetime import date, timedelta
from typing import List, Tuple

from ..core.constants import YOGINI_DASHAS, YOGINI_TOTAL_YEARS
from ..core.models import YoginiDashaPeriod


def calculate_yogini_balance(moon_longitude: float) -> Tuple[int, float]:
    """
    Calculate the starting Yogini index and balance of first dasha at birth.

    The starting Yogini is determined by the Moon's nakshatra at birth:
        nakshatra_index = floor(moon_longitude / (360/27))
        starting_yogini = (nakshatra_index + 3) % 8

    The balance is the remaining fraction of the nakshatra multiplied by
    the first Yogini's duration in years.

    Args:
        moon_longitude: Moon's sidereal longitude (0-360)

    Returns:
        Tuple of (starting_yogini_index, balance_years_of_first_dasha)
    """
    nakshatra_span = 360.0 / 27.0  # 13.3333...
    nakshatra_index = int(math.floor(moon_longitude / nakshatra_span))

    starting_yogini = (nakshatra_index + 3) % 8

    fraction_elapsed = (moon_longitude % nakshatra_span) / nakshatra_span
    fraction_remaining = 1.0 - fraction_elapsed

    duration = YOGINI_DASHAS[starting_yogini][2]
    balance = fraction_remaining * duration

    return starting_yogini, balance


def generate_yogini_timeline(
    moon_longitude: float, birth_date: date, cycles: int = 3
) -> List[YoginiDashaPeriod]:
    """
    Generate Yogini Dasha timeline for N cycles.

    Each cycle is 36 years (sum of all 8 Yogini durations: 1+2+3+4+5+6+7+8).
    Default 3 cycles = 108 years.

    The first period starts at birth with the balance (remaining portion of
    the first Yogini's dasha). Subsequent periods follow the 8-Yogini cycle.

    Args:
        moon_longitude: Moon's sidereal longitude at birth (0-360)
        birth_date: Date of birth
        cycles: Number of 36-year cycles to generate (default 3 = 108 years)

    Returns:
        List of YoginiDashaPeriod objects
    """
    starting_yogini, balance = calculate_yogini_balance(moon_longitude)

    timeline: List[YoginiDashaPeriod] = []
    current_date = birth_date

    # First period: use balance as duration
    yogini_name, planet, full_duration = YOGINI_DASHAS[starting_yogini]
    balance_days = int(balance * 365.25)
    end_date = current_date + timedelta(days=balance_days)

    timeline.append(
        YoginiDashaPeriod(
            yogini_name=yogini_name,
            planet=planet,
            start_date=current_date,
            end_date=end_date,
            duration_years=full_duration,
        )
    )

    current_date = end_date

    # Remaining periods: cycle through all 8 Yoginis for the requested number of cycles
    total_periods = cycles * 8  # 8 Yoginis per cycle
    yogini_idx = (starting_yogini + 1) % 8  # Next Yogini after the first

    for _ in range(total_periods):
        yogini_name, planet, duration = YOGINI_DASHAS[yogini_idx]
        duration_days = int(duration * 365.25)
        end_date = current_date + timedelta(days=duration_days)

        timeline.append(
            YoginiDashaPeriod(
                yogini_name=yogini_name,
                planet=planet,
                start_date=current_date,
                end_date=end_date,
                duration_years=duration,
            )
        )

        current_date = end_date
        yogini_idx = (yogini_idx + 1) % 8

    return timeline
