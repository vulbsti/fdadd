"""
Vedic Astrology Constants and Reference Data.

This module contains all the static data needed for Vedic astrology calculations:
- Zodiac signs (Rashis) with their properties
- Nakshatras (lunar mansions) with lords and degrees
- Planetary dignities (exaltation, debilitation, own signs)
- Vimshottari dasha periods
- Natural planetary friendships
"""

from typing import Dict, List, Tuple

# =============================================================================
# ZODIAC SIGNS (RASHIS)
# =============================================================================

RASHI_NAMES: List[str] = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
]

RASHI_SANSKRIT: Dict[str, str] = {
    "Aries": "Mesha",
    "Taurus": "Vrishabha",
    "Gemini": "Mithuna",
    "Cancer": "Karka",
    "Leo": "Simha",
    "Virgo": "Kanya",
    "Libra": "Tula",
    "Scorpio": "Vrischika",
    "Sagittarius": "Dhanu",
    "Capricorn": "Makara",
    "Aquarius": "Kumbha",
    "Pisces": "Meena",
}

# Sign lords (rulers)
RASHI_LORDS: Dict[str, str] = {
    "Aries": "Mars",
    "Taurus": "Venus",
    "Gemini": "Mercury",
    "Cancer": "Moon",
    "Leo": "Sun",
    "Virgo": "Mercury",
    "Libra": "Venus",
    "Scorpio": "Mars",
    "Sagittarius": "Jupiter",
    "Capricorn": "Saturn",
    "Aquarius": "Saturn",
    "Pisces": "Jupiter",
}

# Sign qualities (used for divisional chart calculations)
RASHI_QUALITIES: Dict[str, str] = {
    "Aries": "Movable",
    "Taurus": "Fixed",
    "Gemini": "Dual",
    "Cancer": "Movable",
    "Leo": "Fixed",
    "Virgo": "Dual",
    "Libra": "Movable",
    "Scorpio": "Fixed",
    "Sagittarius": "Dual",
    "Capricorn": "Movable",
    "Aquarius": "Fixed",
    "Pisces": "Dual",
}

# Odd/Even signs (used for some divisional calculations)
# Odd signs: 0, 2, 4, 6, 8, 10 (Aries, Gemini, Leo, Libra, Sagittarius, Aquarius)
# Even signs: 1, 3, 5, 7, 9, 11 (Taurus, Cancer, Virgo, Scorpio, Capricorn, Pisces)

# =============================================================================
# NAKSHATRAS (27 LUNAR MANSIONS)
# =============================================================================

# Each nakshatra spans 13°20' (13.3333... degrees)
NAKSHATRA_SPAN: float = 360.0 / 27.0  # 13.333...

# Each pada (quarter) spans 3°20' (3.3333... degrees)
PADA_SPAN: float = NAKSHATRA_SPAN / 4.0  # 3.333...

# Nakshatra data: (name, lord, deity)
NAKSHATRAS: List[Dict[str, str]] = [
    {"name": "Ashwini", "lord": "Ketu", "deity": "Ashwini Kumaras"},
    {"name": "Bharani", "lord": "Venus", "deity": "Yama"},
    {"name": "Krittika", "lord": "Sun", "deity": "Agni"},
    {"name": "Rohini", "lord": "Moon", "deity": "Brahma"},
    {"name": "Mrigashira", "lord": "Mars", "deity": "Soma"},
    {"name": "Ardra", "lord": "Rahu", "deity": "Rudra"},
    {"name": "Punarvasu", "lord": "Jupiter", "deity": "Aditi"},
    {"name": "Pushya", "lord": "Saturn", "deity": "Brihaspati"},
    {"name": "Ashlesha", "lord": "Mercury", "deity": "Nagas"},
    {"name": "Magha", "lord": "Ketu", "deity": "Pitris"},
    {"name": "Purva Phalguni", "lord": "Venus", "deity": "Bhaga"},
    {"name": "Uttara Phalguni", "lord": "Sun", "deity": "Aryaman"},
    {"name": "Hasta", "lord": "Moon", "deity": "Savitar"},
    {"name": "Chitra", "lord": "Mars", "deity": "Vishvakarma"},
    {"name": "Swati", "lord": "Rahu", "deity": "Vayu"},
    {"name": "Vishakha", "lord": "Jupiter", "deity": "Indra-Agni"},
    {"name": "Anuradha", "lord": "Saturn", "deity": "Mitra"},
    {"name": "Jyeshtha", "lord": "Mercury", "deity": "Indra"},
    {"name": "Mula", "lord": "Ketu", "deity": "Nirriti"},
    {"name": "Purva Ashadha", "lord": "Venus", "deity": "Apas"},
    {"name": "Uttara Ashadha", "lord": "Sun", "deity": "Vishvadevas"},
    {"name": "Shravana", "lord": "Moon", "deity": "Vishnu"},
    {"name": "Dhanishta", "lord": "Mars", "deity": "Vasus"},
    {"name": "Shatabhisha", "lord": "Rahu", "deity": "Varuna"},
    {"name": "Purva Bhadrapada", "lord": "Jupiter", "deity": "Aja Ekapada"},
    {"name": "Uttara Bhadrapada", "lord": "Saturn", "deity": "Ahir Budhnya"},
    {"name": "Revati", "lord": "Mercury", "deity": "Pushan"},
]

