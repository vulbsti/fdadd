"""Pydantic data models for Vedic astrology calculations."""

from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class BirthData(BaseModel):
    """Input model for birth details."""

    name: str = Field(..., min_length=1, description="Name of the person")
    birth_date: date = Field(..., description="Birth date")
    birth_time: datetime = Field(..., description="Birth date and time")
    latitude: float = Field(..., ge=-90, le=90, description="Birth place latitude")
    longitude: float = Field(..., ge=-180, le=180, description="Birth place longitude")
    timezone: str = Field(..., description="IANA timezone string (e.g., 'Asia/Kolkata')")
    place_name: Optional[str] = Field(None, description="Name of birth place")


class PlanetPosition(BaseModel):
    """Position of a planet in the chart."""

    planet: str = Field(..., description="Planet name")
    sign: str = Field(..., description="Zodiac sign name")
    sign_index: int = Field(..., ge=0, le=11, description="Sign index (0-11)")
    degree: float = Field(..., ge=0, lt=30, description="Degree within sign (0-30)")
    absolute_degree: float = Field(
        ..., ge=0, lt=360, description="Absolute sidereal longitude (0-360)"
    )
    nakshatra: str = Field(..., description="Nakshatra name")
    nakshatra_index: int = Field(..., ge=0, le=26, description="Nakshatra index (0-26)")
    pada: int = Field(..., ge=1, le=4, description="Nakshatra pada (1-4)")
    house: int = Field(..., ge=1, le=12, description="House placement (1-12)")
    dignity: Optional[str] = Field(None, description="Planetary dignity state")
    retrograde: bool = Field(False, description="Whether planet is retrograde")
    nakshatra_lord: str = Field(..., description="Lord of the nakshatra")


class HouseCusp(BaseModel):
    """House cusp information."""

    house: int = Field(..., ge=1, le=12, description="House number (1-12)")
    sign: str = Field(..., description="Zodiac sign on cusp")
    sign_index: int = Field(..., ge=0, le=11, description="Sign index (0-11)")
    degree: float = Field(..., ge=0, lt=30, description="Degree of cusp in sign")
    lord: str = Field(..., description="Lord of the sign on this house")


class DivisionalPosition(BaseModel):
    """Position in a divisional chart."""

    planet: str = Field(..., description="Planet name")
    sign: str = Field(..., description="Sign in divisional chart")
    sign_index: int = Field(..., ge=0, le=11, description="Sign index (0-11)")


class DivisionalChart(BaseModel):
    """A complete divisional chart."""

    chart_type: str = Field(..., description="Chart type (D1, D2, D9, etc.)")
    name: str = Field(..., description="Chart name (Rashi, Hora, Navamsa, etc.)")
    description: str = Field(..., description="What this chart represents")
    positions: List[DivisionalPosition] = Field(
        ..., description="Planetary positions in this chart"
    )
    ascendant: Optional[DivisionalPosition] = Field(
        None, description="Ascendant in this chart"
    )


class DashaPeriod(BaseModel):
    """A single dasha period."""

    planet: str = Field(..., description="Planet ruling this period")
    start_date: date = Field(..., description="Start date of this period")
    end_date: date = Field(..., description="End date of this period")
    level: int = Field(
        ..., ge=1, le=5, description="Level: 1=Mahadasha, 2=Antardasha, 3=Pratyantar, 4=Sookshma, 5=Praana"
    )
    duration_years: float = Field(..., description="Duration in years")


class Yoga(BaseModel):
    """A detected yoga (planetary combination)."""

    name: str = Field(..., description="Name of the yoga")
    type: str = Field(..., description="Yoga type (Mahapurusha, Raja, Dhana, etc.)")
    planets_involved: List[str] = Field(..., description="Planets forming this yoga")
    houses_involved: List[int] = Field(..., description="Houses involved")
    description: str = Field(..., description="Description of the yoga and its effects")
    strength: Optional[float] = Field(
        None, ge=0, le=100, description="Yoga strength percentage"
    )


class PlanetaryRelationship(BaseModel):
    """Relationship between two planets."""

    planet1: str = Field(..., description="First planet")
    planet2: str = Field(..., description="Second planet")
    natural: str = Field(
        ..., description="Natural relationship (friend, neutral, enemy)"
    )
    temporary: str = Field(..., description="Temporary relationship based on position")
    compound: str = Field(
        ..., description="Combined relationship (best_friend, friend, neutral, enemy, bitter_enemy)"
    )


