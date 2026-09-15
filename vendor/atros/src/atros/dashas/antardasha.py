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

from datetime import date, timedelta
from typing import List

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


def generate_antardasha_timeline(mahadasha: DashaPeriod) -> List[DashaPeriod]:
    """
    Generate Antardasha periods within a Mahadasha.

    Args:
        mahadasha: The parent Mahadasha period

    Returns:
        List of Antardasha periods
    """
    md_lord = mahadasha.planet
    sequence = get_antardasha_sequence(md_lord)

    antardashas = []
    current_start = mahadasha.start_date

    for ad_lord in sequence:
        duration_years = calculate_antardasha_duration(md_lord, ad_lord)
        duration_days = int(duration_years * 365.25)

        end_date = current_start + timedelta(days=duration_days)

        # Don't exceed Mahadasha end
        if end_date > mahadasha.end_date:
            end_date = mahadasha.end_date

        antardashas.append(
            DashaPeriod(
                planet=ad_lord,
                start_date=current_start,
                end_date=end_date,
                level=2,  # Antardasha
                duration_years=duration_years,
            )
        )

        current_start = end_date

        if current_start >= mahadasha.end_date:
            break

    return antardashas


def generate_pratyantardasha_timeline(antardasha: DashaPeriod) -> List[DashaPeriod]:
    """
    Generate Pratyantardasha (sub-sub-period) within an Antardasha.

    Formula: Duration = (AD_years × PAD_years) / 120
    where AD_years is the original dasha years for the Antardasha lord

    Args:
        antardasha: The parent Antardasha period

    Returns:
        List of Pratyantardasha periods
    """
    ad_lord = antardasha.planet
    sequence = get_antardasha_sequence(ad_lord)

    # Get the original dasha years for the AD lord (not the actual AD duration)
    ad_years = VIMSHOTTARI_YEARS.get(ad_lord, 7)

    pratyantardashas = []
    current_start = antardasha.start_date

    for pad_lord in sequence:
        pad_years = VIMSHOTTARI_YEARS.get(pad_lord, 7)

        # Duration in terms of the Antardasha's time scale
        # PAD duration = (AD_duration_actual × PAD_years) / AD_years
        actual_ad_duration_days = (antardasha.end_date - antardasha.start_date).days
        duration_fraction = pad_years / 120.0  # Fraction of full cycle
        duration_days = int(actual_ad_duration_days * (pad_years / sum(VIMSHOTTARI_YEARS.values())))

        if duration_days < 1:
            duration_days = 1

        end_date = current_start + timedelta(days=duration_days)

        # Don't exceed Antardasha end
        if end_date > antardasha.end_date:
            end_date = antardasha.end_date

        duration_years = duration_days / 365.25

        pratyantardashas.append(
            DashaPeriod(
                planet=pad_lord,
                start_date=current_start,
                end_date=end_date,
                level=3,  # Pratyantardasha
                duration_years=duration_years,
            )
        )

        current_start = end_date

        if current_start >= antardasha.end_date:
            break

    return pratyantardashas


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