# Nakshatra lord sequence (repeats 3 times to cover all 27)
NAKSHATRA_LORDS_CYCLE: List[str] = [
    "Ketu",
    "Venus",
    "Sun",
    "Moon",
    "Mars",
    "Rahu",
    "Jupiter",
    "Saturn",
    "Mercury",
]

# =============================================================================
# VIMSHOTTARI DASHA
# =============================================================================

# Total Vimshottari cycle is 120 years
VIMSHOTTARI_TOTAL_YEARS: int = 120

# Dasha periods in years for each planet
VIMSHOTTARI_YEARS: Dict[str, int] = {
    "Ketu": 7,
    "Venus": 20,
    "Sun": 6,
    "Moon": 10,
    "Mars": 7,
    "Rahu": 18,
    "Jupiter": 16,
    "Saturn": 19,
    "Mercury": 17,
}

# Dasha sequence (same as nakshatra lords cycle)
VIMSHOTTARI_SEQUENCE: List[str] = NAKSHATRA_LORDS_CYCLE.copy()

# =============================================================================
# PLANETARY DIGNITIES
# =============================================================================

# Exaltation signs and exact degrees
EXALTATION: Dict[str, Dict[str, any]] = {
    "Sun": {"sign": "Aries", "sign_index": 0, "degree": 10.0},
    "Moon": {"sign": "Taurus", "sign_index": 1, "degree": 3.0},
    "Mars": {"sign": "Capricorn", "sign_index": 9, "degree": 28.0},
    "Mercury": {"sign": "Virgo", "sign_index": 5, "degree": 15.0},
    "Jupiter": {"sign": "Cancer", "sign_index": 3, "degree": 5.0},
    "Venus": {"sign": "Pisces", "sign_index": 11, "degree": 27.0},
    "Saturn": {"sign": "Libra", "sign_index": 6, "degree": 20.0},
}

# Debilitation signs and degrees (opposite of exaltation)
DEBILITATION: Dict[str, Dict[str, any]] = {
    "Sun": {"sign": "Libra", "sign_index": 6, "degree": 10.0},
    "Moon": {"sign": "Scorpio", "sign_index": 7, "degree": 3.0},
    "Mars": {"sign": "Cancer", "sign_index": 3, "degree": 28.0},
    "Mercury": {"sign": "Pisces", "sign_index": 11, "degree": 15.0},
    "Jupiter": {"sign": "Capricorn", "sign_index": 9, "degree": 5.0},
    "Venus": {"sign": "Virgo", "sign_index": 5, "degree": 27.0},
    "Saturn": {"sign": "Aries", "sign_index": 0, "degree": 20.0},
}

# Own signs for each planet
OWN_SIGNS: Dict[str, List[str]] = {
    "Sun": ["Leo"],
    "Moon": ["Cancer"],
    "Mars": ["Aries", "Scorpio"],
    "Mercury": ["Gemini", "Virgo"],
    "Jupiter": ["Sagittarius", "Pisces"],
    "Venus": ["Taurus", "Libra"],
    "Saturn": ["Capricorn", "Aquarius"],
}

# Moolatrikona zones (sign, start_degree, end_degree)
MOOLATRIKONA: Dict[str, Tuple[str, float, float]] = {
    "Sun": ("Leo", 0.0, 20.0),
    "Moon": ("Taurus", 4.0, 20.0),
    "Mars": ("Aries", 0.0, 12.0),
    "Mercury": ("Virgo", 16.0, 20.0),
    "Jupiter": ("Sagittarius", 0.0, 10.0),
    "Venus": ("Libra", 0.0, 15.0),
    "Saturn": ("Aquarius", 0.0, 20.0),
}

# =============================================================================
# PLANETARY RELATIONSHIPS (NAISARGIKA MAITRI)
# =============================================================================

