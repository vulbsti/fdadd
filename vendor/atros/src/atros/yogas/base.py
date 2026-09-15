"""
Base classes for Yoga detection.

Yogas are planetary combinations that produce specific results.
This module provides the abstract base class and common utilities
for yoga detection.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional

from ..core.constants import KENDRA_HOUSES, TRIKONA_HOUSES
from ..core.models import LagnaChart, PlanetPosition, Yoga


class YogaDetector(ABC):
    """Abstract base class for yoga detection."""

    @abstractmethod
    def detect(self, chart: LagnaChart) -> List[Yoga]:
        """
        Detect yogas in the given chart.

        Args:
            chart: LagnaChart with all planetary positions

        Returns:
            List of detected Yoga objects
        """
        pass

    @property
    @abstractmethod
    def yoga_type(self) -> str:
        """Return the type of yoga this detector finds."""
        pass

    def _get_planet_by_name(
        self, chart: LagnaChart, name: str
    ) -> Optional[PlanetPosition]:
        """
        Helper to find a planet in the chart by name.

        Args:
            chart: LagnaChart object
            name: Planet name to find

        Returns:
            PlanetPosition or None if not found
        """
        for planet in chart.planets:
            if planet.planet == name:
                return planet
        return None

    def _get_planets_in_house(
        self, chart: LagnaChart, house: int
    ) -> List[PlanetPosition]:
        """
        Get all planets in a specific house.

        Args:
            chart: LagnaChart object
            house: House number (1-12)

        Returns:
            List of PlanetPosition objects in that house
        """
        return [p for p in chart.planets if p.house == house]

    def _get_planets_in_sign(
        self, chart: LagnaChart, sign_index: int
    ) -> List[PlanetPosition]:
        """
        Get all planets in a specific sign.

        Args:
            chart: LagnaChart object
            sign_index: Sign index (0-11)

        Returns:
            List of PlanetPosition objects in that sign
        """
        return [p for p in chart.planets if p.sign_index == sign_index]

    def _is_in_kendra(self, house: int) -> bool:
        """
        Check if house is a Kendra (angular house: 1, 4, 7, 10).

        Args:
            house: House number (1-12)

        Returns:
            True if house is a Kendra
        """
        return house in KENDRA_HOUSES

    def _is_in_trikona(self, house: int) -> bool:
        """
        Check if house is a Trikona (trinal house: 1, 5, 9).

        Args:
            house: House number (1-12)

        Returns:
            True if house is a Trikona
        """
        return house in TRIKONA_HOUSES

    def _is_strong(self, planet: PlanetPosition) -> bool:
        """
        Check if a planet is in a strong dignity.

        Strong dignities: Exalted, Own Sign, Moolatrikona

        Args:
            planet: PlanetPosition object

        Returns:
            True if planet is strong
        """
        strong_dignities = ["Exalted", "Own Sign", "Moolatrikona"]
        return planet.dignity in strong_dignities

    def _is_weak(self, planet: PlanetPosition) -> bool:
        """
        Check if a planet is in a weak dignity.

        Weak dignities: Debilitated, Enemy

        Args:
            planet: PlanetPosition object

        Returns:
            True if planet is weak
        """
        weak_dignities = ["Debilitated", "Enemy"]
        return planet.dignity in weak_dignities

    def _are_conjunct(self, planet1: PlanetPosition, planet2: PlanetPosition) -> bool:
        """
        Check if two planets are conjunct (same sign).

        Args:
            planet1: First planet
            planet2: Second planet

        Returns:
            True if planets are in the same sign
        """
        return planet1.sign_index == planet2.sign_index

    def _get_house_distance(self, from_house: int, to_house: int) -> int:
        """
        Calculate the distance between two houses.

        Args:
            from_house: Starting house (1-12)
            to_house: Target house (1-12)

        Returns:
            House distance (1-12)
        """
        return ((to_house - from_house) % 12) + 1
