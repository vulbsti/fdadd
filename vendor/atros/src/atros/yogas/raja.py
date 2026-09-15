"""
Raja Yoga Detection.

Raja Yogas are combinations that indicate power, authority, and success.
This module includes:
- Neecha Bhanga Raja Yoga (cancellation of debilitation)
- Basic Raja Yogas (Kendra-Trikona connections)
"""

from typing import List, Optional

from ..core.constants import DEBILITATION, EXALTATION, OWN_SIGNS, RASHI_LORDS, RASHI_NAMES
from ..core.models import LagnaChart, PlanetPosition, Yoga
from .base import YogaDetector


class NeechaBhangaRajaYogaDetector(YogaDetector):
    """
    Detector for Neecha Bhanga Raja Yoga.

    This yoga occurs when a debilitated planet's weakness is cancelled,
    turning the debilitation into strength.

    Conditions for cancellation:
    1. Debilitated planet is conjunct an exalted planet
    2. Dispositor (lord of the debilitation sign) is in Kendra from Lagna or Moon
    3. Lord of the exaltation sign is in Kendra from Lagna or Moon
    4. Debilitated planet is aspected by its dispositor
    5. Debilitated planet is retrograde
    6. Debilitated planet is exalted in Navamsa
    """

    @property
    def yoga_type(self) -> str:
        return "Raja"

    def detect(self, chart: LagnaChart) -> List[Yoga]:
        """
        Detect Neecha Bhanga Raja Yoga in the chart.

        Args:
            chart: LagnaChart with planetary positions

        Returns:
            List of detected Neecha Bhanga Raja Yogas
        """
        yogas = []

        for planet in chart.planets:
            if planet.dignity != "Debilitated":
                continue

            cancellation_reasons = []

            # Check condition 1: Conjunct with exalted planet
            exalted_conjunct = self._find_exalted_in_sign(chart, planet.sign_index)
            if exalted_conjunct:
                cancellation_reasons.append(
                    f"Conjunct with exalted {exalted_conjunct}"
                )

            # Check condition 2: Dispositor in Kendra
            dispositor = self._get_dispositor(planet.sign)
            if dispositor:
                dispositor_planet = self._get_planet_by_name(chart, dispositor)
                if dispositor_planet and self._is_in_kendra(dispositor_planet.house):
                    cancellation_reasons.append(
                        f"Dispositor {dispositor} is in Kendra "
                        f"(house {dispositor_planet.house})"
                    )

            # Check condition 3: Lord of exaltation sign in Kendra
            exaltation_lord = self._get_exaltation_sign_lord(planet.planet)
            if exaltation_lord:
                exalt_lord_planet = self._get_planet_by_name(chart, exaltation_lord)
                if exalt_lord_planet and self._is_in_kendra(exalt_lord_planet.house):
                    cancellation_reasons.append(
                        f"Exaltation sign lord {exaltation_lord} is in Kendra "
                        f"(house {exalt_lord_planet.house})"
                    )

            # Check condition 5: Retrograde
            if planet.retrograde:
                cancellation_reasons.append("Planet is retrograde")

            # Check condition 2 alternate: Dispositor strong (own sign or exalted)
            if dispositor:
                dispositor_planet = self._get_planet_by_name(chart, dispositor)
                if dispositor_planet and self._is_strong(dispositor_planet):
                    if f"Dispositor {dispositor}" not in str(cancellation_reasons):
                        cancellation_reasons.append(
                            f"Dispositor {dispositor} is {dispositor_planet.dignity} "
                            f"in {dispositor_planet.sign}"
                        )

            # Only form yoga if there are cancellation reasons
            if cancellation_reasons:
                # Strength based on number of cancellations
                strength = min(len(cancellation_reasons) * 25.0, 100.0)

                yogas.append(
                    Yoga(
                        name="Neecha Bhanga Raja Yoga",
                        type=self.yoga_type,
                        planets_involved=[planet.planet],
                        houses_involved=[planet.house],
                        description=(
                            f"{planet.planet}'s debilitation in {planet.sign} "
                            f"(house {planet.house}) is cancelled: "
                            f"{'; '.join(cancellation_reasons)}. "
                            f"This transforms weakness into strength."
                        ),
                        strength=strength,
                    )
                )

        return yogas

    def _find_exalted_in_sign(
        self, chart: LagnaChart, sign_index: int
    ) -> Optional[str]:
        """Find any exalted planet in the given sign."""
        for planet in chart.planets:
            if planet.sign_index == sign_index and planet.dignity == "Exalted":
                return planet.planet
        return None

    def _get_dispositor(self, sign: str) -> Optional[str]:
        """Get the ruling planet of a sign."""
        return RASHI_LORDS.get(sign)

    def _get_exaltation_sign_lord(self, planet: str) -> Optional[str]:
        """Get the lord of the planet's exaltation sign."""
        if planet in EXALTATION:
            exalt_sign = EXALTATION[planet]["sign"]
            return RASHI_LORDS.get(exalt_sign)
        return None


class BasicRajaYogaDetector(YogaDetector):
    """
    Detector for basic Raja Yogas.

    Raja Yoga forms when lords of Kendra houses (1,4,7,10) and
    Trikona houses (1,5,9) are connected through:
    - Conjunction (same sign)
    - Mutual aspect
    - Exchange of signs
    """

    @property
    def yoga_type(self) -> str:
        return "Raja"

    def detect(self, chart: LagnaChart) -> List[Yoga]:
        """
        Detect basic Raja Yogas formed by Kendra-Trikona connections.

        Args:
            chart: LagnaChart with planetary positions

        Returns:
            List of detected Raja Yogas
        """
        yogas = []

        # Get lords of Kendra and Trikona houses
        kendra_lords = self._get_house_lords(chart, [1, 4, 7, 10])
        trikona_lords = self._get_house_lords(chart, [1, 5, 9])

        # Check for conjunctions between Kendra and Trikona lords
        for k_house, k_lord in kendra_lords.items():
            for t_house, t_lord in trikona_lords.items():
                if k_house == t_house:
                    continue  # Skip same house (1st is both)

                if k_lord == t_lord:
                    continue  # Same planet lords both houses

                k_planet = self._get_planet_by_name(chart, k_lord)
                t_planet = self._get_planet_by_name(chart, t_lord)

                if not k_planet or not t_planet:
                    continue

                # Check conjunction
                if self._are_conjunct(k_planet, t_planet):
                    yogas.append(
                        Yoga(
                            name=f"Raja Yoga ({k_house}-{t_house} lords conjunction)",
                            type=self.yoga_type,
                            planets_involved=[k_lord, t_lord],
                            houses_involved=[k_house, t_house, k_planet.house],
                            description=(
                                f"{k_lord} (lord of house {k_house}) and "
                                f"{t_lord} (lord of house {t_house}) are conjunct "
                                f"in {k_planet.sign} (house {k_planet.house}), "
                                f"forming Raja Yoga. This indicates success, "
                                f"authority, and recognition."
                            ),
                            strength=70.0,
                        )
                    )

        return yogas

    def _get_house_lords(
        self, chart: LagnaChart, houses: List[int]
    ) -> dict:
        """Get the lords of specified houses."""
        house_lords = {}

        for h_info in chart.houses:
            if h_info.house in houses:
                house_lords[h_info.house] = h_info.lord

        return house_lords