# Natural friends
NATURAL_FRIENDS: Dict[str, List[str]] = {
    "Sun": ["Moon", "Mars", "Jupiter"],
    "Moon": ["Sun", "Mercury"],
    "Mars": ["Sun", "Moon", "Jupiter"],
    "Mercury": ["Sun", "Venus"],
    "Jupiter": ["Sun", "Moon", "Mars"],
    "Venus": ["Mercury", "Saturn"],
    "Saturn": ["Mercury", "Venus"],
    "Rahu": ["Mercury", "Venus", "Saturn"],
    "Ketu": ["Mars", "Venus", "Saturn"],
}

# Natural enemies
NATURAL_ENEMIES: Dict[str, List[str]] = {
    "Sun": ["Venus", "Saturn"],
    "Moon": [],  # Moon has no natural enemies
    "Mars": ["Mercury"],
    "Mercury": ["Moon"],
    "Jupiter": ["Mercury", "Venus"],
    "Venus": ["Sun", "Moon"],
    "Saturn": ["Sun", "Moon", "Mars"],
    "Rahu": ["Sun", "Moon", "Mars"],
    "Ketu": ["Sun", "Moon"],
}

# Natural neutrals (all planets not in friends or enemies)
NATURAL_NEUTRALS: Dict[str, List[str]] = {
    "Sun": ["Mercury"],
    "Moon": ["Mars", "Jupiter", "Venus", "Saturn"],
    "Mars": ["Venus", "Saturn"],
    "Mercury": ["Mars", "Jupiter", "Saturn"],
    "Jupiter": ["Saturn"],
    "Venus": ["Mars", "Jupiter"],
    "Saturn": ["Jupiter"],
    "Rahu": ["Jupiter"],
    "Ketu": ["Mercury", "Jupiter"],
}

# =============================================================================
# DIVISIONAL CHART CONSTANTS
# =============================================================================

# D30 (Trimsamsa) - Unequal divisions for odd and even signs
# Format: (planet, degrees) - cumulative
D30_ODD_SIGNS: List[Tuple[str, float]] = [
    ("Mars", 5.0),  # 0-5
    ("Saturn", 10.0),  # 5-10
    ("Jupiter", 18.0),  # 10-18
    ("Mercury", 25.0),  # 18-25
    ("Venus", 30.0),  # 25-30
]

D30_EVEN_SIGNS: List[Tuple[str, float]] = [
    ("Venus", 5.0),  # 0-5
    ("Mercury", 12.0),  # 5-12
    ("Jupiter", 20.0),  # 12-20
    ("Saturn", 25.0),  # 20-25
    ("Mars", 30.0),  # 25-30
]

# D60 (Shashtiamsa) names - 60 divisions, each 0.5 degrees
D60_NAMES: List[str] = [
    "Ghora",
    "Rakshasa",
    "Deva",
    "Kubera",
    "Yaksha",
    "Kinnara",
    "Bhrashta",
    "Kulaghna",
    "Garala",
    "Vahni",
    "Maya",
    "Purishaka",
    "Apampathi",
    "Marutvan",
    "Kaala",
    "Sarpa",
    "Amrita",
    "Indu",
    "Mridu",
    "Komala",
    "Heramba",
    "Brahma",
    "Vishnu",
    "Maheshwara",
    "Deva",
    "Ardra",
    "Kalinasha",
    "Kshitiza",
    "Kamalakara",
    "Gulika",
    "Mrityu",
    "Kaala",
    "Davagni",
    "Ghora",
    "Yama",
    "Kantaka",
    "Sudha",
    "Amrita",
    "Poornachandra",
    "Vishagdha",
    "Kulanasha",
    "Vamshakshaya",
    "Utpata",
    "Kaala",
    "Saumya",
    "Komala",
    "Sheetala",
    "Karala",
    "Chandramukhi",
    "Praveena",
    "Kalagni",
    "Dandayudha",
    "Nirmala",
    "Saumya",
    "Kroora",
    "Atisheetala",
    "Amrita",
    "Payodhi",
    "Brahmana",
    "Chandrarekha",
]

# =============================================================================
# HOUSE MEANINGS (for reference)
# =============================================================================

HOUSE_MEANINGS: Dict[int, str] = {
    1: "Self, Personality, Appearance",
    2: "Wealth, Speech, Family",
    3: "Courage, Siblings, Effort",
    4: "Home, Mother, Peace, Vehicles",
    5: "Creativity, Children, Education",
    6: "Service, Enemies, Health, Debts",
    7: "Partnership, Marriage, Business",
    8: "Transformation, Occult, Longevity",
    9: "Dharma, Luck, Father, Guru",
    10: "Career, Reputation, Authority",
    11: "Gains, Network, Income, Hopes",
    12: "Loss, Isolation, Spirituality, Foreign",
}

# =============================================================================
# KENDRA AND TRIKONA HOUSES
# =============================================================================

