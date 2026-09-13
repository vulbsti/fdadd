"""Choghadiya (auspicious time segment) calculations."""

from typing import List

from atros.core.constants import (
    CHOGHADIYA_NATURE,
    CHOGHADIYA_PLANET_ORDER,
    CHOGHADIYA_TYPE,
    WEEKDAY_PLANET,
)
from atros.core.models import MuhurtaPeriod


def choghadiya_sequence(weekday: int, is_night: bool = False) -> List[str]:
    """Generate 8 Choghadiya type names for day or night.

    Day starts with weekday planet in CHOGHADIYA_PLANET_ORDER.
    Night starts with 5th planet (index+4) from the day lord.
    The 8th Choghadiya repeats the 1st (cycle of 7 planets, 8 slots).

    Args:
        weekday: 0=Sunday..6=Saturday.
        is_night: False for daytime, True for nighttime.

    Returns:
        List of 8 Choghadiya type names (e.g. ["Udveg", "Char", ...]).
    """
    if not 0 <= weekday <= 6:
        raise ValueError(f"weekday must be 0-6, got {weekday}")

    day_lord = WEEKDAY_PLANET[weekday]
    day_start_idx = CHOGHADIYA_PLANET_ORDER.index(day_lord)

    if is_night:
        start_idx = (day_start_idx + 5) % len(CHOGHADIYA_PLANET_ORDER)
    else:
        start_idx = day_start_idx

    n = len(CHOGHADIYA_PLANET_ORDER)  # 7
    types: List[str] = []
    for i in range(8):
        planet = CHOGHADIYA_PLANET_ORDER[(start_idx + i) % n]
        types.append(CHOGHADIYA_TYPE[planet])
    return types


def calculate_choghadiya(
    weekday: int,
    day_duration_minutes: float,
    night_duration_minutes: float,
) -> List[MuhurtaPeriod]:
    """Calculate all 16 Choghadiya periods (8 day + 8 night).

    Args:
        weekday: 0=Sunday..6=Saturday.
        day_duration_minutes: sunrise-to-sunset in minutes.
        night_duration_minutes: sunset-to-next-sunrise in minutes.

    Returns:
        List of 16 MuhurtaPeriod objects: 8 daytime followed by 8 nighttime.
    """
    day_segment = day_duration_minutes / 8.0
    night_segment = night_duration_minutes / 8.0

    day_types = choghadiya_sequence(weekday, is_night=False)
    night_types = choghadiya_sequence(weekday, is_night=True)

    periods: List[MuhurtaPeriod] = []

    for i, ctype in enumerate(day_types):
        start = i * day_segment
        end = (i + 1) * day_segment
        # Find the planet for this type to use as lord
        planet = [p for p, t in CHOGHADIYA_TYPE.items() if t == ctype][0]
        periods.append(
            MuhurtaPeriod(
                name=ctype,
                start_minutes_from_sunrise=start,
                end_minutes_from_sunrise=end,
                nature=CHOGHADIYA_NATURE[ctype],
                lord=planet,
            )
        )

    for i, ctype in enumerate(night_types):
        start = day_duration_minutes + i * night_segment
        end = day_duration_minutes + (i + 1) * night_segment
        planet = [p for p, t in CHOGHADIYA_TYPE.items() if t == ctype][0]
        periods.append(
            MuhurtaPeriod(
                name=ctype,
                start_minutes_from_sunrise=start,
                end_minutes_from_sunrise=end,
                nature=CHOGHADIYA_NATURE[ctype],
                lord=planet,
            )
        )

    return periods
