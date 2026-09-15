"""Type-safe enumerations for Vedic astrology."""

from enum import Enum, IntEnum


class Planet(str, Enum):
    """The nine Vedic planets (Navagrahas)."""

    SUN = "Sun"
    MOON = "Moon"
    MARS = "Mars"
    MERCURY = "Mercury"
    JUPITER = "Jupiter"
    VENUS = "Venus"
    SATURN = "Saturn"
    RAHU = "Rahu"
    KETU = "Ketu"


class Rashi(IntEnum):
    """The 12 zodiac signs (Rashis) with their indices."""

    ARIES = 0
    TAURUS = 1
    GEMINI = 2
    CANCER = 3
    LEO = 4
    VIRGO = 5
    LIBRA = 6
    SCORPIO = 7
    SAGITTARIUS = 8
    CAPRICORN = 9
    AQUARIUS = 10
    PISCES = 11


class SignQuality(str, Enum):
    """Sign quality types used for divisional chart calculations."""

    MOVABLE = "Movable"  # Chara - Aries, Cancer, Libra, Capricorn
    FIXED = "Fixed"  # Sthira - Taurus, Leo, Scorpio, Aquarius
    DUAL = "Dual"  # Dvisvabhava - Gemini, Virgo, Sagittarius, Pisces


class Dignity(str, Enum):
    """Planetary dignity states."""

    EXALTED = "Exalted"
    MOOLATRIKONA = "Moolatrikona"
    OWN_SIGN = "Own Sign"
    FRIEND = "Friend"
    NEUTRAL = "Neutral"
    ENEMY = "Enemy"
    DEBILITATED = "Debilitated"


class Nakshatra(IntEnum):
    """The 27 Nakshatras (lunar mansions)."""

    ASHWINI = 0
    BHARANI = 1
    KRITTIKA = 2
    ROHINI = 3
    MRIGASHIRA = 4
    ARDRA = 5
    PUNARVASU = 6
    PUSHYA = 7
    ASHLESHA = 8
    MAGHA = 9
    PURVA_PHALGUNI = 10
    UTTARA_PHALGUNI = 11
    HASTA = 12
    CHITRA = 13
    SWATI = 14
    VISHAKHA = 15
    ANURADHA = 16
    JYESHTHA = 17
    MULA = 18
    PURVA_ASHADHA = 19
    UTTARA_ASHADHA = 20
    SHRAVANA = 21
    DHANISHTA = 22
    SHATABHISHA = 23
    PURVA_BHADRAPADA = 24
    UTTARA_BHADRAPADA = 25
    REVATI = 26


class DivisionalChart(str, Enum):
    """Divisional chart types (Vargas)."""

    D1 = "D1"  # Rashi - Main chart
    D2 = "D2"  # Hora - Wealth
    D3 = "D3"  # Drekkana - Siblings/Courage
    D4 = "D4"  # Chaturthamsa - Property/Fortune
    D7 = "D7"  # Saptamsa - Children
    D9 = "D9"  # Navamsa - Spouse/Dharma
    D10 = "D10"  # Dasamsa - Career
    D12 = "D12"  # Dwadasamsa - Parents
    D30 = "D30"  # Trimsamsa - Misfortune
    D60 = "D60"  # Shashtiamsa - Past Karma


class DashaLevel(IntEnum):
    """Dasha period levels."""

    MAHADASHA = 1
    ANTARDASHA = 2
    PRATYANTARDASHA = 3


class AspectType(str, Enum):
    """Types of planetary aspect."""

    FULL = "Full"
    THREE_QUARTER = "Three Quarter"
    HALF = "Half"
    QUARTER = "Quarter"