KENDRA_HOUSES: List[int] = [1, 4, 7, 10]  # Angular houses
TRIKONA_HOUSES: List[int] = [1, 5, 9]  # Trinal houses
DUSTHANA_HOUSES: List[int] = [6, 8, 12]  # Malefic houses
UPACHAYA_HOUSES: List[int] = [3, 6, 10, 11]  # Growth houses

# =============================================================================
# PLANETARY ASPECTS (GRAHA DRISHTI)
# =============================================================================

# Full (100%) aspects for each planet.
# All planets have 7th house aspect. Mars, Jupiter, Saturn have additional special aspects.
FULL_ASPECTS: Dict[str, List[int]] = {
    "Sun": [7],
    "Moon": [7],
    "Mars": [4, 7, 8],
    "Mercury": [7],
    "Jupiter": [5, 7, 9],
    "Venus": [7],
    "Saturn": [3, 7, 10],
    "Rahu": [5, 7, 9],
    "Ketu": [5, 7, 9],
}

# Partial aspect strengths (percentage) by house distance.
# Only houses 3,4,5,7,8,9,10 have nonzero aspects; other distances are 0.
PARTIAL_ASPECTS: Dict[str, Dict[int, float]] = {
    "Sun":     {3: 25, 4: 75, 5: 50, 7: 100, 8: 75, 9: 50, 10: 25},
    "Moon":    {3: 25, 4: 75, 5: 50, 7: 100, 8: 75, 9: 50, 10: 25},
    "Mars":    {3: 50, 4: 100, 5: 75, 7: 100, 8: 100, 9: 75, 10: 50},
    "Mercury": {3: 25, 4: 75, 5: 50, 7: 100, 8: 75, 9: 50, 10: 25},
    "Jupiter": {3: 75, 4: 25, 5: 100, 7: 100, 8: 25, 9: 100, 10: 75},
    "Venus":   {3: 25, 4: 75, 5: 50, 7: 100, 8: 75, 9: 50, 10: 25},
    "Saturn":  {3: 100, 4: 50, 5: 25, 7: 100, 8: 50, 9: 25, 10: 100},
    "Rahu":    {3: 75, 4: 25, 5: 100, 7: 100, 8: 25, 9: 100, 10: 75},
    "Ketu":    {3: 75, 4: 25, 5: 100, 7: 100, 8: 25, 9: 100, 10: 75},
}


# =============================================================================
# COMBUSTION (ASTA) THRESHOLDS
# =============================================================================

# Maximum angular distance from Sun (in degrees) for a planet to be combust.
# Values are (direct_threshold, retrograde_threshold).
# Rahu/Ketu are never combust (not included).
# Outer planets (Mars, Jupiter, Saturn) cannot be combust while retrograde,
# so their retrograde threshold is 0.
COMBUSTION_THRESHOLDS: Dict[str, Tuple[float, float]] = {
    "Moon": (12.0, 12.0),
    "Mars": (17.0, 0.0),
    "Mercury": (14.0, 12.0),
    "Jupiter": (11.0, 0.0),
    "Venus": (10.0, 8.0),
    "Saturn": (15.0, 0.0),
}


# =============================================================================
# PANCHANGA
# =============================================================================

# 30 Tithi names (1-indexed). Tithis 1-15 are Shukla Paksha, 16-30 are Krishna Paksha.
TITHI_NAMES: List[str] = [
    "Shukla Pratipada",
    "Shukla Dwitiya",
    "Shukla Tritiya",
    "Shukla Chaturthi",
    "Shukla Panchami",
    "Shukla Shashthi",
    "Shukla Saptami",
    "Shukla Ashtami",
    "Shukla Navami",
    "Shukla Dashami",
    "Shukla Ekadashi",
    "Shukla Dwadashi",
    "Shukla Trayodashi",
    "Shukla Chaturdashi",
    "Purnima",
    "Krishna Pratipada",
    "Krishna Dwitiya",
    "Krishna Tritiya",
    "Krishna Chaturthi",
    "Krishna Panchami",
    "Krishna Shashthi",
    "Krishna Saptami",
    "Krishna Ashtami",
    "Krishna Navami",
    "Krishna Dashami",
    "Krishna Ekadashi",
    "Krishna Dwadashi",
    "Krishna Trayodashi",
    "Krishna Chaturdashi",
    "Amavasya",
]

# 27 Nithya Yoga names (1-indexed).
NITHYA_YOGA_NAMES: List[str] = [
    "Vishkambha",
    "Priti",
    "Ayushman",
    "Saubhagya",
    "Shobhana",
    "Atiganda",
    "Sukarma",
    "Dhriti",
    "Shoola",
    "Ganda",
    "Vriddhi",
    "Dhruva",
    "Vyaghata",
    "Harshana",
    "Vajra",
    "Siddhi",
    "Vyatipata",
    "Variyan",
    "Parigha",
    "Shiva",
    "Siddha",
    "Sadhya",
    "Shubha",
    "Shukla",
    "Brahma",
    "Indra",
    "Vaidhriti",
]

