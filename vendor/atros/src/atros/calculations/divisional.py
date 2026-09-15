"""
Divisional Chart (Varga) Calculations.

This module calculates all divisional charts:
- D1 (Rashi) - Main birth chart
- D2 (Hora) - Wealth
- D3 (Drekkana) - Siblings and courage
- D4 (Chaturthamsa) - Property and fortune
- D5 (Panchamsa) - Spiritual merit
- D6 (Shashtamsa) - Health and enemies
- D7 (Saptamsa) - Children
- D8 (Ashtamsa) - Sudden events
- D9 (Navamsa) - Spouse and dharma
- D10 (Dasamsa) - Career
- D11 (Ekadasamsa) - Income and gains
- D12 (Dwadasamsa) - Parents
- D16 (Shodasamsa) - Vehicles and happiness
- D20 (Vimsamsa) - Spiritual pursuits
- D24 (Chaturvimsamsa) - Education and learning
- D27 (Bhamsa) - Strength and weakness
- D30 (Trimsamsa) - Misfortune
- D60 (Shashtiamsa) - Past karma

Each divisional chart divides the 30° of a sign into N equal parts,
with specific rules for determining the resulting sign.
"""

from typing import Dict, List, Tuple

from ..core.constants import D30_EVEN_SIGNS, D30_ODD_SIGNS, RASHI_NAMES, RASHI_QUALITIES
from ..core.models import DivisionalChart, DivisionalPosition


def get_sign_quality(sign_index: int) -> str:
    """Get the quality (Movable/Fixed/Dual) of a sign by index."""
    sign_name = RASHI_NAMES[sign_index]
    return RASHI_QUALITIES.get(sign_name, "Movable")


def is_odd_sign(sign_index: int) -> bool:
    """Check if a sign is odd (Aries, Gemini, Leo, Libra, Sagittarius, Aquarius)."""
    return sign_index % 2 == 0


# =============================================================================
# D1 - RASHI (Main Chart)
# =============================================================================


def calculate_d1(sign_index: int, degree: float) -> int:
    """
    D1 (Rashi) - Main birth chart.
    No division, planet stays in the same sign.

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        Same sign index
    """
    return sign_index


# =============================================================================
# D2 - HORA (Wealth)
# =============================================================================


def calculate_d2(sign_index: int, degree: float) -> int:
    """
    D2 (Hora) - Wealth chart.
    Divides each sign into 2 parts of 15° each.

    Rules:
    - Odd signs: 0-15° = Sun (Leo=4), 15-30° = Moon (Cancer=3)
    - Even signs: 0-15° = Moon (Cancer=3), 15-30° = Sun (Leo=4)

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D2 sign index (Leo=4 or Cancer=3)
    """
    first_half = degree < 15

    if is_odd_sign(sign_index):
        # Odd signs: Sun first, Moon second
        return 4 if first_half else 3  # Leo or Cancer
    else:
        # Even signs: Moon first, Sun second
        return 3 if first_half else 4  # Cancer or Leo


# =============================================================================
# D3 - DREKKANA (Siblings/Courage)
# =============================================================================


def calculate_d3(sign_index: int, degree: float) -> int:
    """
    D3 (Drekkana) - Siblings and courage chart.
    Divides each sign into 3 parts of 10° each.

    Rules:
    - 0-10°: Same sign
    - 10-20°: 5th from sign
    - 20-30°: 9th from sign

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D3 sign index
    """
    division_span = 10.0
    part = int(degree / division_span)
    part = min(part, 2)  # 0, 1, or 2

    if part == 0:
        return sign_index  # Same sign
    elif part == 1:
        return (sign_index + 4) % 12  # 5th from sign
    else:
        return (sign_index + 8) % 12  # 9th from sign


# =============================================================================
# D4 - CHATURTHAMSA (Property/Fortune)
# =============================================================================