class LagnaChart(BaseModel):
    """Complete D1 Rashi (Lagna) chart."""

    ascendant: HouseCusp = Field(..., description="Ascendant details")
    planets: List[PlanetPosition] = Field(..., description="All planetary positions")
    houses: List[HouseCusp] = Field(..., description="All 12 house cusps")
    ayanamsa: float = Field(..., description="Ayanamsa value used")
    ayanamsa_name: str = Field("Lahiri", description="Name of ayanamsa system")


class DashaTimeline(BaseModel):
    """Complete dasha timeline."""

    birth_nakshatra: str = Field(..., description="Birth nakshatra (Moon's nakshatra)")
    nakshatra_lord: str = Field(..., description="Lord of birth nakshatra")
    balance_at_birth: float = Field(
        ..., description="Balance of first dasha at birth (years)"
    )
    mahadashas: List[DashaPeriod] = Field(..., description="Mahadasha periods")
    current_mahadasha: Optional[DashaPeriod] = Field(
        None, description="Currently running Mahadasha"
    )
    current_antardasha: Optional[DashaPeriod] = Field(
        None, description="Currently running Antardasha"
    )
    antardashas: List[DashaPeriod] = Field(
        default_factory=list, description="Antardasha periods (for current mahadasha)"
    )


class Aspect(BaseModel):
    """A planetary aspect (Graha Drishti)."""

    aspecting_planet: str = Field(..., description="Planet casting the aspect")
    aspected_planet: str = Field(..., description="Planet receiving the aspect")
    aspecting_sign_index: int = Field(..., ge=0, le=11, description="Sign of aspecting planet")
    aspected_sign_index: int = Field(..., ge=0, le=11, description="Sign of aspected planet")
    house_distance: int = Field(..., ge=1, le=12, description="House distance from aspecting to aspected")
    strength: float = Field(..., ge=0, le=100, description="Aspect strength percentage")
    is_special: bool = Field(False, description="Whether this is a special aspect (Mars 4/8, Jupiter 5/9, Saturn 3/10)")


class CombustionStatus(BaseModel):
    """Combustion (Asta) status of a planet."""

    planet: str = Field(..., description="Planet name")
    is_combust: bool = Field(..., description="Whether the planet is combust")
    distance_from_sun: float = Field(..., ge=0, le=180, description="Angular distance from Sun in degrees")
    threshold: float = Field(..., ge=0, description="Combustion threshold for this planet")


class Panchanga(BaseModel):
    """Panchanga (five limbs of Vedic calendar) for a given moment."""

    tithi_number: int = Field(..., ge=1, le=30, description="Tithi number (1-30)")
    tithi_name: str = Field(..., description="Tithi name (e.g., 'Shukla Panchami')")
    paksha: str = Field(..., description="Shukla (waxing) or Krishna (waning)")
    nithya_yoga_number: int = Field(..., ge=1, le=27, description="Nithya Yoga number (1-27)")
    nithya_yoga_name: str = Field(..., description="Nithya Yoga name")
    karana_number: int = Field(..., ge=1, le=60, description="Karana number (1-60)")
    karana_name: str = Field(..., description="Karana name")
    vara: str = Field(..., description="Weekday name")
    vara_lord: str = Field(..., description="Lord of the weekday")
    nakshatra: str = Field(..., description="Moon's nakshatra")
    nakshatra_lord: str = Field(..., description="Lord of Moon's nakshatra")


class BhavaPosition(BaseModel):
    """A planet's position in the Bhava Chalit chart."""

    planet: str = Field(..., description="Planet name")
    rashi_house: int = Field(..., ge=1, le=12, description="House in Rashi (Whole Sign) chart")
    bhava_house: int = Field(..., ge=1, le=12, description="House in Bhava Chalit chart")
    has_shifted: bool = Field(False, description="Whether planet shifted between Rashi and Chalit")


class BhavaChalitChart(BaseModel):
    """Bhava Chalit chart with house cusps and planet placements."""

    ascendant_abs: float = Field(..., ge=0, lt=360, description="Ascendant absolute degree")
    house_cusps: List[float] = Field(..., description="12 house start (cusp) degrees, absolute (0-360)")
    positions: List[BhavaPosition] = Field(..., description="Planet positions in Chalit chart")


