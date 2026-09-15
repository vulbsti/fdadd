"""
Transit (gochara) overlay for an arbitrary date.

Pure service: natal birth data + as_of date -> transit signs, houses from
natal Moon, favorable/vedha flags, Sade Sati/Dhaiya status, double-transit
set. Location-independent (geocentric longitudes); transit subject is cast
at local noon on as_of date at the natal coordinates.
"""

from datetime import date, datetime
from typing import Dict

from ..core.constants import RASHI_NAMES
from ..core.models import BirthData
from ..ephemeris.kerykeion_adapter import KerykeionAdapter
from ..transit.gochara import calculate_double_transit, calculate_transit_results
from ..transit.sade_sati import get_sade_sati_status

PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]


def transit_for_date(
    natal: BirthData, as_of: date, adapter: KerykeionAdapter | None = None
) -> Dict:
    adapter = adapter or KerykeionAdapter()
    natal_positions = adapter.get_planet_positions(natal)
    natal_moon_abs = natal_positions["Moon"]["abs_pos"]
    natal_moon_sign = int(natal_moon_abs // 30) % 12

    transit_birth = BirthData(
        name="transit",
        birth_date=as_of,
        birth_time=datetime(as_of.year, as_of.month, as_of.day, 12, 0),
        latitude=natal.latitude,
        longitude=natal.longitude,
        timezone=natal.timezone,
    )
    transit_positions = adapter.get_planet_positions(transit_birth)
    transit_signs: Dict[str, int] = {}
    for planet in PLANETS:
        abs_pos = transit_positions[planet]["abs_pos"]
        transit_signs[planet] = int(abs_pos // 30) % 12

    results = calculate_transit_results(natal_moon_sign, transit_signs)
    sade = get_sade_sati_status(natal_moon_sign, transit_signs["Saturn"])
    double_idx = calculate_double_transit(transit_signs["Jupiter"], transit_signs["Saturn"])

    return {
        "as_of": as_of.isoformat(),
        "natal_moon_sign": RASHI_NAMES[natal_moon_sign],
        "natal_moon_sign_index": natal_moon_sign,
        "transits": [
            {
                "planet": r.planet,
                "transit_sign": r.transit_sign,
                "transit_sign_index": r.transit_sign_index,
                "house_from_moon": r.house_from_moon,
                "is_favorable": r.is_favorable,
                "is_vedha_obstructed": r.is_vedha_obstructed,
                "vedha_planet": r.vedha_planet,
            }
            for r in results
        ],
        "sade_sati": sade.model_dump(),
        "double_transit_signs": [RASHI_NAMES[i] for i in sorted(double_idx)],
        "double_transit_indices": sorted(double_idx),
    }
