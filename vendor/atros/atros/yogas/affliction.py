"""
Affliction Yoga Detection.

Negative yogas caused by planetary afflictions. This module detects:
1. Kala Sarpa Yoga - All planets on one side of Rahu-Ketu axis
2. Daridra Yoga - Lord of 11th in dusthana
3. Grahan Yoga - Sun/Moon conjunct Rahu/Ketu
4. Angarak Yoga - Mars conjunct Rahu
"""

from typing import List, Optional

from ..core.constants import DUSTHANA_HOUSES, RASHI_NAMES
from ..core.models import LagnaChart, PlanetPosition, Yoga
from .base import YogaDetector

# 12 named sub-types of Kala Sarpa by Rahu's house
KALA_SARPA_NAMES = {
    1: "Anant",
    2: "Kulik",
    3: "Vasuki",
    4: "Shankhpal",
    5: "Padma",
    6: "Mahapadma",
    7: "Takshak",
    8: "Karkotak",
    9: "Shankhachud",
    10: "Ghatak",
    11: "Vishdhar",
    12: "Sheshnag",
}

SEVEN_PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]


class AfflictionYogaDetector(YogaDetector):
    """Detector for affliction (negative) yogas."""

    @property
    def yoga_type(self) -> str:
        return "Affliction"

    def detect(self, chart: LagnaChart) -> List[Yoga]:
        yogas: List[Yoga] = []
        yogas.extend(self._detect_kala_sarpa(chart))
        yogas.extend(self._detect_daridra(chart))
        yogas.extend(self._detect_grahan(chart))
        yogas.extend(self._detect_angarak(chart))
        return yogas

    # ------------------------------------------------------------------
    # Kala Sarpa Yoga
    # ------------------------------------------------------------------
    def _detect_kala_sarpa(self, chart: LagnaChart) -> List[Yoga]:
        rahu = self._get_planet_by_name(chart, "Rahu")
        ketu = self._get_planet_by_name(chart, "Ketu")
        if not rahu or not ketu:
            return []

        rahu_deg = rahu.absolute_degree
        ketu_deg = ketu.absolute_degree

        # Collect absolute degrees of the 7 planets
        planet_degs = []
        for name in SEVEN_PLANETS:
            p = self._get_planet_by_name(chart, name)
            if not p:
                return []
            planet_degs.append(p.absolute_degree)

        # Check if all 7 planets are in the clockwise arc from Rahu to Ketu
        all_rahu_to_ketu = all(
            self._in_arc(rahu_deg, ketu_deg, d) for d in planet_degs
        )
        # Check if all 7 planets are in the clockwise arc from Ketu to Rahu
        all_ketu_to_rahu = all(
            self._in_arc(ketu_deg, rahu_deg, d) for d in planet_degs
        )

        if not all_rahu_to_ketu and not all_ketu_to_rahu:
            return []

        if all_ketu_to_rahu:
            variant = "Kala Amrita"
        else:
            variant = "Kala Sarpa"

        sub_name = KALA_SARPA_NAMES.get(rahu.house, "")
        full_name = f"{sub_name} {variant} Yoga" if sub_name else f"{variant} Yoga"

        return [
            Yoga(
                name=full_name,
                type=self.yoga_type,
                planets_involved=["Rahu", "Ketu"] + SEVEN_PLANETS,
                houses_involved=[rahu.house, ketu.house],
                description=(
                    f"All seven planets are on one side of the Rahu-Ketu axis, "
                    f"forming {full_name}. Rahu in house {rahu.house}, "
                    f"Ketu in house {ketu.house}. This indicates karmic patterns "
                    f"that require conscious effort to overcome."
                ),
                strength=80.0,
            )
        ]

    @staticmethod
    def _in_arc(start_deg: float, end_deg: float, point_deg: float) -> bool:
        """
        Check if point_deg lies in the clockwise arc from start_deg to end_deg.
        All values in [0, 360). The arc goes from start clockwise to end
        (i.e., increasing degrees, wrapping at 360).
        Points exactly on start or end are considered OUTSIDE the arc.
        """
        if start_deg < end_deg:
            return start_deg < point_deg < end_deg
        else:
            # Arc wraps around 0
            return point_deg > start_deg or point_deg < end_deg

    # ------------------------------------------------------------------
    # Daridra Yoga
    # ------------------------------------------------------------------
    def _detect_daridra(self, chart: LagnaChart) -> List[Yoga]:
        lord_11_name: Optional[str] = None
        for h in chart.houses:
            if h.house == 11:
                lord_11_name = h.lord
                break
        if not lord_11_name:
            return []

        lord_11 = self._get_planet_by_name(chart, lord_11_name)
        if not lord_11:
            return []

        if lord_11.house not in DUSTHANA_HOUSES:
            return []

        return [
            Yoga(
                name="Daridra Yoga",
                type=self.yoga_type,
                planets_involved=[lord_11_name],
                houses_involved=[11, lord_11.house],
                description=(
                    f"Lord of the 11th house ({lord_11_name}) is placed in the "
                    f"{lord_11.house}th house (dusthana), forming Daridra Yoga. "
                    f"This may cause difficulties in accumulating gains."
                ),
                strength=70.0,
            )
        ]

    # ------------------------------------------------------------------
    # Grahan Yoga
    # ------------------------------------------------------------------
    def _detect_grahan(self, chart: LagnaChart) -> List[Yoga]:
        rahu = self._get_planet_by_name(chart, "Rahu")
        ketu = self._get_planet_by_name(chart, "Ketu")
        yogas: List[Yoga] = []

        for luminary_name in ["Sun", "Moon"]:
            lum = self._get_planet_by_name(chart, luminary_name)
            if not lum:
                continue
            for node in [rahu, ketu]:
                if not node:
                    continue
                if lum.sign_index != node.sign_index:
                    continue

                angular_dist = abs(lum.degree - node.degree)
                if angular_dist < 5:
                    strength = 90.0
                elif angular_dist < 10:
                    strength = 70.0
                else:
                    strength = 50.0

                yogas.append(
                    Yoga(
                        name="Grahan Yoga",
                        type=self.yoga_type,
                        planets_involved=[luminary_name, node.planet],
                        houses_involved=[lum.house],
                        description=(
                            f"{luminary_name} and {node.planet} are conjunct in "
                            f"{lum.sign} ({angular_dist:.1f} degrees apart), "
                            f"forming Grahan Yoga. This eclipse combination may "
                            f"affect the significations of {luminary_name}."
                        ),
                        strength=strength,
                    )
                )
        return yogas

    # ------------------------------------------------------------------
    # Angarak Yoga
    # ------------------------------------------------------------------
    def _detect_angarak(self, chart: LagnaChart) -> List[Yoga]:
        mars = self._get_planet_by_name(chart, "Mars")
        rahu = self._get_planet_by_name(chart, "Rahu")
        if not mars or not rahu:
            return []

        if mars.sign_index != rahu.sign_index:
            return []

        angular_dist = abs(mars.degree - rahu.degree)
        strength = 80.0 if angular_dist < 5 else 60.0

        return [
            Yoga(
                name="Angarak Yoga",
                type=self.yoga_type,
                planets_involved=["Mars", "Rahu"],
                houses_involved=[mars.house],
                description=(
                    f"Mars and Rahu are conjunct in {mars.sign} "
                    f"({angular_dist:.1f} degrees apart), forming Angarak Yoga. "
                    f"This fiery combination may cause impulsiveness and conflicts."
                ),
                strength=strength,
            )
        ]
