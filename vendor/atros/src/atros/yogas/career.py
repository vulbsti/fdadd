"""
Career Yoga Detection.

Yogas related to career, intellect, and professional success. This module detects:
1. Budhaditya Yoga - Sun-Mercury combination
2. Amala Yoga - Only benefics in the 10th house
3. Parivartana Yoga - Mutual exchange of house lords
4. Saraswati Yoga - Jupiter, Venus, Mercury in specific houses
"""

from typing import List

from ..core.constants import KENDRA_HOUSES, RASHI_LORDS, RASHI_NAMES, TRIKONA_HOUSES
from ..core.models import LagnaChart, PlanetPosition, Yoga
from .base import YogaDetector

BENEFICS = {"Jupiter", "Venus", "Mercury"}
MALEFICS = {"Sun", "Mars", "Saturn", "Rahu", "Ketu"}


class CareerYogaDetector(YogaDetector):
    """Detector for career and intellectual yogas."""

    @property
    def yoga_type(self) -> str:
        return "Career"

    def detect(self, chart: LagnaChart) -> List[Yoga]:
        yogas: List[Yoga] = []
        yogas.extend(self._detect_budhaditya(chart))
        yogas.extend(self._detect_amala(chart))
        yogas.extend(self._detect_parivartana(chart))
        yogas.extend(self._detect_saraswati(chart))
        return yogas

    # ------------------------------------------------------------------
    # Budhaditya Yoga
    # ------------------------------------------------------------------
    def _detect_budhaditya(self, chart: LagnaChart) -> List[Yoga]:
        sun = self._get_planet_by_name(chart, "Sun")
        mercury = self._get_planet_by_name(chart, "Mercury")
        if not sun or not mercury:
            return []

        if sun.sign_index != mercury.sign_index:
            return []

        # Angular separation
        separation = abs(sun.degree - mercury.degree)

        # Combust threshold depends on retrograde status
        combust_limit = 12.0 if mercury.retrograde else 14.0
        if separation < combust_limit:
            # Apply graduated strength
            if separation > 10:
                strength = 80.0
            elif separation > 7:
                strength = 65.0
            elif separation > 4:
                strength = 50.0
            else:
                # Truly combust, no yoga
                return []
        else:
            # Well separated
            if separation > 10:
                strength = 80.0
            elif separation > 7:
                strength = 65.0
            else:
                strength = 50.0

        return [
            Yoga(
                name="Budhaditya Yoga",
                type=self.yoga_type,
                planets_involved=["Sun", "Mercury"],
                houses_involved=[sun.house],
                description=(
                    f"Sun and Mercury conjunct in {sun.sign} (house {sun.house}) "
                    f"with {separation:.1f} degrees separation, forming Budhaditya Yoga. "
                    f"This gives sharp intellect, communication skills, and success "
                    f"in education."
                ),
                strength=strength,
            )
        ]

    # ------------------------------------------------------------------
    # Amala Yoga
    # ------------------------------------------------------------------
    def _detect_amala(self, chart: LagnaChart) -> List[Yoga]:
        planets_in_10 = self._get_planets_in_house(chart, 10)

        if not planets_in_10:
            return []

        planet_names = {p.planet for p in planets_in_10}

        # All must be benefics, no malefics
        if not planet_names.issubset(BENEFICS):
            return []

        return [
            Yoga(
                name="Amala Yoga",
                type=self.yoga_type,
                planets_involved=sorted(planet_names),
                houses_involved=[10],
                description=(
                    f"Only benefics ({', '.join(sorted(planet_names))}) occupy the "
                    f"10th house, forming Amala Yoga. This gives a virtuous career, "
                    f"good reputation, and lasting fame."
                ),
                strength=85.0,
            )
        ]

    # ------------------------------------------------------------------
    # Parivartana Yoga
    # ------------------------------------------------------------------
    def _detect_parivartana(self, chart: LagnaChart) -> List[Yoga]:
        yogas: List[Yoga] = []

        # Build mapping: house_number -> lord_name
        house_lords = {}
        for h in chart.houses:
            house_lords[h.house] = h.lord

        # Build mapping: planet_name -> house it occupies
        planet_houses = {}
        for p in chart.planets:
            planet_houses[p.planet] = p.house

        checked = set()
        for house_a in range(1, 13):
            lord_a = house_lords.get(house_a)
            if not lord_a or lord_a not in planet_houses:
                continue
            actual_house_a = planet_houses[lord_a]

            for house_b in range(house_a + 1, 13):
                if (house_a, house_b) in checked:
                    continue
                checked.add((house_a, house_b))

                lord_b = house_lords.get(house_b)
                if not lord_b or lord_b not in planet_houses:
                    continue
                actual_house_b = planet_houses[lord_b]

                # Exchange: lord of A sits in B, lord of B sits in A
                if actual_house_a == house_b and actual_house_b == house_a:
                    dainya_houses = {6, 8, 12}
                    khala_set = {3}

                    if {house_a, house_b} & dainya_houses:
                        sub_type = "Dainya"
                        strength = 40.0
                    elif {house_a, house_b} & khala_set:
                        sub_type = "Khala"
                        strength = 55.0
                    else:
                        sub_type = "Maha"
                        strength = 85.0

                    yogas.append(
                        Yoga(
                            name=f"{sub_type} Parivartana Yoga",
                            type=self.yoga_type,
                            planets_involved=[lord_a, lord_b],
                            houses_involved=[house_a, house_b],
                            description=(
                                f"{lord_a} (lord of house {house_a}) is in house {house_b} "
                                f"and {lord_b} (lord of house {house_b}) is in house {house_a}, "
                                f"forming {sub_type} Parivartana Yoga. "
                                + (
                                    "This powerful exchange elevates both houses."
                                    if sub_type == "Maha"
                                    else (
                                        "This exchange involves a dusthana, indicating challenges."
                                        if sub_type == "Dainya"
                                        else "This exchange involves the 3rd house of effort."
                                    )
                                )
                            ),
                            strength=strength,
                        )
                    )
        return yogas

    # ------------------------------------------------------------------
    # Saraswati Yoga
    # ------------------------------------------------------------------
    def _detect_saraswati(self, chart: LagnaChart) -> List[Yoga]:
        favorable = {1, 2, 4, 5, 7, 9, 10}

        jupiter = self._get_planet_by_name(chart, "Jupiter")
        venus = self._get_planet_by_name(chart, "Venus")
        mercury = self._get_planet_by_name(chart, "Mercury")

        if not jupiter or not venus or not mercury:
            return []

        # All three must be in favorable houses
        if not all(p.house in favorable for p in [jupiter, venus, mercury]):
            return []

        # Jupiter must be in own/exalted/friend sign and not combust
        strong_dignities = {"Own Sign", "Exalted", "Friend"}
        if jupiter.dignity not in strong_dignities:
            return []

        return [
            Yoga(
                name="Saraswati Yoga",
                type=self.yoga_type,
                planets_involved=["Jupiter", "Venus", "Mercury"],
                houses_involved=[jupiter.house, venus.house, mercury.house],
                description=(
                    f"Jupiter ({jupiter.sign}, house {jupiter.house}), "
                    f"Venus ({venus.sign}, house {venus.house}), and "
                    f"Mercury ({mercury.sign}, house {mercury.house}) are all in "
                    f"favorable houses, forming Saraswati Yoga. "
                    f"This bestows learning, wisdom, and mastery of arts."
                ),
                strength=80.0,
            )
        ]
