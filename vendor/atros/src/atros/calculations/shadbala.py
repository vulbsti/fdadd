"""
Shadbala (Six-Fold Planetary Strength) Calculations.

Shadbala is the comprehensive strength assessment system from BPHS Chapter 27.
It combines six types of strength to determine a planet's overall power:

1. Sthana Bala (Positional) - Uccha, Saptavargaja, Ojhayugma, Kendradi, Drekkana
2. Dig Bala (Directional) - Strength based on angular house position
3. Kaala Bala (Temporal) - Based on day/night, paksha, weekday, etc.
4. Cheshta Bala (Motional) - Based on planetary speed/retrograde
5. Naisargika Bala (Natural) - Fixed innate strength
6. Drig Bala (Aspectual) - Net aspect strength from benefics minus malefics

All values are in Virupas (60 Virupas = 1 Rupa).
Only the 7 classical planets (Sun through Saturn) are evaluated.
"""

from typing import Dict, List, Optional

from ..core.constants import (
    DIG_BALA_STRONGEST,
    EXALTATION,
    DEBILITATION,
    KENDRA_HOUSES,
    NAISARGIKA_BALA,
    OWN_SIGNS,
    PLANET_GENDER,
    RASHI_LORDS,
    RASHI_NAMES,
    SHADBALA_MINIMUM_RUPAS,
)
from ..core.models import LagnaChart, PlanetPosition, ShadBala


SHADBALA_PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]

PANAPARA_HOUSES = [2, 5, 8, 11]
APOKLIMA_HOUSES = [3, 6, 9, 12]


# =============================================================================
# STHANA BALA (Positional Strength)
# =============================================================================


def _uccha_bala(planet_name: str, absolute_degree: float) -> float:
    """
    Uccha Bala (Exaltation Strength). Range: 0-60 Virupas.

    Measures distance from debilitation point. At exact exaltation = 60,
    at exact debilitation = 0.

    Formula: distance_from_debilitation / 3, capped at 60.
    """
    if planet_name not in EXALTATION:
        return 0.0

    debil = DEBILITATION[planet_name]
    debil_abs = debil["sign_index"] * 30 + debil["degree"]

    distance = abs(absolute_degree - debil_abs)
    if distance > 180:
        distance = 360 - distance

    return min(distance / 3.0, 60.0)


def _kendradi_bala(house: int) -> float:
    """
    Kendradi Bala (Angular House Strength). Range: 15-60 Virupas.

    Kendra (1,4,7,10) = 60, Panapara (2,5,8,11) = 30, Apoklima (3,6,9,12) = 15.
    """
    if house in KENDRA_HOUSES:
        return 60.0
    elif house in PANAPARA_HOUSES:
        return 30.0
    else:
        return 15.0


def _drekkana_bala(planet_name: str, degree: float) -> float:
    """
    Drekkana Bala (Decanate Strength). 0 or 15 Virupas.

    Male planets (Sun, Mars, Jupiter) strong in 1st decanate (0-10).
    Female planets (Moon, Venus) strong in 2nd decanate (10-20).
    Neutral planets (Mercury, Saturn) strong in 3rd decanate (20-30).
    """
    gender = PLANET_GENDER.get(planet_name)
    if gender is None:
        return 0.0

    if gender == "male" and degree < 10:
        return 15.0
    elif gender == "female" and 10 <= degree < 20:
        return 15.0
    elif gender == "neutral" and degree >= 20:
        return 15.0

    return 0.0


def _ojhayugma_bala(planet_name: str, sign_index: int, navamsa_sign_index: int) -> float:
    """
    Ojhayugma Bala (Odd/Even Sign Strength). Range: 0-30 Virupas.

    Moon and Venus get 15 Virupas in even signs, others in odd signs.
    Applied separately to Rashi and Navamsa (max 15 each = 30 total).
    """
    is_female = planet_name in ("Moon", "Venus")
    score = 0.0

    # Rashi check (even sign indices: 1,3,5,7,9,11)
    rashi_even = (sign_index % 2 == 1)
    if is_female and rashi_even:
        score += 15.0
    elif not is_female and not rashi_even:
        score += 15.0

    # Navamsa check
    nav_even = (navamsa_sign_index % 2 == 1)
    if is_female and nav_even:
        score += 15.0
    elif not is_female and not nav_even:
        score += 15.0

    return score