def calculate_d4(sign_index: int, degree: float) -> int:
    """
    D4 (Chaturthamsa) - Property and fortune chart.
    Divides each sign into 4 parts of 7.5° each.

    Starting sign depends on quality:
    - Movable (Aries, Cancer, Libra, Capricorn): Start from same sign
    - Fixed (Taurus, Leo, Scorpio, Aquarius): Start from 4th sign
    - Dual (Gemini, Virgo, Sagittarius, Pisces): Start from 7th sign

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D4 sign index
    """
    division_span = 7.5
    part = int(degree / division_span)
    part = min(part, 3)  # 0-3

    quality = get_sign_quality(sign_index)

    if quality == "Movable":
        start_sign = sign_index
    elif quality == "Fixed":
        start_sign = (sign_index + 3) % 12  # 4th from sign
    else:  # Dual
        start_sign = (sign_index + 6) % 12  # 7th from sign

    return (start_sign + part) % 12


# =============================================================================
# D5 - PANCHAMSA (Spiritual Merit)
# =============================================================================


def calculate_d5(sign_index: int, degree: float) -> int:
    """
    D5 (Panchamsa) - Spiritual merit chart.
    Divides each sign into 5 parts of 6° each.

    Rules:
    - Odd signs: Start from same sign, count by 1 for each division
    - Even signs: Start from opposite sign (6th from), count by 1

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D5 sign index
    """
    part = min(int(degree / 6.0), 4)

    if is_odd_sign(sign_index):
        start_sign = sign_index
    else:
        start_sign = (sign_index + 6) % 12

    return (start_sign + part) % 12


# =============================================================================
# D6 - SHASHTAMSA (Health and Enemies)
# =============================================================================


def calculate_d6(sign_index: int, degree: float) -> int:
    """
    D6 (Shashtamsa) - Health and enemies chart.
    Divides each sign into 6 parts of 5° each.

    Count from same sign for all signs.

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D6 sign index
    """
    part = min(int(degree / 5.0), 5)

    return (sign_index + part) % 12


# =============================================================================
# D7 - SAPTAMSA (Children)
# =============================================================================


def calculate_d7(sign_index: int, degree: float) -> int:
    """
    D7 (Saptamsa) - Children chart.
    Divides each sign into 7 parts of 4°17'8.57" each.

    Rules:
    - Odd signs: Count from same sign
    - Even signs: Count from 7th sign

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D7 sign index
    """
    division_span = 30.0 / 7.0  # 4.2857...
    part = int(degree / division_span)
    part = min(part, 6)  # 0-6

    if is_odd_sign(sign_index):
        start_sign = sign_index
    else:
        start_sign = (sign_index + 6) % 12  # 7th from sign

    return (start_sign + part) % 12


# =============================================================================
# D8 - ASHTAMSA (Sudden Events)
# =============================================================================


def calculate_d8(sign_index: int, degree: float) -> int:
    """
    D8 (Ashtamsa) - Sudden events chart.
    Divides each sign into 8 parts of 3.75° each.

    Starting sign depends on quality:
    - Movable signs: Start from same sign
    - Fixed signs: Start from 9th sign
    - Dual signs: Start from 5th sign

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D8 sign index
    """
    division_span = 3.75
    part = min(int(degree / division_span), 7)

    quality = get_sign_quality(sign_index)

    if quality == "Movable":
        start_sign = sign_index
    elif quality == "Fixed":
        start_sign = (sign_index + 8) % 12  # 9th from sign
    else:  # Dual
        start_sign = (sign_index + 4) % 12  # 5th from sign

    return (start_sign + part) % 12


# =============================================================================
# D9 - NAVAMSA (Spouse/Dharma)
# =============================================================================


def calculate_d9(sign_index: int, degree: float) -> int:
    """
    D9 (Navamsa) - Spouse, dharma, and soul chart.
    Divides each sign into 9 parts of 3°20' each.

    Starting sign depends on quality:
    - Movable (Aries, Cancer, Libra, Capricorn): Start from same sign
    - Fixed (Taurus, Leo, Scorpio, Aquarius): Start from 9th sign
    - Dual (Gemini, Virgo, Sagittarius, Pisces): Start from 5th sign

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D9 sign index
    """
    division_span = 30.0 / 9.0  # 3.333...
    part = int(degree / division_span)
    part = min(part, 8)  # 0-8

    quality = get_sign_quality(sign_index)

    if quality == "Movable":
        start_sign = sign_index
    elif quality == "Fixed":
        start_sign = (sign_index + 8) % 12  # 9th from sign
    else:  # Dual
        start_sign = (sign_index + 4) % 12  # 5th from sign

    return (start_sign + part) % 12


