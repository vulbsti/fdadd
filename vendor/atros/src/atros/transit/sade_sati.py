"""
Sade Sati and Dhaiya (Small Panoti) calculations.

Sade Sati is a 7.5-year period when Saturn transits through the 12th, 1st, and 2nd
houses from the natal Moon sign. Dhaiya covers Saturn's transit in the 4th and 8th
houses from the natal Moon.
"""

from atros.core.constants import (
    DHAIYA_DISTANCES,
    RASHI_NAMES,
    SADE_SATI_PHASES,
)
from atros.core.models import SadeSatiStatus


def get_sade_sati_status(natal_moon_sign: int, saturn_sign: int) -> SadeSatiStatus:
    """Check Sade Sati and Dhaiya status.

    Args:
        natal_moon_sign: Natal Moon sign index (0-11).
        saturn_sign: Current Saturn transit sign index (0-11).

    Returns:
        SadeSatiStatus with active status, type, and phase information.
    """
    distance = (saturn_sign - natal_moon_sign) % 12

    # Check Sade Sati (Saturn in 12th, 1st, or 2nd from Moon)
    if distance in SADE_SATI_PHASES:
        phase_num, phase_name = SADE_SATI_PHASES[distance]
        return SadeSatiStatus(
            is_active=True,
            type="sade_sati",
            phase=phase_num,
            phase_name=phase_name,
            saturn_sign=RASHI_NAMES[saturn_sign],
            natal_moon_sign=RASHI_NAMES[natal_moon_sign],
        )

    # Check Dhaiya (Saturn in 4th or 8th from Moon)
    # DHAIYA_DISTANCES keys are house numbers (1-indexed: 4th and 8th),
    # but stored as distances from Moon: 3 = 4th house, 7 = 8th house
    if distance in DHAIYA_DISTANCES:
        return SadeSatiStatus(
            is_active=True,
            type="dhaiya",
            phase=None,
            phase_name=DHAIYA_DISTANCES[distance],
            saturn_sign=RASHI_NAMES[saturn_sign],
            natal_moon_sign=RASHI_NAMES[natal_moon_sign],
        )

    # Not active
    return SadeSatiStatus(
        is_active=False,
        saturn_sign=RASHI_NAMES[saturn_sign],
        natal_moon_sign=RASHI_NAMES[natal_moon_sign],
    )
