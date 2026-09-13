"""
Vimshottari Dasha Calculations.

The Vimshottari Dasha is a 120-year planetary period system used in Vedic astrology.
It determines life phases based on the Moon's nakshatra at birth.

Key concepts:
- Mahadasha: Major planetary period (7-20 years each)
- Antardasha: Sub-period within Mahadasha
- Pratyantardasha: Sub-sub-period within Antardasha

The dasha sequence: Ketu (7) -> Venus (20) -> Sun (6) -> Moon (10) -> Mars (7)
                   -> Rahu (18) -> Jupiter (16) -> Saturn (19) -> Mercury (17)
                   = 120 years total
"""

from datetime import date, timedelta
from typing import List, Optional, Tuple

from ..calculations.nakshatra import get_birth_nakshatra, get_nakshatra_balance
from ..core.constants import VIMSHOTTARI_SEQUENCE, VIMSHOTTARI_YEARS
from ..core.models import DashaPeriod, DashaTimeline


def calculate_mahadasha_sequence(birth_nakshatra_lord: str) -> List[str]:
    """
    Get the sequence of Mahadashas starting from birth nakshatra lord.

    Args:
        birth_nakshatra_lord: Lord of the Moon's nakshatra at birth

    Returns:
        List of 9 planet names in dasha sequence
    """
    try:
        start_idx = VIMSHOTTARI_SEQUENCE.index(birth_nakshatra_lord)
    except ValueError:
        start_idx = 0  # Default to Ketu if lord not found

    sequence = []
    for i in range(9):
        idx = (start_idx + i) % 9
        sequence.append(VIMSHOTTARI_SEQUENCE[idx])

    return sequence


def calculate_dasha_balance(
    moon_longitude: float, birth_date: date
) -> Tuple[str, date, float]:
    """
    Calculate the starting dasha and when it began.

    The balance of dasha at birth is proportional to the remaining
    portion of the nakshatra the Moon is in.

    Args:
        moon_longitude: Moon's sidereal longitude (0-360)
        birth_date: Date of birth

    Returns:
        Tuple of (starting_dasha_lord, dasha_start_date, balance_years)
    """
    nakshatra_name, lord, pada = get_birth_nakshatra(moon_longitude)
    balance_fraction = get_nakshatra_balance(moon_longitude)

    # Get total years for this dasha
    dasha_years = VIMSHOTTARI_YEARS.get(lord, 7)

    # Calculate remaining years of first dasha at birth
    balance_years = dasha_years * balance_fraction

    # Calculate elapsed years (before birth)
    elapsed_years = dasha_years - balance_years

    # Calculate when this dasha actually started (before birth)
    elapsed_days = int(elapsed_years * 365.25)
    dasha_start = birth_date - timedelta(days=elapsed_days)

    return lord, dasha_start, balance_years


def generate_mahadasha_timeline(
    moon_longitude: float,
    birth_date: date,
    years_forward: int = 120,
) -> List[DashaPeriod]:
    """
    Generate complete Mahadasha timeline.

    Args:
        moon_longitude: Moon's sidereal longitude at birth
        birth_date: Date of birth
        years_forward: How many years from birth to calculate

    Returns:
        List of DashaPeriod objects for each Mahadasha
    """
    starting_lord, first_dasha_start, balance_years = calculate_dasha_balance(
        moon_longitude, birth_date
    )

    sequence = calculate_mahadasha_sequence(starting_lord)
    timeline = []
    current_start = first_dasha_start

    # End date for calculations
    end_limit = birth_date + timedelta(days=int(years_forward * 365.25))

    for i, lord in enumerate(sequence):
        years = VIMSHOTTARI_YEARS.get(lord, 7)
        duration_days = int(years * 365.25)
        end_date = current_start + timedelta(days=duration_days)

        timeline.append(
            DashaPeriod(
                planet=lord,
                start_date=current_start,
                end_date=end_date,
                level=1,  # Mahadasha
                duration_years=years,
            )
        )

        current_start = end_date

        # Continue for another full cycle if needed
        if current_start >= end_limit and i >= 8:
            break

    # If we need more years, continue with the sequence
    cycle = 1
    while current_start < end_limit and cycle < 3:  # Max 3 cycles (360 years)
        for lord in sequence:
            years = VIMSHOTTARI_YEARS.get(lord, 7)
            duration_days = int(years * 365.25)
            end_date = current_start + timedelta(days=duration_days)

            timeline.append(
                DashaPeriod(
                    planet=lord,
                    start_date=current_start,
                    end_date=end_date,
                    level=1,
                    duration_years=years,
                )
            )

            current_start = end_date
            if current_start >= end_limit:
                break
        cycle += 1

    return timeline


def find_current_mahadasha(
    timeline: List[DashaPeriod], as_of_date: Optional[date] = None
) -> Optional[DashaPeriod]:
    """
    Find the currently running Mahadasha.

    Args:
        timeline: List of Mahadasha periods
        as_of_date: Date to check (default: today)

    Returns:
        The current DashaPeriod or None
    """
    check_date = as_of_date or date.today()

    for period in timeline:
        if period.level == 1 and period.start_date <= check_date <= period.end_date:
            return period

    return None


def generate_dasha_timeline(
    moon_longitude: float, birth_date: date, years_forward: int = 120
) -> DashaTimeline:
    """
    Generate complete Dasha timeline including birth nakshatra info.

    Args:
        moon_longitude: Moon's sidereal longitude at birth
        birth_date: Date of birth
        years_forward: How many years from birth to calculate

    Returns:
        DashaTimeline object with all information
    """
    nakshatra_name, nakshatra_lord, pada = get_birth_nakshatra(moon_longitude)
    balance_fraction = get_nakshatra_balance(moon_longitude)
    balance_years = VIMSHOTTARI_YEARS.get(nakshatra_lord, 7) * balance_fraction

    mahadashas = generate_mahadasha_timeline(moon_longitude, birth_date, years_forward)

    current_md = find_current_mahadasha(mahadashas)

    # Import antardasha here to avoid circular imports
    from .antardasha import generate_antardasha_timeline

    current_ad = None
    antardashas = []

    if current_md:
        antardashas = generate_antardasha_timeline(current_md)
        # Find current antardasha
        today = date.today()
        for ad in antardashas:
            if ad.start_date <= today <= ad.end_date:
                current_ad = ad
                break

    return DashaTimeline(
        birth_nakshatra=nakshatra_name,
        nakshatra_lord=nakshatra_lord,
        balance_at_birth=balance_years,
        mahadashas=mahadashas,
        current_mahadasha=current_md,
        current_antardasha=current_ad,
        antardashas=antardashas,
    )