# =============================================================================
# D10 - DASAMSA (Career)
# =============================================================================


def calculate_d10(sign_index: int, degree: float) -> int:
    """
    D10 (Dasamsa) - Career and profession chart.
    Divides each sign into 10 parts of 3° each.

    Rules:
    - Odd signs: Count from same sign
    - Even signs: Count from 9th sign

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D10 sign index
    """
    division_span = 3.0
    part = int(degree / division_span)
    part = min(part, 9)  # 0-9

    if is_odd_sign(sign_index):
        start_sign = sign_index
    else:
        start_sign = (sign_index + 8) % 12  # 9th from sign

    return (start_sign + part) % 12


# =============================================================================
# D11 - EKADASAMSA (Income and Gains)
# =============================================================================


def calculate_d11(sign_index: int, degree: float) -> int:
    """
    D11 (Ekadasamsa) - Income and gains chart.
    Divides each sign into 11 parts of ~2.727° each.

    Count from same sign for all signs.

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D11 sign index
    """
    division_span = 30.0 / 11.0  # 2.7272...
    part = min(int(degree / division_span), 10)

    return (sign_index + part) % 12


# =============================================================================
# D12 - DWADASAMSA (Parents)
# =============================================================================


def calculate_d12(sign_index: int, degree: float) -> int:
    """
    D12 (Dwadasamsa) - Parents chart.
    Divides each sign into 12 parts of 2.5° each.

    Count starts from the same sign.

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D12 sign index
    """
    division_span = 2.5
    part = int(degree / division_span)
    part = min(part, 11)  # 0-11

    return (sign_index + part) % 12


# =============================================================================
# D16 - SHODASAMSA (Vehicles and Happiness)
# =============================================================================


def calculate_d16(sign_index: int, degree: float) -> int:
    """
    D16 (Shodasamsa) - Vehicles and happiness chart.
    Divides each sign into 16 parts of 1.875° each.

    Starting sign depends on quality:
    - Movable signs: Start from Aries (0)
    - Fixed signs: Start from Leo (4)
    - Dual signs: Start from Sagittarius (8)

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D16 sign index
    """
    division_span = 30.0 / 16.0  # 1.875
    part = min(int(degree / division_span), 15)

    quality = get_sign_quality(sign_index)

    if quality == "Movable":
        start_sign = 0  # Aries
    elif quality == "Fixed":
        start_sign = 4  # Leo
    else:  # Dual
        start_sign = 8  # Sagittarius

    return (start_sign + part) % 12


# =============================================================================
# D20 - VIMSAMSA (Spiritual Pursuits)
# =============================================================================


def calculate_d20(sign_index: int, degree: float) -> int:
    """
    D20 (Vimsamsa) - Spiritual pursuits chart.
    Divides each sign into 20 parts of 1.5° each.

    Starting sign depends on quality:
    - Movable signs: Start from Aries (0)
    - Fixed signs: Start from Sagittarius (8)
    - Dual signs: Start from Leo (4)

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D20 sign index
    """
    division_span = 1.5
    part = min(int(degree / division_span), 19)

    quality = get_sign_quality(sign_index)

    if quality == "Movable":
        start_sign = 0  # Aries
    elif quality == "Fixed":
        start_sign = 8  # Sagittarius
    else:  # Dual
        start_sign = 4  # Leo

    return (start_sign + part) % 12


# =============================================================================
# D24 - CHATURVIMSAMSA (Education and Learning)
# =============================================================================


def calculate_d24(sign_index: int, degree: float) -> int:
    """
    D24 (Chaturvimsamsa) - Education and learning chart.
    Divides each sign into 24 parts of 1.25° each.

    Rules:
    - Odd signs: Start from Leo (4)
    - Even signs: Start from Cancer (3)

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D24 sign index
    """
    division_span = 1.25
    part = min(int(degree / division_span), 23)

    if is_odd_sign(sign_index):
        start_sign = 4  # Leo
    else:
        start_sign = 3  # Cancer

    return (start_sign + part) % 12


