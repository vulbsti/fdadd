"""
Special Yoga Detection.

This module detects:
1. Viparita Raja Yoga - Dusthana lord in another dusthana house
   Sub-types: Harsha, Sarala, Vimala
"""

from typing import List

from ..core.constants import RASHI_NAMES
from ..core.models import LagnaChart, Yoga
from .base import YogaDetector


class ViparitaRajaYogaDetector(YogaDetector):
    """Detector for Viparita Raja Yoga (dusthana lord in dusthana)."""

    @property
    def yoga_type(self) -> str:
        return "Viparita Raja"

    # (source_house, target_houses, sub_type_name)
    _COMBINATIONS = [
        (6, [8, 12], "Harsha"),
        (8, [6, 12], "Sarala"),
        (12, [6, 8], "Vimala"),
    ]

    # Houses whose lordship cancels the yoga (dual lordship check)
    _CANCELLING_HOUSES = {1, 5, 9}

    def detect(self, chart: LagnaChart) -> List[Yoga]:
        yogas: List[Yoga] = []

        # Build house -> lord mapping
        house_lords = {}
        for h in chart.houses:
            house_lords[h.house] = h.lord

        # Build lord -> list of houses it rules (for dual lordship check)
        lord_houses: dict = {}
        for h_num, lord_name in house_lords.items():
            lord_houses.setdefault(lord_name, []).append(h_num)

        for source_house, targets, sub_type in self._COMBINATIONS:
            lord_name = house_lords.get(source_house)
            if not lord_name:
                continue

            lord_planet = self._get_planet_by_name(chart, lord_name)
            if not lord_planet:
                continue

            if lord_planet.house not in targets:
                continue

            # Check cancellation: does this lord also rule 1st, 5th, or 9th?
            other_houses = lord_houses.get(lord_name, [])
            has_dual = any(
                h in self._CANCELLING_HOUSES
                for h in other_houses
                if h != source_house
            )

            if has_dual:
                strength = 40.0
                cancel_note = (
                    f" However, {lord_name} also rules house "
                    f"{', '.join(str(h) for h in other_houses if h != source_house and h in self._CANCELLING_HOUSES)}, "
                    f"partially cancelling the yoga due to dual lordship."
                )
            else:
                strength = 75.0
                cancel_note = ""

            yogas.append(
                Yoga(
                    name=f"Viparita Raja Yoga ({sub_type})",
                    type=self.yoga_type,
                    planets_involved=[lord_name],
                    houses_involved=[source_house, lord_planet.house],
                    description=(
                        f"Lord of the {source_house}th house ({lord_name}) is placed "
                        f"in the {lord_planet.house}th house (another dusthana), "
                        f"forming {sub_type} Viparita Raja Yoga. "
                        f"This turns adversity into unexpected gains and protection."
                        f"{cancel_note}"
                    ),
                    strength=strength,
                )
            )

        return yogas
