"""
Kerykeion adapter for Swiss Ephemeris calculations.

This module wraps Kerykeion to provide sidereal planetary positions
using the Lahiri Ayanamsa system.
"""

from datetime import datetime
from typing import Dict, List, Optional, Tuple

from kerykeion import AstrologicalSubject

from ..core.constants import RASHI_LORDS, RASHI_NAMES
from ..core.models import BirthData


class KerykeionAdapter:
    """
    Adapter for Kerykeion ephemeris library.

    Provides sidereal planetary positions with Lahiri Ayanamsa.
    """

    # Mapping from Kerykeion abbreviated sign names to full names
    SIGN_ABBREV_MAP = {
        "Ari": "Aries", "Tau": "Taurus", "Gem": "Gemini", "Can": "Cancer",
        "Leo": "Leo", "Vir": "Virgo", "Lib": "Libra", "Sco": "Scorpio",
        "Sag": "Sagittarius", "Cap": "Capricorn", "Aqu": "Aquarius", "Pis": "Pisces",
    }

    # Mapping from Kerykeion planet attributes to our planet names
    PLANET_ATTRS = [
        ("sun", "Sun"),
        ("moon", "Moon"),
        ("mercury", "Mercury"),
        ("venus", "Venus"),
        ("mars", "Mars"),
        ("jupiter", "Jupiter"),
        ("saturn", "Saturn"),
        ("true_north_lunar_node", "Rahu"),  # North Node = Rahu (Kerykeion v5)
    ]

    def __init__(self, sidereal_mode: str = "LAHIRI"):
        """
        Initialize the adapter.

        Args:
            sidereal_mode: Ayanamsa system to use (default: LAHIRI)
        """
        self.sidereal_mode = sidereal_mode

    def _normalize_sign_name(self, sign: str) -> str:
        """Convert abbreviated sign name to full name."""
        return self.SIGN_ABBREV_MAP.get(sign, sign)

    def _asc_sign_index(self, subject: AstrologicalSubject) -> int:
        """Sign index (0-11) of the ascendant (Lagna) for a Kerykeion subject."""
        first_house = subject.first_house
        sign_name = self._normalize_sign_name(first_house.sign)
        try:
            return RASHI_NAMES.index(sign_name)
        except ValueError:
            return first_house.sign_num if hasattr(first_house, "sign_num") else 0

    @staticmethod
    def whole_sign_house(sign_index: int, asc_sign_index: int) -> int:
        """Whole-sign (Rashi) house (1-12) of a sign counted from the Lagna sign."""
        return ((sign_index - asc_sign_index) % 12) + 1

    def _create_subject(
        self, birth_data: BirthData, use_sidereal: bool = True
    ) -> AstrologicalSubject:
        """
        Create a Kerykeion AstrologicalSubject from birth data.

        Args:
            birth_data: Birth details
            use_sidereal: Whether to use sidereal zodiac (True) or tropical (False)

        Returns:
            AstrologicalSubject instance
        """
        dt = birth_data.birth_time

        # Build kwargs for AstrologicalSubject
        kwargs = {
            "name": birth_data.name,
            "year": dt.year,
            "month": dt.month,
            "day": dt.day,
            "hour": dt.hour,
            "minute": dt.minute,
            "lng": birth_data.longitude,
            "lat": birth_data.latitude,
            "tz_str": birth_data.timezone,
            "online": False,  # Don't fetch location data online
        }

        if use_sidereal:
            kwargs["zodiac_type"] = "Sidereal"
            kwargs["sidereal_mode"] = self.sidereal_mode

        return AstrologicalSubject(**kwargs)

    def get_planet_positions(self, birth_data: BirthData) -> Dict[str, Dict]:
        """
        Get sidereal positions of all planets.

        Args:
            birth_data: Birth details

        Returns:
            Dict mapping planet names to position data:
            {
                "Sun": {
                    "sign": "Aries",
                    "sign_index": 0,
                    "degree": 8.45,
                    "abs_pos": 8.45,
                    "house": 11,
                    "retrograde": False
                },
                ...
            }
        """
        subject = self._create_subject(birth_data, use_sidereal=True)
        asc_sign_index = self._asc_sign_index(subject)

        planets = {}

        # Extract positions for all planets except Ketu
        for attr_name, planet_name in self.PLANET_ATTRS:
            planet_obj = getattr(subject, attr_name, None)
            if planet_obj is None:
                continue

            # Get sign index from the sign name, normalizing abbreviated names
            sign_name = self._normalize_sign_name(planet_obj.sign)
            try:
                sign_index = RASHI_NAMES.index(sign_name)
            except ValueError:
                # Handle potential sign name variations
                sign_index = planet_obj.sign_num if hasattr(planet_obj, "sign_num") else 0

            # Whole-sign (Rashi) house counted from the Lagna sign. Kerykeion's
            # own `planet_obj.house` is a quadrant (Placidus) house and must not
            # be used: the lagna chart's house cusps are whole-sign.
            house_num = self.whole_sign_house(sign_index, asc_sign_index)

            planets[planet_name] = {
                "sign": sign_name,
                "sign_index": sign_index,
                "degree": planet_obj.position,  # Degree within sign (0-30)
                "abs_pos": planet_obj.abs_pos,  # Absolute position (0-360)
                "house": house_num,
                "retrograde": getattr(planet_obj, "retrograde", False),
            }

        # Calculate Ketu (always 180 degrees opposite to Rahu)
        if "Rahu" in planets:
            rahu = planets["Rahu"]
            ketu_abs = (rahu["abs_pos"] + 180) % 360
            ketu_sign_index = int(ketu_abs / 30)
            ketu_degree = ketu_abs % 30
            ketu_house = self.whole_sign_house(ketu_sign_index, asc_sign_index)

            planets["Ketu"] = {
                "sign": RASHI_NAMES[ketu_sign_index],
                "sign_index": ketu_sign_index,
                "degree": ketu_degree,
                "abs_pos": ketu_abs,
                "house": ketu_house,
                "retrograde": True,  # Nodes are always considered retrograde
            }

        return planets

    def get_ascendant(self, birth_data: BirthData) -> Dict:
        """
        Get the ascendant (Lagna) position.

        Args:
            birth_data: Birth details

        Returns:
            Dict with ascendant data
        """
        subject = self._create_subject(birth_data, use_sidereal=True)

        # Get first house (ascendant)
        first_house = subject.first_house

        sign_name = self._normalize_sign_name(first_house.sign)
        try:
            sign_index = RASHI_NAMES.index(sign_name)
        except ValueError:
            sign_index = first_house.sign_num if hasattr(first_house, "sign_num") else 0

        return {
            "sign": sign_name,
            "sign_index": sign_index,
            "degree": first_house.position,
            "abs_pos": first_house.abs_pos if hasattr(first_house, "abs_pos") else sign_index * 30 + first_house.position,
            "lord": RASHI_LORDS.get(sign_name, "Unknown"),
        }

    def get_house_cusps(self, birth_data: BirthData) -> List[Dict]:
        """
        Get all 12 house cusps using Whole Sign house system.

        In Whole Sign houses (used in Vedic), each house occupies
        exactly one sign, starting from the ascendant sign.

        Args:
            birth_data: Birth details

        Returns:
            List of 12 house cusp dicts
        """
        subject = self._create_subject(birth_data, use_sidereal=True)

        # Get ascendant sign
        first_house = subject.first_house
        asc_sign_name = self._normalize_sign_name(first_house.sign)
        try:
            asc_sign_index = RASHI_NAMES.index(asc_sign_name)
        except ValueError:
            asc_sign_index = 0

        houses = []
        for i in range(12):
            sign_index = (asc_sign_index + i) % 12
            sign_name = RASHI_NAMES[sign_index]

            houses.append({
                "house": i + 1,
                "sign": sign_name,
                "sign_index": sign_index,
                "degree": first_house.position if i == 0 else 0.0,
                "lord": RASHI_LORDS.get(sign_name, "Unknown"),
            })

        return houses

    def get_ayanamsa(self, birth_data: BirthData) -> float:
        """
        Calculate the Ayanamsa value for the given birth data.

        Ayanamsa = Tropical position - Sidereal position

        Args:
            birth_data: Birth details

        Returns:
            Ayanamsa value in degrees
        """
        # Create both tropical and sidereal subjects
        tropical = self._create_subject(birth_data, use_sidereal=False)
        sidereal = self._create_subject(birth_data, use_sidereal=True)

        # Calculate difference using Sun's position
        ayanamsa = tropical.sun.abs_pos - sidereal.sun.abs_pos

        # Normalize to positive value
        if ayanamsa < 0:
            ayanamsa += 360

        return ayanamsa

    def get_moon_position(self, birth_data: BirthData) -> Tuple[float, str, int]:
        """
        Get Moon's position specifically (commonly needed for dasha calculations).

        Args:
            birth_data: Birth details

        Returns:
            Tuple of (absolute_degree, sign_name, sign_index)
        """
        positions = self.get_planet_positions(birth_data)
        moon = positions.get("Moon", {})

        return (
            moon.get("abs_pos", 0.0),
            moon.get("sign", "Aries"),
            moon.get("sign_index", 0),
        )