def _saptavargaja_bala_simple(planet_name: str, dignity: Optional[str]) -> float:
    """
    Simplified Saptavargaja Bala using D1 dignity only.

    Full Saptavargaja evaluates across 7 vargas (D1, D2, D3, D7, D9, D12, D30).
    This simplified version uses the D1 dignity as a proxy, scaled to a reasonable range.

    Point values per BPHS: Moolatrikona=45, Own=30, Great Friend=22.5,
    Friend=15, Neutral=7.5, Enemy=3.75, Great Enemy=1.875.
    """
    dignity_scores = {
        "Exalted": 30.0,
        "Moolatrikona": 45.0,
        "Own Sign": 30.0,
        "Friend": 15.0,
        "Neutral": 7.5,
        "Enemy": 3.75,
        "Debilitated": 1.875,
    }
    return dignity_scores.get(dignity, 7.5)


def calculate_sthana_bala(
    planet: PlanetPosition,
    navamsa_sign_index: int = 0,
) -> float:
    """
    Calculate total Sthana Bala (Positional Strength).

    Sum of: Uccha + Saptavargaja + Ojhayugma + Kendradi + Drekkana.
    """
    uccha = _uccha_bala(planet.planet, planet.absolute_degree)
    saptavargaja = _saptavargaja_bala_simple(planet.planet, planet.dignity)
    ojhayugma = _ojhayugma_bala(planet.planet, planet.sign_index, navamsa_sign_index)
    kendradi = _kendradi_bala(planet.house)
    drekkana = _drekkana_bala(planet.planet, planet.degree)

    return uccha + saptavargaja + ojhayugma + kendradi + drekkana


# =============================================================================
# DIG BALA (Directional Strength)
# =============================================================================


def calculate_dig_bala(planet_name: str, planet_house: int) -> float:
    """
    Dig Bala (Directional Strength). Range: 0-60 Virupas.

    Each planet is strongest at a specific cardinal point:
    - Jupiter/Mercury: 1st house (East/Lagna)
    - Sun/Mars: 10th house (South/MC)
    - Saturn: 7th house (West/Descendant)
    - Moon/Venus: 4th house (North/IC)

    Weakest at the opposite house. Linear interpolation between.
    Formula: (6 - house_distance_from_weakest) * 10, where distance is in houses (1-12).
    Simplified: abs(house_distance_from_strongest - 7) * 10, capped at 0-60.
    """
    if planet_name not in DIG_BALA_STRONGEST:
        return 0.0

    strongest_house = DIG_BALA_STRONGEST[planet_name]
    # Weakest house is opposite (7 houses away)
    weakest_house = ((strongest_house - 1 + 6) % 12) + 1

    # Distance from weakest house (1-indexed, circular)
    distance = ((planet_house - weakest_house) % 12)
    if distance > 6:
        distance = 12 - distance

    return distance * 10.0


# =============================================================================
# KAALA BALA (Temporal Strength) — Simplified
# =============================================================================


def calculate_kaala_bala_simple(planet_name: str, is_daytime: bool, paksha_is_shukla: bool, weekday_lord: str) -> float:
    """
    Simplified Kaala Bala using available data.

    Full Kaala Bala needs sunrise/sunset times, hora calculations, etc.
    This approximation covers the three most impactful sub-components:
    - Nathonnatha Bala (day/night): 30 Virupas for strong time
    - Paksha Bala: 30 Virupas for strong paksha
    - Vara Bala: 45 Virupas if planet is weekday lord
    """
    score = 0.0

    # Nathonnatha: Diurnal planets strong in day, nocturnal at night
    diurnal = planet_name in ("Sun", "Jupiter", "Venus")
    nocturnal = planet_name in ("Moon", "Mars", "Saturn")

    if planet_name == "Mercury":
        score += 30.0  # Mercury always gets Nathonnatha strength
    elif (diurnal and is_daytime) or (nocturnal and not is_daytime):
        score += 30.0

    # Paksha Bala: Benefics strong in Shukla, malefics in Krishna
    benefic = planet_name in ("Jupiter", "Venus", "Mercury")
    malefic = planet_name in ("Sun", "Mars", "Saturn")

    if (benefic and paksha_is_shukla) or (malefic and not paksha_is_shukla):
        score += 30.0

    # Vara Bala
    if weekday_lord == planet_name:
        score += 45.0

    return score


# =============================================================================
# CHESHTA BALA (Motional Strength) — Simplified
# =============================================================================


def calculate_cheshta_bala_simple(planet_name: str, retrograde: bool, paksha_bala: float = 30.0) -> float:
    """
    Simplified Cheshta Bala.

    Full Cheshta Bala requires mean planetary longitudes and Shighrochcha.
    This approximation:
    - Retrograde planets get 60 Virupas (maximum)
    - Direct planets get 30 Virupas (average)
    - Sun's Cheshta = Ayana Bala (approximated as 30)
    - Moon's Cheshta = Paksha Bala
    """
    if planet_name == "Sun":
        return 30.0  # Ayana Bala approximation
    if planet_name == "Moon":
        return paksha_bala

    if retrograde:
        return 60.0
    return 30.0


