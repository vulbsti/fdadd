"""Calculate inauspicious periods: Rahukaal, Yamagandam, Gulika Kaal."""

from typing import List

from atros.core.constants import (
    GULIKA_SEGMENT,
    RAHUKAAL_SEGMENT,
    YAMAGANDAM_SEGMENT,
)
from atros.core.models import MuhurtaPeriod

_SEGMENT_MAP = {
    "rahukaal": RAHUKAAL_SEGMENT,
    "yamagandam": YAMAGANDAM_SEGMENT,
    "gulika": GULIKA_SEGMENT,
}

_DISPLAY_NAME = {
    "rahukaal": "Rahukaal",
    "yamagandam": "Yamagandam",
    "gulika": "Gulika Kaal",
}


def calculate_inauspicious_period(
    day_duration_minutes: float, weekday: int, period_type: str
) -> MuhurtaPeriod:
    """Calculate Rahukaal, Yamagandam, or Gulika Kaal.

    Args:
        day_duration_minutes: sunrise-to-sunset in minutes.
        weekday: 0=Sunday..6=Saturday.
        period_type: 'rahukaal', 'yamagandam', or 'gulika'.

    Returns:
        MuhurtaPeriod with start/end in minutes from sunrise.

    Each segment = day_duration / 8.
    The segment number (1-based) for the given weekday is looked up from
    the corresponding constant array. Segment 1 starts at sunrise (0 min).
    """
    if period_type not in _SEGMENT_MAP:
        raise ValueError(f"Unknown period_type: {period_type!r}")
    if not 0 <= weekday <= 6:
        raise ValueError(f"weekday must be 0-6, got {weekday}")

    segment_table = _SEGMENT_MAP[period_type]
    segment_number = segment_table[weekday]  # 1-based
    segment_duration = day_duration_minutes / 8.0
    start = (segment_number - 1) * segment_duration
    end = segment_number * segment_duration

    return MuhurtaPeriod(
        name=_DISPLAY_NAME[period_type],
        start_minutes_from_sunrise=start,
        end_minutes_from_sunrise=end,
        nature="Inauspicious",
        lord="",
    )


def calculate_all_inauspicious(
    day_duration_minutes: float, weekday: int
) -> List[MuhurtaPeriod]:
    """Return all 3 inauspicious periods for a given day."""
    return [
        calculate_inauspicious_period(day_duration_minutes, weekday, pt)
        for pt in ("rahukaal", "yamagandam", "gulika")
    ]