# =============================================================================
# D27 - BHAMSA / NAKSHATRAMSA (Strength and Weakness)
# =============================================================================


def get_sign_element(sign_index: int) -> str:
    """Get the element of a sign by index."""
    element_map = {
        0: "Fire", 4: "Fire", 8: "Fire",     # Aries, Leo, Sagittarius
        1: "Earth", 5: "Earth", 9: "Earth",   # Taurus, Virgo, Capricorn
        2: "Air", 6: "Air", 10: "Air",        # Gemini, Libra, Aquarius
        3: "Water", 7: "Water", 11: "Water",  # Cancer, Scorpio, Pisces
    }
    return element_map.get(sign_index, "Fire")


def calculate_d27(sign_index: int, degree: float) -> int:
    """
    D27 (Bhamsa/Nakshatramsa) - Strength and weakness chart.
    Divides each sign into 27 parts of ~1.111° each.

    Starting sign depends on element:
    - Fire signs (0,4,8): Start from Aries (0)
    - Earth signs (1,5,9): Start from Cancer (3)
    - Air signs (2,6,10): Start from Libra (6)
    - Water signs (3,7,11): Start from Capricorn (9)

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D27 sign index
    """
    division_span = 30.0 / 27.0  # 1.1111...
    part = min(int(degree / division_span), 26)

    element = get_sign_element(sign_index)

    if element == "Fire":
        start_sign = 0  # Aries
    elif element == "Earth":
        start_sign = 3  # Cancer
    elif element == "Air":
        start_sign = 6  # Libra
    else:  # Water
        start_sign = 9  # Capricorn

    return (start_sign + part) % 12


# =============================================================================
# D30 - TRIMSAMSA (Misfortune)
# =============================================================================


def calculate_d30(sign_index: int, degree: float) -> int:
    """
    D30 (Trimsamsa) - Misfortune and difficulties chart.
    Has UNEQUAL divisions of 5 parts with different spans.

    Odd signs: Mars(5°), Saturn(5°), Jupiter(8°), Mercury(7°), Venus(5°)
    Even signs: Venus(5°), Mercury(7°), Jupiter(8°), Saturn(5°), Mars(5°)

    The resulting sign is the sign of the ruling planet.

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D30 sign index (based on ruling planet's sign)
    """
    divisions = D30_ODD_SIGNS if is_odd_sign(sign_index) else D30_EVEN_SIGNS

    # Find which division the degree falls into
    for planet, end_degree in divisions:
        if degree < end_degree:
            # Return the first sign owned by this planet
            planet_signs = {
                "Mars": 0,  # Aries
                "Venus": 1,  # Taurus
                "Mercury": 2,  # Gemini
                "Jupiter": 8,  # Sagittarius
                "Saturn": 9,  # Capricorn
            }
            return planet_signs.get(planet, 0)

    # Default to last division
    return 0


# =============================================================================
# D60 - SHASHTIAMSA (Past Karma)
# =============================================================================


def calculate_d60(sign_index: int, degree: float) -> int:
    """
    D60 (Shashtiamsa) - Past karma chart.
    Divides each sign into 60 parts of 0.5° each.

    Count starts from the same sign.

    Args:
        sign_index: Sign index (0-11)
        degree: Degree in sign (0-30)

    Returns:
        D60 sign index
    """
    division_span = 0.5
    part = int(degree / division_span)
    part = min(part, 59)  # 0-59

    return (sign_index + part) % 12


# =============================================================================
# UNIFIED CALCULATION FUNCTIONS
# =============================================================================


DIVISIONAL_CALCULATORS = {
    "D1": calculate_d1,
    "D2": calculate_d2,
    "D3": calculate_d3,
    "D4": calculate_d4,
    "D5": calculate_d5,
    "D6": calculate_d6,
    "D7": calculate_d7,
    "D8": calculate_d8,
    "D9": calculate_d9,
    "D10": calculate_d10,
    "D11": calculate_d11,
    "D12": calculate_d12,
    "D16": calculate_d16,
    "D20": calculate_d20,
    "D24": calculate_d24,
    "D27": calculate_d27,
    "D30": calculate_d30,
    "D60": calculate_d60,
}