# 7 Movable (repeating) Karana names. These cycle through positions 2-57.
MOVABLE_KARANA_NAMES: List[str] = [
    "Bava",
    "Balava",
    "Kaulava",
    "Taitila",
    "Gara",
    "Vanija",
    "Vishti",
]

# 4 Fixed Karana names and their positions.
FIXED_KARANAS: Dict[int, str] = {
    1: "Kimstughna",
    58: "Shakuni",
    59: "Chatushpada",
    60: "Naga",
}

# Vara (weekday) data: (name, Sanskrit name, lord).
# Keyed by isoweekday (Monday=1 ... Sunday=7).
VARA_DATA: Dict[int, Tuple[str, str, str]] = {
    1: ("Monday", "Somavara", "Moon"),
    2: ("Tuesday", "Mangalavara", "Mars"),
    3: ("Wednesday", "Budhavara", "Mercury"),
    4: ("Thursday", "Guruvara", "Jupiter"),
    5: ("Friday", "Shukravara", "Venus"),
    6: ("Saturday", "Shanivara", "Saturn"),
    7: ("Sunday", "Ravivara", "Sun"),
}


# =============================================================================
# ASHTAKAVARGA BINDU TABLES (BPHS Chapter 66)
# =============================================================================

# For each planet, which houses from each contributor yield a bindu.
# Houses are 1-indexed (1 = same sign as contributor).
# Checksums: Sun=48, Moon=49, Mars=39, Mercury=54, Jupiter=56, Venus=52, Saturn=39, Total=337
ASHTAKAVARGA_BINDU_TABLES: Dict[str, Dict[str, List[int]]] = {
    "Sun": {
        "Sun": [1, 2, 4, 7, 8, 9, 10, 11], "Moon": [3, 6, 10, 11],
        "Mars": [1, 2, 4, 7, 8, 9, 10, 11], "Mercury": [3, 5, 6, 9, 10, 11, 12],
        "Jupiter": [5, 6, 9, 11], "Venus": [6, 7, 12],
        "Saturn": [1, 2, 4, 7, 8, 9, 10, 11], "Lagna": [3, 4, 6, 10, 11, 12],
    },
    "Moon": {
        "Sun": [3, 6, 7, 8, 10, 11], "Moon": [1, 3, 6, 7, 10, 11],
        "Mars": [2, 3, 5, 6, 9, 10, 11], "Mercury": [1, 3, 4, 5, 7, 8, 10, 11],
        "Jupiter": [1, 4, 7, 8, 10, 11, 12], "Venus": [3, 4, 5, 7, 9, 10, 11],
        "Saturn": [3, 5, 6, 11], "Lagna": [3, 6, 10, 11],
    },
    "Mars": {
        "Sun": [3, 5, 6, 10, 11], "Moon": [3, 6, 11],
        "Mars": [1, 2, 4, 7, 8, 10, 11], "Mercury": [3, 5, 6, 11],
        "Jupiter": [6, 10, 11, 12], "Venus": [6, 8, 11, 12],
        "Saturn": [1, 4, 7, 8, 9, 10, 11], "Lagna": [1, 3, 6, 10, 11],
    },
    "Mercury": {
        "Sun": [5, 6, 9, 11, 12], "Moon": [2, 4, 6, 8, 10, 11],
        "Mars": [1, 2, 4, 7, 8, 9, 10, 11], "Mercury": [1, 3, 5, 6, 9, 10, 11, 12],
        "Jupiter": [6, 8, 11, 12], "Venus": [1, 2, 3, 4, 5, 8, 9, 11],
        "Saturn": [1, 2, 4, 7, 8, 9, 10, 11], "Lagna": [1, 2, 4, 6, 8, 10, 11],
    },
    "Jupiter": {
        "Sun": [1, 2, 3, 4, 7, 8, 9, 10, 11], "Moon": [2, 5, 7, 9, 11],
        "Mars": [1, 2, 4, 7, 8, 10, 11], "Mercury": [1, 2, 4, 5, 6, 9, 10, 11],
        "Jupiter": [1, 2, 3, 4, 7, 8, 10, 11], "Venus": [2, 5, 6, 9, 10, 11],
        "Saturn": [3, 5, 6, 12], "Lagna": [1, 2, 4, 5, 6, 7, 9, 10, 11],
    },
    "Venus": {
        "Sun": [8, 11, 12], "Moon": [1, 2, 3, 4, 5, 8, 9, 11, 12],
        "Mars": [3, 5, 6, 9, 11, 12], "Mercury": [3, 5, 6, 9, 11],
        "Jupiter": [5, 8, 9, 10, 11], "Venus": [1, 2, 3, 4, 5, 8, 9, 10, 11],
        "Saturn": [3, 4, 5, 8, 9, 10, 11], "Lagna": [1, 2, 3, 4, 5, 8, 9, 11],
    },
    "Saturn": {
        "Sun": [1, 2, 4, 7, 8, 10, 11], "Moon": [3, 6, 11],
        "Mars": [3, 5, 6, 10, 11, 12], "Mercury": [6, 8, 9, 10, 11, 12],
        "Jupiter": [5, 6, 11, 12], "Venus": [6, 11, 12],
        "Saturn": [3, 5, 6, 11], "Lagna": [1, 3, 4, 6, 10, 11],
    },
}