# =============================================================================
# NAISARGIKA BALA (Natural Strength) — Fixed values
# =============================================================================


def calculate_naisargika_bala(planet_name: str) -> float:
    """
    Naisargika Bala (Natural Strength). Fixed, never changes.

    Sun=60, Moon=51.43, Venus=42.86, Jupiter=34.29,
    Mercury=25.71, Mars=17.14, Saturn=8.57.
    """
    return NAISARGIKA_BALA.get(planet_name, 0.0)


# =============================================================================
# DRIG BALA (Aspectual Strength) — Simplified
# =============================================================================


def calculate_drig_bala_simple(
    planet: PlanetPosition,
    all_planets: List[PlanetPosition],
) -> float:
    """
    Simplified Drig Bala using sign-based aspects.

    Full Drig Bala uses Sphuta Drishti (degree-based). This approximation:
    - Benefic aspects add strength, malefic aspects subtract.
    - Full aspect (7th) from benefic = +15, from malefic = -15.
    - Special aspects similarly weighted.
    """
    benefics = {"Jupiter", "Venus"}
    malefics = {"Sun", "Mars", "Saturn", "Rahu", "Ketu"}

    from ..core.constants import FULL_ASPECTS

    score = 0.0

    for other in all_planets:
        if other.planet == planet.planet:
            continue

        sign_distance = ((planet.sign_index - other.sign_index) % 12) + 1
        aspect_houses = FULL_ASPECTS.get(other.planet, [7])

        if sign_distance in aspect_houses:
            if other.planet in benefics:
                score += 15.0
            elif other.planet in malefics:
                score -= 15.0
            # Mercury is context-dependent; treat as mildly benefic
            elif other.planet == "Mercury":
                score += 5.0
            elif other.planet == "Moon":
                # Waxing Moon = benefic, waning = malefic
                # Without exact phase, use neutral
                score += 2.0

    return score


# =============================================================================
# TOTAL SHADBALA
# =============================================================================


def calculate_shadbala(
    chart: LagnaChart,
    divisional_charts: dict = None,
    panchanga=None,
) -> List[ShadBala]:
    """
    Calculate Shadbala for all 7 classical planets.

    Args:
        chart: LagnaChart with planet positions
        divisional_charts: Dict of divisional charts (for Navamsa sign lookup)
        panchanga: Panchanga data (for Kaala Bala)

    Returns:
        List of ShadBala objects, one per planet
    """
    results = []

    # Determine basic temporal parameters
    is_daytime = True  # Default; ideally from sunrise/sunset
    paksha_is_shukla = True
    weekday_lord = "Saturn"

    if panchanga:
        paksha_is_shukla = panchanga.paksha == "Shukla"
        weekday_lord = panchanga.vara_lord

    for planet in chart.planets:
        if planet.planet not in SHADBALA_PLANETS:
            continue

        # Get Navamsa sign for Ojhayugma
        navamsa_sign = 0
        if divisional_charts and "D9" in divisional_charts:
            d9 = divisional_charts["D9"]
            for pos in d9.positions:
                if pos.planet == planet.planet:
                    navamsa_sign = pos.sign_index
                    break

        # 1. Sthana Bala
        sthana = calculate_sthana_bala(planet, navamsa_sign)

        # 2. Dig Bala
        dig = calculate_dig_bala(planet.planet, planet.house)

        # 3. Kaala Bala
        kaala = calculate_kaala_bala_simple(
            planet.planet, is_daytime, paksha_is_shukla, weekday_lord
        )

        # 4. Cheshta Bala
        paksha_val = 30.0 if paksha_is_shukla else 30.0
        cheshta = calculate_cheshta_bala_simple(
            planet.planet, planet.retrograde, paksha_val
        )

        # 5. Naisargika Bala
        naisargika = calculate_naisargika_bala(planet.planet)

        # 6. Drig Bala
        drig = calculate_drig_bala_simple(planet, chart.planets)

        total_virupas = sthana + dig + kaala + cheshta + naisargika + drig
        total_rupas = total_virupas / 60.0

        min_required = SHADBALA_MINIMUM_RUPAS.get(planet.planet, 5.0)
        is_strong = total_rupas >= min_required

        results.append(
            ShadBala(
                planet=planet.planet,
                sthana_bala=round(sthana, 2),
                dig_bala=round(dig, 2),
                kaala_bala=round(kaala, 2),
                cheshta_bala=round(cheshta, 2),
                naisargika_bala=round(naisargika, 2),
                drig_bala=round(drig, 2),
                total_virupas=round(total_virupas, 2),
                total_rupas=round(total_rupas, 2),
                is_strong=is_strong,
                minimum_required=min_required,
            )
        )

    return results
