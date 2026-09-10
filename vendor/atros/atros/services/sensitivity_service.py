"""
Sensitivity Service — Birth time sensitivity analysis.

Runs chart calculations at multiple time offsets to identify:
- Boundary planets (near Bhava Chalit house boundaries)
- Divisional chart lagna sensitivity (D9, D10, etc.)
- Dasha date shifts
- Ascendant movement rate

Used for birth time rectification to determine which planets
and chart features are sensitive to small birth time changes.
"""

from datetime import timedelta
from typing import Dict, List, Optional

from ..calculations.bhava_chalit import get_house_cusps
from ..core.models import (
    BhavaPosition,
    BirthData,
    BoundaryPlanet,
    DashaShift,
    DivisionalLagnaSensitivity,
    FullChart,
    OffsetSnapshot,
    SensitivityReport,
)
from .chart_service import ChartService


def _angular_distance(a: float, b: float) -> float:
    """Shortest angular distance between two degrees on a circle.

    Handles the 360/0 wrap-around correctly.

    Args:
        a: First angle in degrees (0-360).
        b: Second angle in degrees (0-360).

    Returns:
        Shortest distance in degrees (0-180).
    """
    d = abs(a - b) % 360
    return min(d, 360 - d)


def _nearest_cusp_margin(planet_abs: float, cusps: List[float]) -> tuple[float, int]:
    """Find the nearest Bhava Chalit cusp and the distance to it.

    Args:
        planet_abs: Planet's absolute sidereal longitude.
        cusps: List of 12 house cusp start degrees.

    Returns:
        Tuple of (margin_in_arcminutes, cusp_house_number).
        The cusp_house_number is the house that STARTS at that cusp (1-12).
    """
    min_dist = 360.0
    nearest_house = 1

    for i, cusp in enumerate(cusps):
        dist = _angular_distance(planet_abs, cusp)
        if dist < min_dist:
            min_dist = dist
            nearest_house = i + 1

    return min_dist * 60.0, nearest_house


def _extract_snapshot(chart: FullChart, offset: int) -> OffsetSnapshot:
    """Extract an OffsetSnapshot from a FullChart.

    Args:
        chart: Complete chart at a given time offset.
        offset: The offset in minutes from base time.

    Returns:
        OffsetSnapshot with key data extracted.
    """
    asc = chart.lagna_chart.ascendant
    asc_abs = chart.bhava_chalit.ascendant_abs if chart.bhava_chalit else 0.0

    bhava_positions = chart.bhava_chalit.positions if chart.bhava_chalit else []

    d9_lagna_sign = ""
    divisional_lagnas: Dict[str, str] = {}
    for chart_type, div_chart in chart.divisional_charts.items():
        if div_chart.ascendant:
            divisional_lagnas[chart_type] = div_chart.ascendant.sign
            if chart_type == "D9":
                d9_lagna_sign = div_chart.ascendant.sign

    return OffsetSnapshot(
        offset_minutes=offset,
        ascendant_abs=asc_abs,
        ascendant_sign=asc.sign,
        bhava_positions=bhava_positions,
        d9_lagna_sign=d9_lagna_sign,
        divisional_lagnas=divisional_lagnas,
    )


def _detect_boundary_planets(
    base_snapshot: OffsetSnapshot,
    all_snapshots: List[OffsetSnapshot],
    base_chart: FullChart,
) -> List[BoundaryPlanet]:
    """Detect planets that change Bhava Chalit house at any tested offset.

    Args:
        base_snapshot: Snapshot at offset 0.
        all_snapshots: All snapshots including base.
        base_chart: Full chart at base time (for cusp and position data).

    Returns:
        List of BoundaryPlanet objects, sorted by margin.
    """
    if not base_chart.bhava_chalit:
        return []

    cusps = base_chart.bhava_chalit.house_cusps
    base_positions = {p.planet: p for p in base_snapshot.bhava_positions}

    boundary_planets: Dict[str, BoundaryPlanet] = {}

    for snapshot in all_snapshots:
        if snapshot.offset_minutes == 0:
            continue

        offset_positions = {p.planet: p for p in snapshot.bhava_positions}

        for planet_name, base_pos in base_positions.items():
            if planet_name in boundary_planets:
                continue

            offset_pos = offset_positions.get(planet_name)
            if not offset_pos:
                continue

            if base_pos.bhava_house != offset_pos.bhava_house:
                # Find the planet's absolute degree from the full chart
                planet_data = next(
                    (p for p in base_chart.lagna_chart.planets if p.planet == planet_name),
                    None,
                )
                if not planet_data:
                    continue

                margin, nearest_house = _nearest_cusp_margin(
                    planet_data.absolute_degree, cusps
                )

                # Determine boundary description
                h_low = min(base_pos.bhava_house, offset_pos.bhava_house)
                h_high = max(base_pos.bhava_house, offset_pos.bhava_house)
                # Handle wrap-around (12th/1st)
                if h_high - h_low > 6:
                    boundary_desc = f"{h_high}th/1st"
                else:
                    boundary_desc = f"{h_low}th/{h_high}th"

                boundary_planets[planet_name] = BoundaryPlanet(
                    planet=planet_name,
                    rashi_house=base_pos.rashi_house,
                    base_bhava_house=base_pos.bhava_house,
                    flipped_bhava_house=offset_pos.bhava_house,
                    flip_offset_minutes=snapshot.offset_minutes,
                    margin_arcminutes=round(margin, 1),
                    boundary_description=boundary_desc,
                )

    return sorted(boundary_planets.values(), key=lambda bp: bp.margin_arcminutes)