DIVISIONAL_NAMES = {
    "D1": ("Rashi", "Main birth chart"),
    "D2": ("Hora", "Wealth and prosperity"),
    "D3": ("Drekkana", "Siblings and courage"),
    "D4": ("Chaturthamsa", "Property and fortune"),
    "D5": ("Panchamsa", "Spiritual merit"),
    "D6": ("Shashtamsa", "Health and enemies"),
    "D7": ("Saptamsa", "Children and progeny"),
    "D8": ("Ashtamsa", "Sudden events"),
    "D9": ("Navamsa", "Spouse, dharma, and soul"),
    "D10": ("Dasamsa", "Career and profession"),
    "D11": ("Ekadasamsa", "Income and gains"),
    "D12": ("Dwadasamsa", "Parents"),
    "D16": ("Shodasamsa", "Vehicles and happiness"),
    "D20": ("Vimsamsa", "Spiritual pursuits"),
    "D24": ("Chaturvimsamsa", "Education and learning"),
    "D27": ("Bhamsa", "Strength and weakness"),
    "D30": ("Trimsamsa", "Misfortune and difficulties"),
    "D60": ("Shashtiamsa", "Past karma"),
}


def calculate_divisional_sign(
    chart_type: str, sign_index: int, degree: float
) -> int:
    """
    Calculate the sign in a specific divisional chart.

    Args:
        chart_type: Chart type (D1, D2, D3, etc.)
        sign_index: D1 sign index (0-11)
        degree: Degree in D1 sign (0-30)

    Returns:
        Sign index in the divisional chart
    """
    calculator = DIVISIONAL_CALCULATORS.get(chart_type, calculate_d1)
    return calculator(sign_index, degree)


def generate_divisional_chart(
    chart_type: str, planet_positions: Dict[str, Dict]
) -> DivisionalChart:
    """
    Generate a complete divisional chart from D1 positions.

    Args:
        chart_type: Chart type (D1, D2, D9, etc.)
        planet_positions: Dict of planet positions from ephemeris

    Returns:
        DivisionalChart object
    """
    name, description = DIVISIONAL_NAMES.get(chart_type, ("Unknown", "Unknown"))

    positions = []
    for planet_name, pos in planet_positions.items():
        sign_index = pos.get("sign_index", 0)
        degree = pos.get("degree", 0.0)

        div_sign_index = calculate_divisional_sign(chart_type, sign_index, degree)
        div_sign_name = RASHI_NAMES[div_sign_index]

        positions.append(
            DivisionalPosition(
                planet=planet_name,
                sign=div_sign_name,
                sign_index=div_sign_index,
            )
        )

    return DivisionalChart(
        chart_type=chart_type,
        name=name,
        description=description,
        positions=positions,
        ascendant=None,  # Will be set separately if needed
    )


def generate_all_divisional_charts(
    planet_positions: Dict[str, Dict]
) -> Dict[str, DivisionalChart]:
    """
    Generate all divisional charts.

    Args:
        planet_positions: Dict of planet positions from ephemeris

    Returns:
        Dict mapping chart types to DivisionalChart objects
    """
    charts = {}

    for chart_type in DIVISIONAL_CALCULATORS.keys():
        if chart_type != "D1":  # D1 is handled separately as the main chart
            charts[chart_type] = generate_divisional_chart(chart_type, planet_positions)

    return charts


def is_vargottama(d1_sign_index: int, d9_sign_index: int) -> bool:
    """
    Check if a planet is Vargottama (same sign in D1 and D9).

    A Vargottama planet is considered strong and auspicious.

    Args:
        d1_sign_index: Sign index in D1 (Rashi)
        d9_sign_index: Sign index in D9 (Navamsa)

    Returns:
        True if planet is Vargottama
    """
    return d1_sign_index == d9_sign_index
