"""
Chart Service - Main orchestration layer.

This service coordinates all calculations to generate complete
Vedic astrology charts from birth data.
"""

from typing import Dict, List

from ..calculations.aspects import calculate_all_aspects
from ..calculations.ashtakavarga import calculate_ashtakavarga
from ..calculations.bhava_chalit import calculate_bhava_chalit
from ..calculations.combustion import calculate_combustion
from ..calculations.dignity import calculate_dignity
from ..calculations.shadbala import calculate_shadbala
from ..calculations.divisional import generate_all_divisional_charts
from ..calculations.nakshatra import calculate_nakshatra
from ..calculations.panchanga import calculate_panchanga
from ..calculations.relationships import calculate_all_relationships
from ..core.constants import RASHI_LORDS, RASHI_NAMES
from ..core.models import (
    BirthData,
    DivisionalChart,
    DivisionalPosition,
    FullChart,
    HouseCusp,
    LagnaChart,
    PlanetPosition,
)
from ..dashas.vimshottari import generate_dasha_timeline
from ..ephemeris.kerykeion_adapter import KerykeionAdapter
from ..yogas.detector import YogaEngine


class ChartService:
    """
    Main service for generating complete Vedic charts.

    This service coordinates:
    - Ephemeris calculations (planetary positions)
    - Nakshatra calculations
    - Dignity assessments
    - Divisional charts
    - Dasha timeline
    - Yoga detection
    - Planetary relationships
    """

    def __init__(self, ayanamsa: str = "LAHIRI"):
        """
        Initialize the chart service.

        Args:
            ayanamsa: Ayanamsa system to use (default: LAHIRI)
        """
        self.ephemeris = KerykeionAdapter(sidereal_mode=ayanamsa)
        self.yoga_engine = YogaEngine()
        self.ayanamsa_name = ayanamsa

    def generate_full_chart(self, birth_data: BirthData) -> FullChart:
        """
        Generate complete Vedic chart analysis.

        Args:
            birth_data: Birth details (date, time, location)

        Returns:
            FullChart object with all calculations
        """
        # 1. Get raw planetary positions from ephemeris
        raw_positions = self.ephemeris.get_planet_positions(birth_data)
        ascendant_data = self.ephemeris.get_ascendant(birth_data)
        house_cusps = self.ephemeris.get_house_cusps(birth_data)
        ayanamsa = self.ephemeris.get_ayanamsa(birth_data)

        # 2. Build planet positions with Vedic calculations
        planets = self._build_planet_positions(raw_positions)

        # 3. Build house cusps
        houses = self._build_house_cusps(house_cusps)

        # 4. Build ascendant
        ascendant = HouseCusp(
            house=1,
            sign=ascendant_data["sign"],
            sign_index=ascendant_data["sign_index"],
            degree=ascendant_data["degree"],
            lord=ascendant_data["lord"],
        )

        # 5. Create Lagna Chart
        lagna_chart = LagnaChart(
            ascendant=ascendant,
            planets=planets,
            houses=houses,
            ayanamsa=ayanamsa,
            ayanamsa_name=self.ayanamsa_name,
        )

        # 6. Generate divisional charts
        divisional_charts = self._generate_divisional_charts(raw_positions, ascendant_data)

        # 7. Detect yogas
        yogas = self.yoga_engine.detect_all(lagna_chart)

        # 8. Generate dasha timeline
        moon_longitude = raw_positions.get("Moon", {}).get("abs_pos", 0.0)
        dasha_timeline = generate_dasha_timeline(
            moon_longitude, birth_data.birth_date, years_forward=120
        )

        # 9. Calculate planetary relationships
        relationships = calculate_all_relationships(raw_positions)

        # 10. Calculate planetary aspects
        aspects = calculate_all_aspects(raw_positions)

        # 11. Calculate combustion
        combustion = calculate_combustion(raw_positions)

        # 12. Calculate Panchanga
        moon_planet = next(
            (p for p in planets if p.planet == "Moon"), None
        )
        sun_longitude = raw_positions.get("Sun", {}).get("abs_pos", 0.0)
        panchanga = calculate_panchanga(
            moon_longitude=moon_longitude,
            sun_longitude=sun_longitude,
            birth_date=birth_data.birth_date,
            moon_nakshatra=moon_planet.nakshatra if moon_planet else "Ashwini",
            moon_nakshatra_lord=moon_planet.nakshatra_lord if moon_planet else "Ketu",
        )

        # 13. Calculate Bhava Chalit
        ascendant_abs = ascendant_data.get("abs_pos", 0.0)
        bhava_chalit = calculate_bhava_chalit(ascendant_abs, raw_positions)

        # 14. Calculate Ashtakavarga
        asc_sign_index = ascendant_data.get("sign_index", 0)
        ashtakavarga = calculate_ashtakavarga(raw_positions, asc_sign_index)

        # 15. Calculate Shadbala
        shadbala = calculate_shadbala(lagna_chart, divisional_charts, panchanga)

        return FullChart(
            birth_data=birth_data,
            lagna_chart=lagna_chart,
            divisional_charts=divisional_charts,
            yogas=yogas,
            dasha_timeline=dasha_timeline,
            planetary_relationships=relationships,
            aspects=aspects,
            combustion=combustion,
            panchanga=panchanga,
            bhava_chalit=bhava_chalit,
            ashtakavarga=ashtakavarga,
            shadbala=shadbala,
        )

    def _build_planet_positions(
        self, raw_positions: Dict[str, Dict]
    ) -> List[PlanetPosition]:
        """
        Build enriched planet positions with nakshatras and dignities.

        Args:
            raw_positions: Raw planetary data from ephemeris

        Returns:
            List of PlanetPosition objects
        """
        planets = []

        for planet_name, pos in raw_positions.items():
            # Calculate nakshatra
            nak_idx, nak_name, pada, nak_lord = calculate_nakshatra(
                pos.get("abs_pos", 0.0)
            )

            # Calculate dignity
            dignity = calculate_dignity(
                planet_name,
                pos.get("sign_index", 0),
                pos.get("degree", 0.0),
            )

            planets.append(
                PlanetPosition(
                    planet=planet_name,
                    sign=pos.get("sign", "Aries"),
                    sign_index=pos.get("sign_index", 0),
                    degree=pos.get("degree", 0.0),
                    absolute_degree=pos.get("abs_pos", 0.0),
                    nakshatra=nak_name,
                    nakshatra_index=nak_idx,
                    pada=pada,
                    house=pos.get("house", 1),
                    dignity=dignity.value if dignity else None,
                    retrograde=pos.get("retrograde", False),
                    nakshatra_lord=nak_lord,
                )
            )

        return planets

    def _build_house_cusps(self, house_data: List[Dict]) -> List[HouseCusp]:
        """
        Build house cusp objects.

        Args:
            house_data: Raw house cusp data from ephemeris

        Returns:
            List of HouseCusp objects
        """
        houses = []

        for h in house_data:
            houses.append(
                HouseCusp(
                    house=h["house"],
                    sign=h["sign"],
                    sign_index=h["sign_index"],
                    degree=h.get("degree", 0.0),
                    lord=h["lord"],
                )
            )

        return houses

    def _generate_divisional_charts(
        self, raw_positions: Dict[str, Dict], ascendant_data: Dict
    ) -> Dict[str, DivisionalChart]:
        """
        Generate all divisional charts.

        Args:
            raw_positions: Raw planetary positions
            ascendant_data: Ascendant data

        Returns:
            Dict mapping chart types to DivisionalChart objects
        """
        from ..calculations.divisional import (
            DIVISIONAL_NAMES,
            calculate_divisional_sign,
        )

        charts = {}

        # Chart types to generate (excluding D1 which is the main chart)
        chart_types = ["D2", "D3", "D4", "D7", "D9", "D10", "D12", "D30", "D60"]

        for chart_type in chart_types:
            name, description = DIVISIONAL_NAMES.get(chart_type, ("Unknown", "Unknown"))

            positions = []
            for planet_name, pos in raw_positions.items():
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

            # Calculate ascendant for divisional chart
            asc_sign_index = ascendant_data.get("sign_index", 0)
            asc_degree = ascendant_data.get("degree", 0.0)
            div_asc_index = calculate_divisional_sign(chart_type, asc_sign_index, asc_degree)

            charts[chart_type] = DivisionalChart(
                chart_type=chart_type,
                name=name,
                description=description,
                positions=positions,
                ascendant=DivisionalPosition(
                    planet="Ascendant",
                    sign=RASHI_NAMES[div_asc_index],
                    sign_index=div_asc_index,
                ),
            )

        return charts

    def get_current_dasha(self, birth_data: BirthData) -> str:
        """
        Get the current running dasha period.

        Args:
            birth_data: Birth details

        Returns:
            String like "Venus-Mars" indicating current Mahadasha-Antardasha
        """
        raw_positions = self.ephemeris.get_planet_positions(birth_data)
        moon_longitude = raw_positions.get("Moon", {}).get("abs_pos", 0.0)

        dasha_timeline = generate_dasha_timeline(
            moon_longitude, birth_data.birth_date, years_forward=50
        )

        if dasha_timeline.current_mahadasha:
            md = dasha_timeline.current_mahadasha.planet
            if dasha_timeline.current_antardasha:
                ad = dasha_timeline.current_antardasha.planet
                return f"{md}-{ad}"
            return md

        return "Unknown"