class BoundaryPlanet(BaseModel):
    """A planet near a Bhava Chalit house boundary that shifts with small time changes."""

    planet: str = Field(..., description="Planet name")
    rashi_house: int = Field(..., ge=1, le=12, description="House in Rashi chart")
    base_bhava_house: int = Field(..., ge=1, le=12, description="Bhava house at base time")
    flipped_bhava_house: int = Field(..., ge=1, le=12, description="Bhava house at flip offset")
    flip_offset_minutes: int = Field(..., description="Smallest offset (minutes) where flip occurs")
    margin_arcminutes: float = Field(..., ge=0, description="Distance to nearest cusp in arcminutes")
    boundary_description: str = Field(..., description="e.g. '10th/11th'")


class DivisionalLagnaSensitivity(BaseModel):
    """Sensitivity of a divisional chart's lagna to birth time changes."""

    chart_type: str = Field(..., description="Chart type (D9, D10, etc.)")
    base_sign: str = Field(..., description="Lagna sign at base time")
    changes_at: List[Dict] = Field(
        default_factory=list,
        description="Offsets where lagna changes, e.g. [{'offset': -5, 'new_sign': 'Sagittarius'}]",
    )


class DashaShift(BaseModel):
    """How Mahadasha start dates shift with birth time changes."""

    planet: str = Field(..., description="Mahadasha lord")
    base_start_date: date = Field(..., description="Start date at base time")
    max_shift_days: int = Field(..., description="Maximum shift in days at extreme offset")
    shift_direction: str = Field(..., description="'earlier' or 'later' at positive offset")


class OffsetSnapshot(BaseModel):
    """Chart data at a specific time offset."""

    offset_minutes: int = Field(..., description="Offset from base time in minutes")
    ascendant_abs: float = Field(..., ge=0, lt=360, description="Ascendant absolute degree")
    ascendant_sign: str = Field(..., description="Ascendant sign name")
    bhava_positions: List[BhavaPosition] = Field(..., description="Bhava Chalit positions")
    d9_lagna_sign: str = Field(..., description="D9 Navamsa lagna sign")
    divisional_lagnas: Dict[str, str] = Field(
        default_factory=dict, description="Chart type -> lagna sign"
    )


class SensitivityReport(BaseModel):
    """Complete sensitivity analysis across multiple time offsets."""

    birth_data: BirthData = Field(..., description="Base birth data")
    offsets_tested: List[int] = Field(..., description="Offsets tested in minutes")
    snapshots: List[OffsetSnapshot] = Field(..., description="Chart data at each offset")
    boundary_planets: List[BoundaryPlanet] = Field(
        default_factory=list, description="Planets near Bhava Chalit boundaries"
    )
    d9_sensitivity: Optional[DivisionalLagnaSensitivity] = Field(
        None, description="D9 Navamsa lagna sensitivity"
    )
    all_divisional_sensitivity: List[DivisionalLagnaSensitivity] = Field(
        default_factory=list, description="All divisional chart sensitivities"
    )
    dasha_shifts: List[DashaShift] = Field(
        default_factory=list, description="Dasha date shifts at extreme offsets"
    )
    ascendant_rate_deg_per_min: float = Field(
        ..., description="Ascendant movement rate in degrees per minute"
    )


class KootaScore(BaseModel):
    """Score for a single Ashtakoota factor."""

    koota: str = Field(..., description="Koota name (Varna, Vashya, etc.)")
    score: float = Field(..., ge=0, description="Points scored")
    max_score: float = Field(..., description="Maximum possible points")
    description: str = Field("", description="Details about the scoring")


class KundaliMatchResult(BaseModel):
    """Complete Kundali matching result."""

    boy_nakshatra: str = Field(..., description="Boy's Moon nakshatra")
    girl_nakshatra: str = Field(..., description="Girl's Moon nakshatra")
    boy_rashi: str = Field(..., description="Boy's Moon rashi")
    girl_rashi: str = Field(..., description="Girl's Moon rashi")
    koota_scores: List[KootaScore] = Field(..., description="Individual koota scores")
    total_score: float = Field(..., ge=0, le=36, description="Total score out of 36")
    is_manglik_boy: bool = Field(False, description="Boy has Mangal Dosha")
    is_manglik_girl: bool = Field(False, description="Girl has Mangal Dosha")
    recommendation: str = Field(..., description="Overall recommendation")


class MuhurtaPeriod(BaseModel):
    """A time period in Muhurta calculations."""

    name: str = Field(..., description="Period name (e.g., 'Rahukaal', 'Amrit')")
    start_minutes_from_sunrise: float = Field(..., description="Start time in minutes from sunrise")
    end_minutes_from_sunrise: float = Field(..., description="End time in minutes from sunrise")
    nature: str = Field(..., description="Auspicious/Inauspicious/Neutral")
    lord: str = Field("", description="Ruling planet")


