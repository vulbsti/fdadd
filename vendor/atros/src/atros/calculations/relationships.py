"""
Planetary Relationship (Maitri) Calculations.

This module calculates relationships between planets:
- Natural (Naisargika) relationships - fixed based on planetary nature
- Temporary (Tatkaala) relationships - based on current positions
- Compound (Panchadha) relationships - combining natural and temporary

The five compound relationships (Panchadha Maitri):
1. Adhimitra (Best Friend) - Natural Friend + Temporary Friend
2. Mitra (Friend) - Natural Neutral + Temporary Friend
3. Sama (Neutral) - Natural Friend + Temporary Enemy OR Natural Enemy + Temporary Friend
4. Shatru (Enemy) - Natural Neutral + Temporary Enemy
5. Adhishatru (Bitter Enemy) - Natural Enemy + Temporary Enemy
"""

from typing import Dict, List, Tuple

from ..core.constants import NATURAL_ENEMIES, NATURAL_FRIENDS, NATURAL_NEUTRALS
from ..core.models import PlanetaryRelationship


def get_natural_relationship(planet1: str, planet2: str) -> str:
    """
    Get the natural (Naisargika) relationship between two planets.

    Natural relationships are fixed and don't change based on chart positions.

    Args:
        planet1: First planet name
        planet2: Second planet name

    Returns:
        "friend", "enemy", or "neutral"
    """
    # Same planet is always a friend to itself
    if planet1 == planet2:
        return "friend"

    # Check natural friends
    if planet1 in NATURAL_FRIENDS:
        if planet2 in NATURAL_FRIENDS[planet1]:
            return "friend"

    # Check natural enemies
    if planet1 in NATURAL_ENEMIES:
        if planet2 in NATURAL_ENEMIES[planet1]:
            return "enemy"

    # Check explicit neutrals
    if planet1 in NATURAL_NEUTRALS:
        if planet2 in NATURAL_NEUTRALS[planet1]:
            return "neutral"

    # Default to neutral
    return "neutral"


def get_temporary_relationship(planet1_sign: int, planet2_sign: int) -> str:
    """
    Calculate temporary (Tatkaala) relationship between two planets.

    Based on their current sign positions:
    - Planets in 2nd, 3rd, 4th, 10th, 11th, 12th from each other = Temporary Friends
    - Planets in 1st, 5th, 6th, 7th, 8th, 9th from each other = Temporary Enemies

    Args:
        planet1_sign: Sign index of first planet (0-11)
        planet2_sign: Sign index of second planet (0-11)

    Returns:
        "friend" or "enemy"
    """
    # Calculate house distance from planet1 to planet2
    # Houses are numbered 1-12, where planet1's position is house 1
    distance = ((planet2_sign - planet1_sign) % 12) + 1

    # Friendly positions: 2, 3, 4, 10, 11, 12
    friendly_houses = [2, 3, 4, 10, 11, 12]

    if distance in friendly_houses:
        return "friend"
    else:
        return "enemy"


def get_compound_relationship(
    planet1: str,
    planet2: str,
    planet1_sign: int,
    planet2_sign: int,
) -> str:
    """
    Calculate compound (Panchadha) relationship combining natural and temporary.

    The five levels of compound relationship:
    - Natural Friend + Temporary Friend = "best_friend" (Adhimitra)
    - Natural Neutral + Temporary Friend = "friend" (Mitra)
    - Natural Friend + Temporary Enemy = "neutral" (Sama)
    - Natural Enemy + Temporary Friend = "neutral" (Sama)
    - Natural Neutral + Temporary Enemy = "enemy" (Shatru)
    - Natural Enemy + Temporary Enemy = "bitter_enemy" (Adhishatru)

    Args:
        planet1: First planet name
        planet2: Second planet name
        planet1_sign: Sign index of first planet (0-11)
        planet2_sign: Sign index of second planet (0-11)

    Returns:
        One of: "best_friend", "friend", "neutral", "enemy", "bitter_enemy"
    """
    natural = get_natural_relationship(planet1, planet2)
    temporary = get_temporary_relationship(planet1_sign, planet2_sign)

    # Compound relationship matrix
    matrix = {
        ("friend", "friend"): "best_friend",
        ("friend", "enemy"): "neutral",
        ("neutral", "friend"): "friend",
        ("neutral", "enemy"): "enemy",
        ("enemy", "friend"): "neutral",
        ("enemy", "enemy"): "bitter_enemy",
    }

    return matrix.get((natural, temporary), "neutral")


def calculate_all_relationships(
    planet_positions: Dict[str, Dict],
) -> List[PlanetaryRelationship]:
    """
    Calculate relationships between all planet pairs.

    Args:
        planet_positions: Dict mapping planet names to their positions
            Each position should have a "sign_index" key

    Returns:
        List of PlanetaryRelationship objects
    """
    relationships = []
    planets = list(planet_positions.keys())

    for i, planet1 in enumerate(planets):
        for planet2 in planets[i + 1 :]:
            sign1 = planet_positions[planet1].get("sign_index", 0)
            sign2 = planet_positions[planet2].get("sign_index", 0)

            natural = get_natural_relationship(planet1, planet2)
            temporary = get_temporary_relationship(sign1, sign2)
            compound = get_compound_relationship(planet1, planet2, sign1, sign2)

            relationships.append(
                PlanetaryRelationship(
                    planet1=planet1,
                    planet2=planet2,
                    natural=natural,
                    temporary=temporary,
                    compound=compound,
                )
            )

    return relationships


def get_relationship_for_pair(
    planet1: str,
    planet2: str,
    planet_positions: Dict[str, Dict],
) -> Tuple[str, str, str]:
    """
    Get the complete relationship analysis for a specific planet pair.

    Args:
        planet1: First planet name
        planet2: Second planet name
        planet_positions: Dict of all planet positions

    Returns:
        Tuple of (natural, temporary, compound) relationships
    """
    sign1 = planet_positions.get(planet1, {}).get("sign_index", 0)
    sign2 = planet_positions.get(planet2, {}).get("sign_index", 0)

    natural = get_natural_relationship(planet1, planet2)
    temporary = get_temporary_relationship(sign1, sign2)
    compound = get_compound_relationship(planet1, planet2, sign1, sign2)

    return natural, temporary, compound


def format_relationship(relationship: str) -> str:
    """
    Format a relationship for display.

    Args:
        relationship: Relationship type

    Returns:
        Human-readable string
    """
    display_names = {
        "best_friend": "Best Friend (Adhimitra)",
        "friend": "Friend (Mitra)",
        "neutral": "Neutral (Sama)",
        "enemy": "Enemy (Shatru)",
        "bitter_enemy": "Bitter Enemy (Adhishatru)",
    }
    return display_names.get(relationship, relationship.title())