# Trikona groups for Trikona Shodhana (signs sharing an element)
TRIKONA_GROUPS: List[List[int]] = [
    [0, 4, 8],   # Fire: Aries, Leo, Sagittarius
    [1, 5, 9],   # Earth: Taurus, Virgo, Capricorn
    [2, 6, 10],  # Air: Gemini, Libra, Aquarius
    [3, 7, 11],  # Water: Cancer, Scorpio, Pisces
]

# Lordship pairs for Ekadhipatya Shodhana (planets ruling 2 signs)
LORDSHIP_PAIRS: List[Tuple[int, int]] = [
    (0, 7),   # Mars: Aries, Scorpio
    (1, 6),   # Venus: Taurus, Libra
    (2, 5),   # Mercury: Gemini, Virgo
    (8, 11),  # Jupiter: Sagittarius, Pisces
    (9, 10),  # Saturn: Capricorn, Aquarius
]


# =============================================================================
# TRANSIT / GOCHARA
# =============================================================================

# Favorable transit houses from natal Moon for each planet
GOCHARA_FAVORABLE: Dict[str, List[int]] = {
    "Sun": [3, 6, 10, 11],
    "Moon": [1, 3, 6, 7, 10, 11],
    "Mars": [3, 6, 11],
    "Mercury": [2, 4, 6, 8, 10, 11],
    "Jupiter": [2, 5, 7, 9, 11],
    "Venus": [1, 2, 3, 4, 5, 8, 9, 11, 12],
    "Saturn": [3, 6, 11],
    "Rahu": [3, 6, 11],
    "Ketu": [3, 6, 11],
}

# Vedha table: {favorable_house: vedha_house}
# If planet transits a favorable house but another planet transits the vedha house,
# the favorable result is obstructed.
VEDHA_TABLE: Dict[str, Dict[int, int]] = {
    "Sun":     {3: 9, 6: 12, 10: 4, 11: 5},
    "Moon":    {1: 5, 3: 9, 6: 12, 7: 2, 10: 4, 11: 8},
    "Mars":    {3: 12, 6: 9, 11: 5},
    "Mercury": {2: 5, 4: 3, 6: 9, 8: 1, 10: 8, 11: 12},
    "Jupiter": {2: 12, 5: 4, 7: 3, 9: 10, 11: 8},
    "Venus":   {1: 8, 2: 7, 3: 1, 4: 10, 5: 9, 8: 5, 9: 11, 11: 3, 12: 6},
    "Saturn":  {3: 12, 6: 9, 11: 5},
    "Rahu":    {3: 12, 6: 9, 11: 5},
    "Ketu":    {3: 12, 6: 9, 11: 5},
}

# Planet pairs that never obstruct each other via Vedha
VEDHA_EXCEPTIONS: List[Tuple[str, str]] = [
    ("Sun", "Saturn"),
    ("Moon", "Mercury"),
]

# Sade Sati phase distances from natal Moon sign (0-indexed)
SADE_SATI_PHASES: Dict[int, Tuple[int, str]] = {
    11: (1, "Rising"),     # Saturn in 12th from Moon
    0: (2, "Peak"),        # Saturn in same sign as Moon
    1: (3, "Setting"),     # Saturn in 2nd from Moon
}

# Dhaiya (small Sade Sati) distances
DHAIYA_DISTANCES: Dict[int, str] = {
    3: "Kantak Shani (4th from Moon)",
    7: "Ashtam Shani (8th from Moon)",
}

# Jupiter and Saturn aspect offsets for Double Transit Theory
JUPITER_ASPECT_OFFSETS: List[int] = [0, 4, 6, 8]   # 1st, 5th, 7th, 9th
SATURN_ASPECT_OFFSETS: List[int] = [0, 2, 6, 9]     # 1st, 3rd, 7th, 10th


