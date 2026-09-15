"""Planetary hora (hour) calculations."""

from typing import List

from atros.core.constants import CHALDEAN_ORDER, WEEKDAY_PLANET
from atros.core.models import MuhurtaPeriod


def get_hora_lord(weekday: int, hora_number: int, is_daytime: bool = True) -> str:
    """Get the planetary lord of a specific hora.

    Args:
        weekday: 0=Sunday..6=Saturday.
        hora_number: 0-11 (12 horas per half-day).
        is_daytime: True for daytime horas, False for nighttime.

    Returns:
        Planet name ruling this hora.

    First daytime hora = weekday planet.  Subsequent horas follow
    Chaldean order (Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon).
    Night horas continue the sequence from where daytime left off.
    """
    if not 0 <= weekday <= 6:
        raise ValueError(f"weekday must be 0-6, got {weekday}")
    if not 0 <= hora_number <= 11:
        raise ValueError(f"hora_number must be 0-11, got {hora_number}")

    day_lord = WEEKDAY_PLANET[weekday]
    chaldean_start = CHALDEAN_ORDER.index(day_lord)

    # Absolute hora index: daytime horas 0-11, nighttime horas 12-23
    absolute_hora = hora_number if is_daytime else hora_number + 12
    idx = (chaldean_start + absolute_hora) % len(CHALDEAN_ORDER)
    return CHALDEAN_ORDER[idx]


def calculate_all_horas(
    weekday: int, day_duration_minutes: float, night_duration_minutes: float
) -> List[MuhurtaPeriod]:
    """Calculate all 24 horas for a day. 12 day + 12 night.

    Args:
        weekday: 0=Sunday..6=Saturday.
        day_duration_minutes: sunrise-to-sunset in minutes.
        night_duration_minutes: sunset-to-next-sunrise in minutes.

    Returns:
        List of 24 MuhurtaPeriod objects. Daytime horas have
        start/end relative to sunrise. Nighttime horas have
        start relative to sunrise (i.e. daytime + offset into night).
    """
    day_hora_len = day_duration_minutes / 12.0
    night_hora_len = night_duration_minutes / 12.0
    periods: List[MuhurtaPeriod] = []

    for i in range(12):
        lord = get_hora_lord(weekday, i, is_daytime=True)
        start = i * day_hora_len
        end = (i + 1) * day_hora_len
        periods.append(
            MuhurtaPeriod(
                name=f"Hora {i + 1} (Day)",
                start_minutes_from_sunrise=start,
                end_minutes_from_sunrise=end,
                nature="Neutral",
                lord=lord,
            )
        )

    for i in range(12):
        lord = get_hora_lord(weekday, i, is_daytime=False)
        start = day_duration_minutes + i * night_hora_len
        end = day_duration_minutes + (i + 1) * night_hora_len
        periods.append(
            MuhurtaPeriod(
                name=f"Hora {i + 1} (Night)",
                start_minutes_from_sunrise=start,
                end_minutes_from_sunrise=end,
                nature="Neutral",
                lord=lord,
            )
        )

    return periods
