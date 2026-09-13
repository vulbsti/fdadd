"""
Dhana (Wealth) Yoga Detection.

Dhana Yogas are planetary combinations that indicate wealth, prosperity,
and material abundance. This module detects:
1. Gajakesari Yoga - Jupiter in Kendra from Moon
2. Chandra-Mangal Yoga - Moon and Mars conjunction
3. Lakshmi Yoga - 9th lord strong in Kendra
4. Dhana Yoga - Lords of 2nd and 11th conjunct in Kendra/Trikona
"""

from typing import List

from ..core.constants import KENDRA_HOUSES, RASHI_LORDS, RASHI_NAMES, TRIKONA_HOUSES
from ..core.models import LagnaChart, Yoga
from .base import YogaDetector


class DhanaYogaDetector(YogaDetector):
    """Detector for Dhana (wealth) Yogas."""

    @property
    def yoga_type(self) -> str:
        return "Dhana"

    def detect(self, chart: LagnaChart) -> List[Yoga]:
        yogas: List[Yoga] = []
        yogas.extend(self._detect_gajakesari(chart))
        yogas.extend(self._detect_chandra_mangal(chart))
        yogas.extend(self._detect_lakshmi(chart))
        yogas.extend(self._detect_dhana(chart))
        return yogas

    # ------------------------------------------------------------------
    # Gajakesari Yoga
    # ------------------------------------------------------------------
    def _detect_gajakesari(self, chart: LagnaChart) -> List[Yoga]:
        jupiter = self._get_planet_by_name(chart, "Jupiter")
        moon = self._get_planet_by_name(chart, "Moon")
        if not jupiter or not moon:
            return []

        # Jupiter must not be debilitated or combust
        if jupiter.dignity == "Debilitated":
            return []

        # Sign distance: 1-based count from Moon's sign to Jupiter's sign
        sign_distance = ((jupiter.sign_index - moon.sign_index) % 12) + 1
        if sign_distance not in (1, 4, 7, 10):
            return []

        # Strength
        if jupiter.dignity == "Exalted":
            strength = 90.0
        elif jupiter.dignity == "Own Sign":
            strength = 75.0
        else:
            strength = 60.0

        return [
            Yoga(
                name="Gajakesari Yoga",
                type=self.yoga_type,
                planets_involved=["Jupiter", "Moon"],
                houses_involved=[jupiter.house, moon.house],
                description=(
                    f"Jupiter in {jupiter.sign} is in a Kendra (sign distance {sign_distance}) "
                    f"from Moon in {moon.sign}, forming Gajakesari Yoga. "
                    f"This bestows wisdom, wealth, and fame."
                ),
                strength=strength,
            )
        ]

    # ------------------------------------------------------------------
    # Chandra-Mangal Yoga
    # ------------------------------------------------------------------
    def _detect_chandra_mangal(self, chart: LagnaChart) -> List[Yoga]:
        moon = self._get_planet_by_name(chart, "Moon")
        mars = self._get_planet_by_name(chart, "Mars")
        if not moon or not mars:
            return []

        if moon.sign_index != mars.sign_index:
            return []

        strength = 80.0 if self._is_in_kendra(moon.house) else 60.0

        return [
            Yoga(
                name="Chandra-Mangal Yoga",
                type=self.yoga_type,
                planets_involved=["Moon", "Mars"],
                houses_involved=[moon.house],
                description=(
                    f"Moon and Mars are conjunct in {moon.sign} (house {moon.house}), "
                    f"forming Chandra-Mangal Yoga. This gives wealth through "
                    f"enterprise and courage."
                ),
                strength=strength,
            )
        ]

    # ------------------------------------------------------------------
    # Lakshmi Yoga
    # ------------------------------------------------------------------
    def _detect_lakshmi(self, chart: LagnaChart) -> List[Yoga]:
        # Find the 9th house
        ninth_house = None
        for h in chart.houses:
            if h.house == 9:
                ninth_house = h
                break
        if not ninth_house:
            return []

        lord_of_9th_name = ninth_house.lord
        lord_of_9th = self._get_planet_by_name(chart, lord_of_9th_name)
        if not lord_of_9th:
            return []

        # Lord of 9th must be in own or exalted sign AND in Kendra
        if lord_of_9th.dignity not in ("Own Sign", "Exalted"):
            return []
        if not self._is_in_kendra(lord_of_9th.house):
            return []

        # Lagna lord must not be debilitated
        lagna_lord_name = chart.ascendant.lord
        lagna_lord = self._get_planet_by_name(chart, lagna_lord_name)
        if not lagna_lord:
            return []
        if lagna_lord.dignity == "Debilitated":
            return []

        strength = 90.0 if lord_of_9th.dignity == "Exalted" else 75.0

        return [
            Yoga(
                name="Lakshmi Yoga",
                type=self.yoga_type,
                planets_involved=[lord_of_9th_name, lagna_lord_name],
                houses_involved=[9, lord_of_9th.house],
                description=(
                    f"Lord of 9th house ({lord_of_9th_name}) is {lord_of_9th.dignity} "
                    f"in {lord_of_9th.sign} in Kendra (house {lord_of_9th.house}), "
                    f"and lagna lord ({lagna_lord_name}) is strong. "
                    f"Lakshmi Yoga bestows great fortune and prosperity."
                ),
                strength=strength,
            )
        ]

    # ------------------------------------------------------------------
    # Dhana Yoga (lords of 2nd and 11th conjunct in Kendra/Trikona)
    # ------------------------------------------------------------------
    def _detect_dhana(self, chart: LagnaChart) -> List[Yoga]:
        lord_2_name = None
        lord_11_name = None
        for h in chart.houses:
            if h.house == 2:
                lord_2_name = h.lord
            elif h.house == 11:
                lord_11_name = h.lord

        if not lord_2_name or not lord_11_name:
            return []
        if lord_2_name == lord_11_name:
            return []

        lord_2 = self._get_planet_by_name(chart, lord_2_name)
        lord_11 = self._get_planet_by_name(chart, lord_11_name)
        if not lord_2 or not lord_11:
            return []

        if not self._are_conjunct(lord_2, lord_11):
            return []

        if not (self._is_in_kendra(lord_2.house) or self._is_in_trikona(lord_2.house)):
            return []

        return [
            Yoga(
                name="Dhana Yoga",
                type=self.yoga_type,
                planets_involved=[lord_2_name, lord_11_name],
                houses_involved=[2, 11, lord_2.house],
                description=(
                    f"Lords of 2nd ({lord_2_name}) and 11th ({lord_11_name}) houses "
                    f"are conjunct in {lord_2.sign} (house {lord_2.house}), "
                    f"forming Dhana Yoga. This indicates accumulation of wealth."
                ),
                strength=70.0,
            )
        ]