# =============================================================================
# NAISARGIKA BALA (Natural Strength) - fixed values for Shadbala
# =============================================================================

# Rank * (60/7) Virupas. Sun is strongest (60), Saturn weakest (8.571)
NAISARGIKA_BALA: Dict[str, float] = {
    "Sun": 60.0,
    "Moon": 360.0 / 7.0,      # 51.429
    "Venus": 300.0 / 7.0,     # 42.857
    "Jupiter": 240.0 / 7.0,   # 34.286
    "Mercury": 180.0 / 7.0,   # 25.714
    "Mars": 120.0 / 7.0,      # 17.143
    "Saturn": 60.0 / 7.0,     # 8.571
}

# Minimum Shadbala requirements in Rupas (Virupas / 60)
SHADBALA_MINIMUM_RUPAS: Dict[str, float] = {
    "Sun": 6.5,
    "Moon": 6.0,
    "Mars": 5.0,
    "Mercury": 7.0,
    "Jupiter": 6.5,
    "Venus": 5.5,
    "Saturn": 5.0,
}

# Dig Bala: which house cusp is each planet's strongest direction
# Value is the house number where the planet is strongest (1=ASC, 4=IC, 7=DSC, 10=MC)
DIG_BALA_STRONGEST: Dict[str, int] = {
    "Sun": 10,      # South (MC)
    "Moon": 4,      # North (IC)
    "Mars": 10,     # South (MC)
    "Mercury": 1,   # East (ASC)
    "Jupiter": 1,   # East (ASC)
    "Venus": 4,     # North (IC)
    "Saturn": 7,    # West (DSC)
}

# Drekkana Bala: which decanate (0-10, 10-20, 20-30) each gender is strong in
# Male planets = 1st decanate, Female = 2nd, Neutral = 3rd
PLANET_GENDER: Dict[str, str] = {
    "Sun": "male",
    "Moon": "female",
    "Mars": "male",
    "Mercury": "neutral",
    "Jupiter": "male",
    "Venus": "female",
    "Saturn": "neutral",
}


# =============================================================================
# KUNDALI MATCHING (ASHTAKOOTA)
# =============================================================================

# Varna by Rashi index (0=Aries..11=Pisces). 0=Brahmin, 1=Kshatriya, 2=Vaishya, 3=Shudra
VARNA_BY_RASHI: List[int] = [1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0]

# Vashya by Rashi. 0=Chatushpada, 1=Manava, 2=Jalachara, 3=Vanachara(Leo), 4=Keeta(Scorpio)
VASHYA_BY_RASHI: List[int] = [0, 0, 1, 2, 3, 1, 1, 4, 1, 0, 1, 2]

VASHYA_MATRIX: List[List[float]] = [
    [2.0, 1.0, 1.0, 1.5, 1.0],  # Chatushpada
    [1.0, 2.0, 1.5, 0.0, 1.0],  # Manava
    [1.0, 1.5, 2.0, 1.0, 1.0],  # Jalachara
    [0.0, 0.0, 0.0, 2.0, 0.0],  # Vanachara
    [1.0, 1.0, 1.0, 0.0, 2.0],  # Keeta
]

# Yoni animal index by nakshatra (0-26). 14 animals: 0=Horse..13=Lion
YONI_BY_NAKSHATRA: List[int] = [
    0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1
]

YONI_MATRIX: List[List[int]] = [
    [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 1, 3, 2, 1],  # Horse
    [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],  # Elephant
    [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],  # Sheep
    [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],  # Serpent
    [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],  # Dog
    [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],  # Cat
    [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],  # Rat
    [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],  # Cow
    [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],  # Buffalo
    [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],  # Tiger
    [1, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],  # Deer
    [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],  # Monkey
    [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],  # Mongoose
    [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],  # Lion
]

# Rashi lord planet index: 0=Sun,1=Moon,2=Mars,3=Mercury,4=Jupiter,5=Venus,6=Saturn
RASHI_LORD_INDEX: List[int] = [2, 5, 3, 1, 0, 3, 5, 2, 4, 6, 6, 4]

# Graha Maitri matrix [girl_lord][boy_lord], indexed by planet index
GRAHA_MAITRI_MATRIX: List[List[float]] = [
    [5.0, 5.0, 5.0, 4.0, 5.0, 0.0, 0.0],  # Sun
    [5.0, 5.0, 4.0, 1.0, 4.0, 0.5, 0.5],  # Moon
    [5.0, 4.0, 5.0, 0.5, 5.0, 3.0, 0.5],  # Mars
    [4.0, 1.0, 0.5, 5.0, 0.5, 5.0, 4.0],  # Mercury
    [5.0, 4.0, 5.0, 0.5, 5.0, 0.5, 3.0],  # Jupiter
    [0.0, 0.5, 3.0, 5.0, 0.5, 5.0, 5.0],  # Venus
    [0.0, 0.5, 0.5, 4.0, 3.0, 5.0, 5.0],  # Saturn
]

