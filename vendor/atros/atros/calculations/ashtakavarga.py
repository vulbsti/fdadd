"""Ashtakavarga calculation module.

Implements Bhinnashtakavarga (BAV), Sarvashtakavarga (SAV),
Trikona Shodhana, and Ekadhipatya Shodhana per BPHS Chapter 66.
"""

from typing import Dict, List, Set

from atros.core.constants import (
    ASHTAKAVARGA_BINDU_TABLES,
    LORDSHIP_PAIRS,
    TRIKONA_GROUPS,
)
from atros.core.models import AshtakavargaChart

PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]
CONTRIBUTORS = PLANETS + ["Lagna"]


def compute_bav(planet: str, natal_positions: Dict[str, int]) -> List[int]:
    """Compute Bhinnashtakavarga for one planet.

    natal_positions maps contributor name (7 planets + "Lagna") to sign index (0-11).
    For each contributor, for each house in ASHTAKAVARGA_BINDU_TABLES[planet][contributor],
    target_sign = (contributor_sign + house - 1) % 12, increment grid[target_sign].
    Returns list of 12 ints (0-8 each).
    """
    grid = [0] * 12
    table = ASHTAKAVARGA_BINDU_TABLES[planet]
    for contributor in CONTRIBUTORS:
        contributor_sign = natal_positions[contributor]
        for house in table[contributor]:
            target_sign = (contributor_sign + house - 1) % 12
            grid[target_sign] += 1
    return grid


def compute_all_bav(natal_positions: Dict[str, int]) -> Dict[str, List[int]]:
    """Compute BAV for all 7 planets. Returns dict mapping planet name to 12-int list."""
    return {planet: compute_bav(planet, natal_positions) for planet in PLANETS}


def compute_sav(bav: Dict[str, List[int]]) -> List[int]:
    """Sum all 7 BAV grids. Returns 12 ints totaling 337."""
    sav = [0] * 12
    for planet in PLANETS:
        for i in range(12):
            sav[i] += bav[planet][i]
    return sav


def trikona_shodhana(bav: List[int]) -> List[int]:
    """Reduce BAV by trikona groups.

    For each group of 3 signs sharing an element,
    if any has 0 -> skip. Otherwise subtract minimum from all three.
    """
    result = list(bav)
    for group in TRIKONA_GROUPS:
        values = [result[s] for s in group]
        if any(v == 0 for v in values):
            continue
        min_val = min(values)
        for s in group:
            result[s] -= min_val
    return result


def ekadhipatya_shodhana(bav: List[int], occupied_signs: Set[int]) -> List[int]:
    """Reduce BAV by lordship pairs.

    For each pair (sign_a, sign_b):
    - Both 0: skip
    - Either 0: skip
    - Both occupied: no reduction
    - Both unoccupied, same value: both -> 0
    - Both unoccupied, different: both -> smaller value
    - One occupied, one not: unoccupied -> 0
    """
    result = list(bav)
    for sign_a, sign_b in LORDSHIP_PAIRS:
        val_a = result[sign_a]
        val_b = result[sign_b]

        # Both 0 or either 0: skip
        if val_a == 0 or val_b == 0:
            continue

        a_occ = sign_a in occupied_signs
        b_occ = sign_b in occupied_signs

        if a_occ and b_occ:
            # Both occupied: no reduction
            continue
        elif not a_occ and not b_occ:
            # Both unoccupied
            if val_a == val_b:
                result[sign_a] = 0
                result[sign_b] = 0
            else:
                smaller = min(val_a, val_b)
                result[sign_a] = smaller
                result[sign_b] = smaller
        else:
            # One occupied, one not: unoccupied -> 0
            if a_occ and not b_occ:
                result[sign_b] = 0
            else:
                result[sign_a] = 0
    return result


def calculate_ashtakavarga(
    planet_positions: Dict[str, Dict],
    ascendant_sign_index: int,
) -> AshtakavargaChart:
    """Main entry point for Ashtakavarga calculation.

    planet_positions maps planet name to dict with at least 'sign_index'.
    ascendant_sign_index is the Lagna sign (0-11).
    Build natal_positions dict (7 planets + Lagna), compute all BAV, compute SAV.
    Returns AshtakavargaChart.
    """
    natal_positions: Dict[str, int] = {}
    for planet in PLANETS:
        natal_positions[planet] = planet_positions[planet]["sign_index"]
    natal_positions["Lagna"] = ascendant_sign_index

    bav = compute_all_bav(natal_positions)
    sav = compute_sav(bav)

    return AshtakavargaChart(bav=bav, sav=sav)
