"""
Lunar Yoga Detection.

Yogas formed relative to the Moon's position. This module detects:
1. Kemadruma Yoga (negative) - Moon isolated from other planets
2. Sunapha Yoga - Planet in 2nd from Moon
3. Anapha Yoga - Planet in 12th from Moon
4. Durudhara Yoga - Planets in both 2nd and 12th from Moon
5. Adhi Yoga - Benefics in 6th, 7th, 8th from Moon
6. Shakata Yoga (negative) - Jupiter in 6th or 8th from Moon
"""

from typing import List, Optional

from ..core.constants import KENDRA_HOUSES
from ..core.models import LagnaChart, PlanetPosition, Yoga
from .base import YogaDetector

ELIGIBLE = ["Mars", "Mercury", "Jupiter", "Venus", "Saturn"]


class LunarYogaDetector(YogaDetector):
    """Detector for lunar yogas formed relative to Moon's position."""

    @property
    def yoga_type(self) -> str:
        return "Lunar"

    def detect(self, chart: LagnaChart) -> List[Yoga]:
        moon = self._get_planet_by_name(chart, "Moon")
        if not moon:
            return []

        yogas: List[Yoga] = []

        # Detect Durudhara first to decide whether to suppress Sunapha/Anapha
        durudhara = self._detect_durudhara(chart, moon)
        if durudhara:
            yogas.extend(durudhara)
        else:
            yogas.extend(self._detect_sunapha(chart, moon))
            yogas.extend(self._detect_anapha(chart, moon))

        yogas.extend(self._detect_kemadruma(chart, moon))
        yogas.extend(self._detect_adhi(chart, moon))
        yogas.extend(self._detect_shakata(chart, moon))
        return yogas

    # ------------------------------------------------------------------
    def _eligible_planets_in_house(
        self, chart: LagnaChart, house: int
    ) -> List[PlanetPosition]:
        """Return eligible planets occupying the given house."""
        return [
            p
            for p in chart.planets
            if p.planet in ELIGIBLE and p.house == house
        ]

    def _house_offset(self, base_house: int, offset: int) -> int:
        """Return house number that is *offset* houses from base (1-based)."""
        return ((base_house - 1 + offset) % 12) + 1

    # ------------------------------------------------------------------
    # Kemadruma Yoga
    # ------------------------------------------------------------------
    def _detect_kemadruma(self, chart: LagnaChart, moon: PlanetPosition) -> List[Yoga]:
        house_2nd = self._house_offset(moon.house, 1)
        house_12th = self._house_offset(moon.house, -1)

        in_2nd = self._eligible_planets_in_house(chart, house_2nd)
        in_12th = self._eligible_planets_in_house(chart, house_12th)

        if in_2nd or in_12th:
            return []

        # Check cancellation conditions
        cancellations: List[str] = []

        # Eligible planet in Kendra from Moon
        for offset in [0, 3, 6, 9]:  # distances 1,4,7,10 in 0-based offset
            h = self._house_offset(moon.house, offset)
            for p in self._eligible_planets_in_house(chart, h):
                cancellations.append(
                    f"{p.planet} in Kendra (house {h}) from Moon"
                )

        # Moon in Kendra from Lagna
        if moon.house in KENDRA_HOUSES:
            cancellations.append(
                f"Moon is in Kendra (house {moon.house}) from Lagna"
            )

        if cancellations:
            strength = 30.0
            desc = (
                f"Moon in house {moon.house} has no eligible planet in 2nd or 12th house, "
                f"indicating Kemadruma Yoga. However, partial cancellation applies: "
                f"{'; '.join(cancellations)}."
            )
        else:
            strength = 70.0
            desc = (
                f"Moon in house {moon.house} has no eligible planet in the 2nd "
                f"(house {house_2nd}) or 12th (house {house_12th}) from it, "
                f"forming Kemadruma Yoga. This may cause periods of financial "
                f"difficulty and loneliness."
            )

        return [
            Yoga(
                name="Kemadruma Yoga",
                type="Kemadruma",
                planets_involved=["Moon"],
                houses_involved=[moon.house],
                description=desc,
                strength=strength,
            )
        ]

    # ------------------------------------------------------------------
    # Sunapha Yoga
    # ------------------------------------------------------------------
    def _detect_sunapha(self, chart: LagnaChart, moon: PlanetPosition) -> List[Yoga]:
        house_2nd = self._house_offset(moon.house, 1)
        planets = self._eligible_planets_in_house(chart, house_2nd)
        if not planets:
            return []

        best = planets[0]
        strength = self._planet_strength(best)

        return [
            Yoga(
                name="Sunapha Yoga",
                type=self.yoga_type,
                planets_involved=["Moon"] + [p.planet for p in planets],
                houses_involved=[moon.house, house_2nd],
                description=(
                    f"{', '.join(p.planet for p in planets)} in the 2nd house "
                    f"(house {house_2nd}) from Moon forms Sunapha Yoga. "
                    f"This gives self-earned wealth and intelligence."
                ),
                strength=strength,
            )
        ]

    # ------------------------------------------------------------------
    # Anapha Yoga
    # ------------------------------------------------------------------
    def _detect_anapha(self, chart: LagnaChart, moon: PlanetPosition) -> List[Yoga]:
        house_12th = self._house_offset(moon.house, -1)
        planets = self._eligible_planets_in_house(chart, house_12th)
        if not planets:
            return []

        best = planets[0]
        strength = self._planet_strength(best)

        return [
            Yoga(
                name="Anapha Yoga",
                type=self.yoga_type,
                planets_involved=["Moon"] + [p.planet for p in planets],
                houses_involved=[moon.house, house_12th],
                description=(
                    f"{', '.join(p.planet for p in planets)} in the 12th house "
                    f"(house {house_12th}) from Moon forms Anapha Yoga. "
                    f"This gives good health, virtuous character, and fame."
                ),
                strength=strength,
            )
        ]

    # ------------------------------------------------------------------
    # Durudhara Yoga
    # ------------------------------------------------------------------
    def _detect_durudhara(self, chart: LagnaChart, moon: PlanetPosition) -> List[Yoga]:
        house_2nd = self._house_offset(moon.house, 1)
        house_12th = self._house_offset(moon.house, -1)

        in_2nd = self._eligible_planets_in_house(chart, house_2nd)
        in_12th = self._eligible_planets_in_house(chart, house_12th)

        if not in_2nd or not in_12th:
            return []

        all_planets = in_2nd + in_12th

        return [
            Yoga(
                name="Durudhara Yoga",
                type=self.yoga_type,
                planets_involved=["Moon"] + [p.planet for p in all_planets],
                houses_involved=[moon.house, house_2nd, house_12th],
                description=(
                    f"Planets in both 2nd ({', '.join(p.planet for p in in_2nd)}) "
                    f"and 12th ({', '.join(p.planet for p in in_12th)}) from Moon "
                    f"form Durudhara Yoga. This gives wealth, vehicles, and generosity."
                ),
                strength=85.0,
            )
        ]

    # ------------------------------------------------------------------
    # Adhi Yoga
    # ------------------------------------------------------------------
    def _detect_adhi(self, chart: LagnaChart, moon: PlanetPosition) -> List[Yoga]:
        benefics = {"Jupiter", "Venus", "Mercury"}
        occupied_houses: List[int] = []
        involved_planets: List[str] = []

        for offset in [5, 6, 7]:  # 6th, 7th, 8th from Moon
            h = self._house_offset(moon.house, offset)
            for p in chart.planets:
                if p.planet in benefics and p.house == h:
                    if h not in occupied_houses:
                        occupied_houses.append(h)
                    if p.planet not in involved_planets:
                        involved_planets.append(p.planet)

        if not occupied_houses:
            return []

        count = len(occupied_houses)
        if count >= 3:
            strength = 90.0
        elif count == 2:
            strength = 70.0
        else:
            strength = 50.0

        return [
            Yoga(
                name="Adhi Yoga",
                type=self.yoga_type,
                planets_involved=["Moon"] + involved_planets,
                houses_involved=[moon.house] + occupied_houses,
                description=(
                    f"Benefics ({', '.join(involved_planets)}) occupy {count} of the "
                    f"6th/7th/8th houses from Moon, forming Adhi Yoga. "
                    f"This gives leadership, affluence, and power."
                ),
                strength=strength,
            )
        ]

    # ------------------------------------------------------------------
    # Shakata Yoga
    # ------------------------------------------------------------------
    def _detect_shakata(self, chart: LagnaChart, moon: PlanetPosition) -> List[Yoga]:
        jupiter = self._get_planet_by_name(chart, "Jupiter")
        if not jupiter:
            return []

        sign_distance = ((jupiter.sign_index - moon.sign_index) % 12) + 1
        if sign_distance not in (6, 8):
            return []

        # Cancellation: Moon or Jupiter in Kendra from Lagna
        cancelled = moon.house in KENDRA_HOUSES or jupiter.house in KENDRA_HOUSES
        if cancelled:
            return []

        return [
            Yoga(
                name="Shakata Yoga",
                type=self.yoga_type,
                planets_involved=["Moon", "Jupiter"],
                houses_involved=[moon.house, jupiter.house],
                description=(
                    f"Jupiter in {jupiter.sign} is in the {sign_distance}th sign "
                    f"from Moon in {moon.sign}, forming Shakata Yoga. "
                    f"This may cause fluctuations in fortune."
                ),
                strength=60.0,
            )
        ]

    # ------------------------------------------------------------------
    @staticmethod
    def _planet_strength(planet: PlanetPosition) -> float:
        if planet.planet == "Jupiter":
            return 80.0
        if planet.planet == "Venus":
            return 70.0
        return 60.0