# Gana by nakshatra (0-26). 0=Deva, 1=Manushya, 2=Rakshasa
GANA_BY_NAKSHATRA: List[int] = [
    0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0
]

GANA_MATRIX: List[List[int]] = [
    [6, 6, 0],  # girl=Deva
    [5, 6, 0],  # girl=Manushya
    [1, 0, 6],  # girl=Rakshasa
]

# Bhakoot 12x12 matrix [girl_rashi][boy_rashi]. 0 = dosha (2/12, 5/9, 6/8), 7 = no dosha.
BHAKOOT_MATRIX: List[List[int]] = [
    [7, 0, 7, 7, 0, 0, 7, 0, 0, 7, 7, 0],
    [0, 7, 0, 7, 7, 0, 0, 7, 0, 0, 7, 7],
    [7, 0, 7, 0, 7, 7, 0, 0, 7, 0, 0, 7],
    [7, 7, 0, 7, 0, 7, 7, 0, 0, 7, 0, 0],
    [0, 7, 7, 0, 7, 0, 7, 7, 0, 0, 7, 0],
    [0, 0, 7, 7, 0, 7, 0, 7, 7, 0, 0, 7],
    [7, 0, 0, 7, 7, 0, 7, 0, 7, 7, 0, 0],
    [0, 7, 0, 0, 7, 7, 0, 7, 0, 7, 7, 0],
    [0, 0, 7, 0, 0, 7, 7, 0, 7, 0, 7, 7],
    [7, 0, 0, 7, 0, 0, 7, 7, 0, 7, 0, 7],
    [7, 7, 0, 0, 7, 0, 0, 7, 7, 0, 7, 0],
    [0, 7, 7, 0, 0, 7, 0, 0, 7, 7, 0, 7],
]

# Nadi by nakshatra (0-26). 0=Aadi(Vata), 1=Madhya(Pitta), 2=Antya(Kapha)
NADI_BY_NAKSHATRA: List[int] = [
    0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2
]

# Mangal Dosha houses (Mars in these houses from Lagna/Moon/Venus = Manglik)
MANGAL_DOSHA_HOUSES: List[int] = [1, 2, 4, 7, 8, 12]


# =============================================================================
# MUHURTA (ELECTIONAL ASTROLOGY)
# =============================================================================

# Inauspicious period segments (1-indexed from sunrise). Day split into 8 equal parts.
# Index: 0=Sunday..6=Saturday
RAHUKAAL_SEGMENT: List[int] = [8, 2, 7, 5, 6, 4, 3]
YAMAGANDAM_SEGMENT: List[int] = [5, 4, 3, 2, 1, 7, 6]
GULIKA_SEGMENT: List[int] = [7, 6, 5, 4, 3, 2, 1]

# Chaldean order for planetary hours
CHALDEAN_ORDER: List[str] = [
    "Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"
]

# Weekday planet rulers (index 0=Sunday..6=Saturday)
WEEKDAY_PLANET: List[str] = [
    "Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"
]

# Choghadiya planet order and types
CHOGHADIYA_PLANET_ORDER: List[str] = [
    "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"
]

CHOGHADIYA_TYPE: Dict[str, str] = {
    "Sun": "Udveg",
    "Venus": "Char",
    "Mercury": "Labh",
    "Moon": "Amrit",
    "Saturn": "Kaal",
    "Jupiter": "Shubh",
    "Mars": "Rog",
}

CHOGHADIYA_NATURE: Dict[str, str] = {
    "Amrit": "Most Auspicious",
    "Shubh": "Auspicious",
    "Labh": "Auspicious",
    "Char": "Neutral",
    "Udveg": "Inauspicious",
    "Kaal": "Inauspicious",
    "Rog": "Inauspicious",
}


# =============================================================================
# YOGINI DASHA (36-year cycle)
# =============================================================================

# (Yogini name, ruling planet, duration in years)
YOGINI_DASHAS: List[Tuple[str, str, int]] = [
    ("Mangala", "Moon", 1),
    ("Pingala", "Sun", 2),
    ("Dhanya", "Jupiter", 3),
    ("Bhramari", "Mars", 4),
    ("Bhadrika", "Mercury", 5),
    ("Ulka", "Saturn", 6),
    ("Siddha", "Venus", 7),
    ("Sankata", "Rahu", 8),
]

YOGINI_TOTAL_YEARS: int = 36
