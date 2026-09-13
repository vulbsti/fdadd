"""
Mahapurusha Yoga Detection.

The five Mahapurusha (Great Person) Yogas occur when specific planets
are in their own sign or exaltation AND in a Kendra house (1, 4, 7, 10).

The five Mahapurusha Yogas:
1. Ruchaka Yoga - Mars in own/exalted sign in Kendra
2. Bhadra Yoga - Mercury in own/exalted sign in Kendra
3. Hamsa Yoga - Jupiter in own/exalted sign in Kendra
4. Malavya Yoga - Venus in own/exalted sign in Kendra
5. Shasha Yoga - Saturn in own/exalted sign in Kendra

Sun and Moon don't form Mahapurusha Yogas.
"""

from typing import Dict, List

from ..core.models import LagnaChart, Yoga
from .base import YogaDetector


class MahapurushaYogaDetector(YogaDetector):
    """
    Detector for the five Mahapurusha Yogas.

    These yogas indicate greatness in specific areas of life
    based on which planet forms the yoga.
    """

    # Planet -> (Yoga name, Description)
    YOGA_INFO: Dict[str, tuple] = {
        "Mars": (
            "Ruchaka",
            "Gives strong physique, leadership qualities, courage, military success, "
            "and authority. The native may excel in sports, military, or police.",
        ),
        "Mercury": (
            "Bhadra",
            "Gives intelligence, communication skills, business acumen, and success "
            "in intellectual pursuits. The native may excel in writing, commerce, or teaching.",
        ),
        "Jupiter": (
            "Hamsa",
            "Gives wisdom, spirituality, righteousness, and respect in society. "
            "The native may be learned, religious, and honored by authorities.",
        ),
        "Venus": (
            "Malavya",
            "Gives beauty, luxury, artistic talents, and enjoyment of material pleasures. "
            "The native may excel in arts, entertainment, or diplomacy.",
        ),
        "Saturn": (
            "Shasha",
            "Gives authority, command over people, political success, and wealth "
            "from hard work. The native may rise to high positions through discipline.",
        ),
    }

    @property
    def yoga_type(self) -> str:
        return "Mahapurusha"

    def detect(self, chart: LagnaChart) -> List[Yoga]:
        """
        Detect Mahapurusha Yogas in the chart.

        Conditions:
        1. Planet must be Mars, Mercury, Jupiter, Venus, or Saturn
        2. Planet must be in own sign or exalted
        3. Planet must be in a Kendra house (1, 4, 7, 10)

        Args:
            chart: LagnaChart with planetary positions

        Returns:
            List of detected Mahapurusha Yogas
        """
        yogas = []

        for planet_name in self.YOGA_INFO.keys():
            planet = self._get_planet_by_name(chart, planet_name)
            if not planet:
                continue

            # Check if in strong dignity (own sign or exalted)
            is_strong = planet.dignity in ["Exalted", "Own Sign"]

            # Check if in Kendra
            in_kendra = self._is_in_kendra(planet.house)

            if is_strong and in_kendra:
                yoga_name, description = self.YOGA_INFO[planet_name]

                # Determine strength based on exact position
                strength = 100.0 if planet.dignity == "Exalted" else 80.0

                yogas.append(
                    Yoga(
                        name=f"{yoga_name} Mahapurusha Yoga",
                        type=self.yoga_type,
                        planets_involved=[planet_name],
                        houses_involved=[planet.house],
                        description=(
                            f"{planet_name} is {planet.dignity} in {planet.sign} "
                            f"in the {self._ordinal(planet.house)} house (Kendra), "
                            f"forming {yoga_name} Yoga. {description}"
                        ),
                        strength=strength,
                    )
                )

        return yogas

    def _ordinal(self, n: int) -> str:
        """Convert number to ordinal string (1st, 2nd, 3rd, etc.)."""
        suffix = ["th", "st", "nd", "rd", "th"][min(n % 10, 4)]
        if 11 <= (n % 100) <= 13:
            suffix = "th"
        return f"{n}{suffix}"