def _detect_divisional_sensitivity(
    base_snapshot: OffsetSnapshot,
    all_snapshots: List[OffsetSnapshot],
) -> List[DivisionalLagnaSensitivity]:
    """Detect which divisional chart lagnas change across offsets.

    Args:
        base_snapshot: Snapshot at offset 0.
        all_snapshots: All snapshots.

    Returns:
        List of DivisionalLagnaSensitivity for charts that change.
    """
    results: List[DivisionalLagnaSensitivity] = []

    for chart_type, base_sign in base_snapshot.divisional_lagnas.items():
        changes = []
        for snapshot in all_snapshots:
            if snapshot.offset_minutes == 0:
                continue
            offset_sign = snapshot.divisional_lagnas.get(chart_type, base_sign)
            if offset_sign != base_sign:
                changes.append(
                    {"offset": snapshot.offset_minutes, "new_sign": offset_sign}
                )

        if changes:
            results.append(
                DivisionalLagnaSensitivity(
                    chart_type=chart_type,
                    base_sign=base_sign,
                    changes_at=sorted(changes, key=lambda c: abs(c["offset"])),
                )
            )

    return results


def _detect_dasha_shifts(
    base_chart: FullChart,
    extreme_charts: Dict[int, FullChart],
) -> List[DashaShift]:
    """Calculate how Mahadasha start dates shift at extreme offsets.

    Args:
        base_chart: Chart at base time.
        extreme_charts: Charts at most extreme offsets {offset: chart}.

    Returns:
        List of DashaShift for each Mahadasha.
    """
    if not extreme_charts:
        return []

    base_mahadashas = base_chart.dasha_timeline.mahadashas
    shifts: List[DashaShift] = []

    for base_md in base_mahadashas[:9]:  # First 9 Mahadashas (one full cycle)
        max_shift = 0
        direction = "later"

        for offset, chart in extreme_charts.items():
            for offset_md in chart.dasha_timeline.mahadashas:
                if offset_md.planet == base_md.planet:
                    shift_days = (offset_md.start_date - base_md.start_date).days
                    if abs(shift_days) > abs(max_shift):
                        max_shift = shift_days
                        direction = "later" if shift_days > 0 else "earlier"
                    break

        shifts.append(
            DashaShift(
                planet=base_md.planet,
                base_start_date=base_md.start_date,
                max_shift_days=abs(max_shift),
                shift_direction=direction,
            )
        )

    return shifts


class SensitivityService:
    """Analyzes birth time sensitivity by comparing charts at multiple offsets."""

    def __init__(self, chart_service: Optional[ChartService] = None):
        self.chart_service = chart_service or ChartService()

    def analyze(
        self,
        birth_data: BirthData,
        offsets: Optional[List[int]] = None,
    ) -> SensitivityReport:
        """Run sensitivity analysis across multiple time offsets.

        Args:
            birth_data: Base birth data.
            offsets: List of minute offsets to test. Default: [-10,-5,-3,-2,-1,0,1,2,3,5,10].

        Returns:
            SensitivityReport with boundary planets, D-chart sensitivity, dasha shifts.
        """
        if offsets is None:
            offsets = [-10, -5, -3, -2, -1, 0, 1, 2, 3, 5, 10]

        if 0 not in offsets:
            offsets = sorted(set(offsets) | {0})
        else:
            offsets = sorted(set(offsets))

        # Generate charts at all offsets
        charts: Dict[int, FullChart] = {}
        snapshots: List[OffsetSnapshot] = []

        for offset in offsets:
            shifted_dt = birth_data.birth_time + timedelta(minutes=offset)
            shifted_data = birth_data.model_copy(
                update={
                    "birth_time": shifted_dt,
                    "name": f"{birth_data.name} (offset {offset:+d}m)",
                }
            )

            chart = self.chart_service.generate_full_chart(shifted_data)
            charts[offset] = chart
            snapshots.append(_extract_snapshot(chart, offset))

        base_chart = charts[0]
        base_snapshot = next(s for s in snapshots if s.offset_minutes == 0)

        # Detect boundary planets
        boundary_planets = _detect_boundary_planets(
            base_snapshot, snapshots, base_chart
        )

        # Detect divisional chart sensitivity
        all_div_sensitivity = _detect_divisional_sensitivity(base_snapshot, snapshots)
        d9_sensitivity = next(
            (ds for ds in all_div_sensitivity if ds.chart_type == "D9"), None
        )

        # Detect dasha shifts (use most extreme offsets)
        min_offset = min(offsets)
        max_offset = max(offsets)
        extreme_charts = {}
        if min_offset in charts:
            extreme_charts[min_offset] = charts[min_offset]
        if max_offset in charts:
            extreme_charts[max_offset] = charts[max_offset]

        dasha_shifts = _detect_dasha_shifts(base_chart, extreme_charts)

        # Calculate ascendant rate
        if -1 in charts and 1 in charts:
            snap_m1 = next(s for s in snapshots if s.offset_minutes == -1)
            snap_p1 = next(s for s in snapshots if s.offset_minutes == 1)
            asc_rate = _angular_distance(snap_p1.ascendant_abs, snap_m1.ascendant_abs) / 2.0
        else:
            asc_rate = 0.25  # Approximate default

        return SensitivityReport(
            birth_data=birth_data,
            offsets_tested=offsets,
            snapshots=snapshots,
            boundary_planets=boundary_planets,
            d9_sensitivity=d9_sensitivity,
            all_divisional_sensitivity=all_div_sensitivity,
            dasha_shifts=dasha_shifts,
            ascendant_rate_deg_per_min=round(asc_rate, 4),
        )