class YoginiDashaPeriod(BaseModel):
    """A single Yogini Dasha period."""

    yogini_name: str = Field(..., description="Yogini name (Mangala, Pingala, etc.)")
    planet: str = Field(..., description="Ruling planet")
    start_date: date = Field(..., description="Start date")
    end_date: date = Field(..., description="End date")
    duration_years: int = Field(..., description="Duration in years")


class AshtakavargaChart(BaseModel):
    """Ashtakavarga bindu charts."""

    bav: Dict[str, List[int]] = Field(
        ..., description="Bhinnashtakavarga: planet -> 12 bindus per sign"
    )
    sav: List[int] = Field(
        ..., description="Sarvashtakavarga: 12 values (one per sign), total=337"
    )


class TransitResult(BaseModel):
    """Result of a single planet's transit analysis."""

    planet: str = Field(..., description="Transiting planet name")
    transit_sign: str = Field(..., description="Current transit sign name")
    transit_sign_index: int = Field(..., ge=0, le=11, description="Transit sign index")
    house_from_moon: int = Field(..., ge=1, le=12, description="House from natal Moon")
    is_favorable: bool = Field(..., description="Whether transit house is favorable")
    is_vedha_obstructed: bool = Field(
        False, description="Whether favorable result is obstructed by Vedha"
    )
    vedha_planet: Optional[str] = Field(
        None, description="Planet causing Vedha obstruction"
    )


class SadeSatiStatus(BaseModel):
    """Sade Sati or Dhaiya status."""

    is_active: bool = Field(..., description="Whether Sade Sati or Dhaiya is active")
    type: Optional[str] = Field(
        None, description="'sade_sati' or 'dhaiya'"
    )
    phase: Optional[int] = Field(
        None, description="Phase 1=Rising, 2=Peak, 3=Setting (Sade Sati only)"
    )
    phase_name: Optional[str] = Field(None, description="Phase description")
    saturn_sign: Optional[str] = Field(None, description="Saturn's current sign")
    natal_moon_sign: Optional[str] = Field(None, description="Natal Moon's sign")


class ShadBala(BaseModel):
    """Shadbala (six-fold strength) for a planet."""

    planet: str = Field(..., description="Planet name")
    sthana_bala: float = Field(..., description="Positional strength (Virupas)")
    dig_bala: float = Field(..., description="Directional strength (Virupas)")
    kaala_bala: float = Field(..., description="Temporal strength (Virupas)")
    cheshta_bala: float = Field(..., description="Motional strength (Virupas)")
    naisargika_bala: float = Field(..., description="Natural strength (Virupas)")
    drig_bala: float = Field(..., description="Aspectual strength (Virupas, can be negative)")
    total_virupas: float = Field(..., description="Total Shadbala in Virupas")
    total_rupas: float = Field(..., description="Total Shadbala in Rupas (virupas/60)")
    is_strong: bool = Field(..., description="Meets minimum required Shadbala")
    minimum_required: float = Field(..., description="Minimum required Rupas for this planet")


class FullChart(BaseModel):
    """Complete Vedic chart analysis."""

    birth_data: BirthData = Field(..., description="Birth data input")
    lagna_chart: LagnaChart = Field(..., description="D1 Rashi chart")
    divisional_charts: Dict[str, DivisionalChart] = Field(
        ..., description="All divisional charts (D2, D3, D4, D7, D9, D10, D12, D30, D60)"
    )
    yogas: List[Yoga] = Field(..., description="Detected yogas")
    dasha_timeline: DashaTimeline = Field(..., description="Vimshottari dasha timeline")
    planetary_relationships: List[PlanetaryRelationship] = Field(
        default_factory=list, description="Relationships between planets"
    )
    aspects: List[Aspect] = Field(
        default_factory=list, description="Planetary aspects (Graha Drishti)"
    )
    combustion: List[CombustionStatus] = Field(
        default_factory=list, description="Combustion status of planets"
    )
    panchanga: Optional[Panchanga] = Field(
        None, description="Panchanga for the birth moment"
    )
    bhava_chalit: Optional[BhavaChalitChart] = Field(
        None, description="Bhava Chalit chart"
    )
    ashtakavarga: Optional[AshtakavargaChart] = Field(
        None, description="Ashtakavarga bindu charts"
    )
    shadbala: List[ShadBala] = Field(
        default_factory=list, description="Shadbala for each planet"
    )
