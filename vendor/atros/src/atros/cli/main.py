"""
Atros CLI - Command-line interface for Vedic astrology calculations.
"""

import json
from datetime import date, datetime

import click

from ..core.models import BirthData
from ..services.chart_service import ChartService


@click.group()
@click.version_option(version="0.1.0", prog_name="atros")
def cli():
    """Atros - Vedic Astrology Calculation System.

    Generate accurate Vedic astrology charts using Swiss Ephemeris
    with Lahiri Ayanamsa.
    """
    pass


@cli.command()
@click.option("--name", required=True, help="Name of the person")
@click.option("--date", "birth_date", required=True, help="Birth date (YYYY-MM-DD)")
@click.option("--time", "birth_time", required=True, help="Birth time (HH:MM)")
@click.option("--lat", type=float, required=True, help="Latitude of birth place")
@click.option("--lng", type=float, required=True, help="Longitude of birth place")
@click.option("--tz", required=True, help="Timezone (e.g., Asia/Kolkata)")
@click.option("--place", default=None, help="Name of birth place")
@click.option(
    "--output",
    type=click.Choice(["text", "json"]),
    default="text",
    help="Output format",
)
def chart(name, birth_date, birth_time, lat, lng, tz, place, output):
    """Generate a complete Vedic birth chart.

    Example:
        atros chart --name "Person" --date 2000-04-22 --time 09:15 \\
                    --lat 26.4499 --lng 80.3319 --tz "Asia/Kolkata"
    """
    try:
        # Parse date and time
        dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")

        birth_data = BirthData(
            name=name,
            birth_date=dt.date(),
            birth_time=dt,
            latitude=lat,
            longitude=lng,
            timezone=tz,
            place_name=place,
        )

        service = ChartService()
        full_chart = service.generate_full_chart(birth_data)

        if output == "json":
            click.echo(full_chart.model_dump_json(indent=2))
        else:
            _print_text_chart(full_chart)

    except ValueError as e:
        click.echo(f"Error: Invalid date/time format. Use YYYY-MM-DD and HH:MM. ({e})")
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"Error generating chart: {e}")
        raise SystemExit(1)


@cli.command()
@click.option("--date", "birth_date", required=True, help="Birth date (YYYY-MM-DD)")
@click.option("--time", "birth_time", required=True, help="Birth time (HH:MM)")
@click.option("--lat", type=float, required=True, help="Latitude")
@click.option("--lng", type=float, required=True, help="Longitude")
@click.option("--tz", required=True, help="Timezone")
@click.option("--years", type=int, default=50, help="Years to calculate forward")
def dasha(birth_date, birth_time, lat, lng, tz, years):
    """Show Vimshottari Dasha timeline.

    Example:
        atros dasha --date 2000-04-22 --time 09:15 \\
                    --lat 26.4499 --lng 80.3319 --tz "Asia/Kolkata"
    """
    try:
        dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")

        birth_data = BirthData(
            name="Dasha Query",
            birth_date=dt.date(),
            birth_time=dt,
            latitude=lat,
            longitude=lng,
            timezone=tz,
        )

        from ..dashas.vimshottari import generate_dasha_timeline
        from ..ephemeris.kerykeion_adapter import KerykeionAdapter

        ephemeris = KerykeionAdapter()
        raw_positions = ephemeris.get_planet_positions(birth_data)
        moon_longitude = raw_positions.get("Moon", {}).get("abs_pos", 0.0)

        timeline = generate_dasha_timeline(moon_longitude, dt.date(), years)

        click.echo("\n" + "=" * 60)
        click.echo("VIMSHOTTARI DASHA TIMELINE")
        click.echo("=" * 60)
        click.echo(f"Birth Nakshatra: {timeline.birth_nakshatra}")
        click.echo(f"Nakshatra Lord: {timeline.nakshatra_lord}")
        click.echo(f"Balance at birth: {timeline.balance_at_birth:.2f} years")
        click.echo("-" * 60)

        click.echo("\nMahadashas:")
        click.echo(f"{'Planet':<12} {'Start':<15} {'End':<15} {'Years':<8}")
        click.echo("-" * 50)

        for md in timeline.mahadashas:
            click.echo(
                f"{md.planet:<12} "
                f"{md.start_date.strftime('%d-%b-%Y'):<15} "
                f"{md.end_date.strftime('%d-%b-%Y'):<15} "
                f"{md.duration_years:<8.1f}"
            )

        if timeline.current_mahadasha:
            click.echo("\n" + "-" * 60)
            click.echo(
                f"Current Mahadasha: {timeline.current_mahadasha.planet} "
                f"({timeline.current_mahadasha.start_date.strftime('%d-%b-%Y')} - "
                f"{timeline.current_mahadasha.end_date.strftime('%d-%b-%Y')})"
            )

            if timeline.antardashas:
                click.echo("\nAntardashas in current Mahadasha:")
                for ad in timeline.antardashas:
                    marker = " <-- CURRENT" if ad == timeline.current_antardasha else ""
                    click.echo(
                        f"  {ad.planet:<12} "
                        f"{ad.start_date.strftime('%d-%b-%Y'):<15} "
                        f"{ad.end_date.strftime('%d-%b-%Y'):<15}"
                        f"{marker}"
                    )

    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)


@cli.command()
@click.option("--date", "birth_date", required=True, help="Birth date (YYYY-MM-DD)")
@click.option("--time", "birth_time", required=True, help="Birth time (HH:MM)")
@click.option("--lat", type=float, required=True, help="Latitude")
@click.option("--lng", type=float, required=True, help="Longitude")
@click.option("--tz", required=True, help="Timezone")
def current(birth_date, birth_time, lat, lng, tz):
    """Show currently running dasha period.

    Example:
        atros current --date 2000-04-22 --time 09:15 \\
                      --lat 26.4499 --lng 80.3319 --tz "Asia/Kolkata"
    """
    try:
        dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")

        birth_data = BirthData(
            name="Current Dasha Query",
            birth_date=dt.date(),
            birth_time=dt,
            latitude=lat,
            longitude=lng,
            timezone=tz,
        )

        service = ChartService()
        current_dasha = service.get_current_dasha(birth_data)

        click.echo(f"\nCurrent Dasha Period: {current_dasha}")

    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)


@cli.command()
@click.option("--name", required=True, help="Name of the person")
@click.option("--date", "birth_date", required=True, help="Birth date (YYYY-MM-DD)")
@click.option("--time", "birth_time", required=True, help="Birth time (HH:MM)")
@click.option("--lat", type=float, required=True, help="Latitude of birth place")
@click.option("--lng", type=float, required=True, help="Longitude of birth place")
@click.option("--tz", required=True, help="Timezone (e.g., Asia/Kolkata)")
@click.option("--place", default=None, help="Name of birth place")
@click.option(
    "--offsets",
    default="-10,-5,-3,-2,-1,0,1,2,3,5,10",
    help="Comma-separated minute offsets to test",
)
@click.option(
    "--output",
    type=click.Choice(["text", "json"]),
    default="text",
    help="Output format",
)
def sensitivity(name, birth_date, birth_time, lat, lng, tz, place, offsets, output):
    """Analyze birth time sensitivity for rectification.

    Runs the chart at multiple time offsets to identify boundary planets,
    divisional chart lagna changes, and dasha date shifts.

    Example:
        atros sensitivity --name "Person" --date 2000-04-22 --time 09:15 \\
                          --lat 26.4499 --lng 80.3319 --tz "Asia/Kolkata"
    """
    try:
        dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")

        birth_data = BirthData(
            name=name,
            birth_date=dt.date(),
            birth_time=dt,
            latitude=lat,
            longitude=lng,
            timezone=tz,
            place_name=place,
        )

        offset_list = [int(o.strip()) for o in offsets.split(",")]

        from ..services.sensitivity_service import SensitivityService

        service = SensitivityService()
        report = service.analyze(birth_data, offset_list)

        if output == "json":
            click.echo(report.model_dump_json(indent=2))
        else:
            _print_sensitivity_report(report)

    except ValueError as e:
        click.echo(f"Error: Invalid input. ({e})")
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)


def _print_sensitivity_report(report):
    """Print human-readable sensitivity analysis."""
    bd = report.birth_data
    click.echo("\n" + "=" * 70)
    click.echo("BIRTH TIME SENSITIVITY ANALYSIS")
    click.echo("=" * 70)
    click.echo(f"Name: {bd.name}")
    click.echo(f"Birth Time: {bd.birth_time.strftime('%H:%M')}")
    if bd.place_name:
        click.echo(f"Place: {bd.place_name}")
    click.echo(
        f"Offsets tested: {', '.join(f'{o:+d}' for o in report.offsets_tested)} minutes"
    )
    click.echo(f"Ascendant rate: {report.ascendant_rate_deg_per_min:.4f} deg/min")

    # Boundary Planets
    click.echo("\n" + "-" * 70)
    click.echo("BOUNDARY PLANETS")
    click.echo("-" * 70)
    if report.boundary_planets:
        click.echo(
            f"  {'Planet':<10} {'Rashi':<8} {'Base Bhava':<12} "
            f"{'Flipped':<10} {'Margin':<10} {'Flips at'}"
        )
        click.echo("  " + "-" * 62)
        for bp in report.boundary_planets:
            click.echo(
                f"  {bp.planet:<10} H{bp.rashi_house:<7} "
                f"H{bp.base_bhava_house:<11} H{bp.flipped_bhava_house:<9} "
                f"{bp.margin_arcminutes:>5.0f}'     "
                f"{bp.flip_offset_minutes:+d}min"
            )
    else:
        click.echo("  No planets near Bhava Chalit boundaries (all stable)")

    # D9 Navamsa Lagna
    click.echo("\n" + "-" * 70)
    click.echo("D9 NAVAMSA LAGNA")
    click.echo("-" * 70)
    if report.d9_sensitivity:
        click.echo(f"  Base: {report.d9_sensitivity.base_sign}")
        click.echo("  Changes:")
        for change in report.d9_sensitivity.changes_at:
            click.echo(f"    At {change['offset']:+d}min -> {change['new_sign']}")
    else:
        base_d9 = next(
            (s.d9_lagna_sign for s in report.snapshots if s.offset_minutes == 0),
            "Unknown",
        )
        click.echo(f"  {base_d9} (stable across all tested offsets)")

    # Other Divisional Charts
    other_divs = [
        ds for ds in report.all_divisional_sensitivity if ds.chart_type != "D9"
    ]
    if other_divs:
        click.echo("\n" + "-" * 70)
        click.echo("DIVISIONAL CHART SENSITIVITY")
        click.echo("-" * 70)
        for ds in other_divs:
            nearest_change = ds.changes_at[0] if ds.changes_at else None
            if nearest_change:
                click.echo(
                    f"  {ds.chart_type}: {ds.base_sign} -> "
                    f"{nearest_change['new_sign']} at {nearest_change['offset']:+d}min"
                )

    # Dasha Shifts
    click.echo("\n" + "-" * 70)
    click.echo("DASHA DATE SHIFTS")
    click.echo("-" * 70)
    if report.dasha_shifts:
        for ds in report.dasha_shifts:
            if ds.max_shift_days > 0:
                click.echo(
                    f"  {ds.planet:<10} starts {ds.base_start_date.strftime('%d-%b-%Y')}"
                    f"  shift: {ds.max_shift_days}d {ds.shift_direction}"
                )
    else:
        click.echo("  No dasha shift data")

    click.echo("\n" + "=" * 70)


def _print_text_chart(chart):
    """Print human-readable chart output."""
    click.echo("\n" + "=" * 70)
    click.echo(f"VEDIC CHART: {chart.birth_data.name}")
    click.echo("=" * 70)
    click.echo(
        f"Born: {chart.birth_data.birth_date} at {chart.birth_data.birth_time.strftime('%H:%M')}"
    )
    if chart.birth_data.place_name:
        click.echo(f"Place: {chart.birth_data.place_name}")
    click.echo(
        f"Coordinates: {chart.birth_data.latitude:.4f}, {chart.birth_data.longitude:.4f}"
    )
    click.echo(f"Timezone: {chart.birth_data.timezone}")
    click.echo(
        f"Ayanamsa: {chart.lagna_chart.ayanamsa_name} "
        f"({chart.lagna_chart.ayanamsa:.4f})"
    )

    # Lagna Chart
    click.echo("\n" + "-" * 70)
    click.echo("LAGNA CHART (D1 - Rashi)")
    click.echo("-" * 70)
    click.echo(
        f"Ascendant: {chart.lagna_chart.ascendant.sign} "
        f"{chart.lagna_chart.ascendant.degree:.2f}"
    )

    click.echo(
        f"\n{'Planet':<10} {'Sign':<12} {'Degree':<8} {'Nakshatra':<16} "
        f"{'House':<6} {'State'}"
    )
    click.echo("-" * 70)

    for p in chart.lagna_chart.planets:
        state = p.dignity or ""
        retro = " (R)" if p.retrograde else ""
        click.echo(
            f"{p.planet:<10} {p.sign:<12} {p.degree:>6.2f}  "
            f"{p.nakshatra:<16} {p.house:<6} {state}{retro}"
        )

    # Navamsa (D9)
    if "D9" in chart.divisional_charts:
        click.echo("\n" + "-" * 70)
        click.echo("NAVAMSA CHART (D9)")
        click.echo("-" * 70)
        d9 = chart.divisional_charts["D9"]
        if d9.ascendant:
            click.echo(f"D9 Ascendant: {d9.ascendant.sign}")
        for pos in d9.positions:
            click.echo(f"  {pos.planet:<12} -> {pos.sign}")

    # Yogas
    if chart.yogas:
        click.echo("\n" + "-" * 70)
        click.echo("YOGAS")
        click.echo("-" * 70)
        for yoga in chart.yogas:
            strength_str = f" ({yoga.strength:.0f}%)" if yoga.strength else ""
            click.echo(f"\n{yoga.name}{strength_str}")
            click.echo(f"  Type: {yoga.type}")
            click.echo(f"  Planets: {', '.join(yoga.planets_involved)}")
            click.echo(f"  {yoga.description}")

    # Current Dasha
    if chart.dasha_timeline.current_mahadasha:
        click.echo("\n" + "-" * 70)
        click.echo("CURRENT DASHA")
        click.echo("-" * 70)
        md = chart.dasha_timeline.current_mahadasha
        click.echo(f"Mahadasha: {md.planet}")
        click.echo(
            f"  Period: {md.start_date.strftime('%d-%b-%Y')} - "
            f"{md.end_date.strftime('%d-%b-%Y')}"
        )

        if chart.dasha_timeline.current_antardasha:
            ad = chart.dasha_timeline.current_antardasha
            click.echo(f"Antardasha: {ad.planet}")
            click.echo(
                f"  Period: {ad.start_date.strftime('%d-%b-%Y')} - "
                f"{ad.end_date.strftime('%d-%b-%Y')}"
            )

    # Panchanga
    if chart.panchanga:
        click.echo("\n" + "-" * 70)
        click.echo("PANCHANGA")
        click.echo("-" * 70)
        p = chart.panchanga
        click.echo(f"  Tithi:      {p.tithi_name} ({p.tithi_number}/30)")
        click.echo(f"  Paksha:     {p.paksha}")
        click.echo(f"  Yoga:       {p.nithya_yoga_name} ({p.nithya_yoga_number}/27)")
        click.echo(f"  Karana:     {p.karana_name} ({p.karana_number}/60)")
        click.echo(f"  Vara:       {p.vara} (Lord: {p.vara_lord})")
        click.echo(f"  Nakshatra:  {p.nakshatra} (Lord: {p.nakshatra_lord})")

    # Combustion
    if chart.combustion:
        click.echo("\n" + "-" * 70)
        click.echo("COMBUSTION (ASTA)")
        click.echo("-" * 70)
        for c in chart.combustion:
            status = "COMBUST" if c.is_combust else "OK"
            click.echo(
                f"  {c.planet:<10} {status:<10} "
                f"(distance: {c.distance_from_sun:>6.1f} deg, "
                f"threshold: {c.threshold:>4.0f} deg)"
            )

    # Planetary Aspects
    if chart.aspects:
        click.echo("\n" + "-" * 70)
        click.echo(f"PLANETARY ASPECTS ({len(chart.aspects)} full aspects)")
        click.echo("-" * 70)
        for a in chart.aspects[:20]:
            special = " [SPECIAL]" if a.is_special else ""
            click.echo(
                f"  {a.aspecting_planet:<10} -> {a.aspected_planet:<10} "
                f"({a.house_distance}th house, {a.strength:.0f}%){special}"
            )
        if len(chart.aspects) > 20:
            click.echo(f"  ... and {len(chart.aspects) - 20} more")

    # Bhava Chalit
    if chart.bhava_chalit:
        shifted = [p for p in chart.bhava_chalit.positions if p.has_shifted]
        click.echo("\n" + "-" * 70)
        click.echo("BHAVA CHALIT")
        click.echo("-" * 70)
        if shifted:
            click.echo("  Planets that shifted from Rashi to Chalit:")
            for p in shifted:
                click.echo(
                    f"    {p.planet:<10} Rashi H{p.rashi_house} -> Chalit H{p.bhava_house}"
                )
        else:
            click.echo("  No planets shifted between Rashi and Chalit charts")

    click.echo("\n" + "=" * 70)
@cli.command()
@click.option("--date", "birth_date", required=True, help="Birth date (YYYY-MM-DD)")
@click.option("--time", "birth_time", required=True, help="Birth time (HH:MM)")
@click.option("--lat", type=float, required=True, help="Latitude")
@click.option("--lng", type=float, required=True, help="Longitude")
@click.option("--tz", required=True, help="Timezone")
@click.option("--from", "from_date", required=True, help="Window start (YYYY-MM-DD)")
@click.option("--to", "to_date", required=True, help="Window end (YYYY-MM-DD)")
@click.option("--level", type=click.Choice(["maha", "antar", "pratyantar", "sookshma"]), default="pratyantar")
@click.option("--output", type=click.Choice(["text", "json"]), default="text")
def timeline(birth_date, birth_time, lat, lng, tz, from_date, to_date, level, output):
    """Nested dasha chain over a date window. Stable JSON contract for agents."""
    try:
        dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")
        birth_data = BirthData(name="Timeline Query", birth_date=dt.date(), birth_time=dt, latitude=lat, longitude=lng, timezone=tz)
        from ..ephemeris.kerykeion_adapter import KerykeionAdapter
        from ..dashas.timeline import periods_for_window
        moon_long = KerykeionAdapter().get_planet_positions(birth_data)["Moon"]["abs_pos"]
        rows = periods_for_window(moon_long, dt.date(), date.fromisoformat(from_date), date.fromisoformat(to_date), level)
        if output == "json":
            click.echo(json.dumps({"level": level, "rows": rows}, indent=2))
        else:
            for r in rows:
                click.echo(f"{r['chain']:<40} {r['mahadasha']['start']} -> {(r['sookshma'] or r['pratyantar'] or r['antardasha'] or r['mahadasha'])['end']}")
    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)

@cli.command(name="transit")
@click.option("--date", "birth_date", required=True, help="Birth date (YYYY-MM-DD)")
@click.option("--time", "birth_time", required=True, help="Birth time (HH:MM)")
@click.option("--lat", type=float, required=True, help="Latitude")
@click.option("--lng", type=float, required=True, help="Longitude")
@click.option("--tz", required=True, help="Timezone")
@click.option("--as-of", "as_of", required=True, help="Transit date (YYYY-MM-DD)")
@click.option("--output", type=click.Choice(["text", "json"]), default="text")
def transit_cmd(birth_date, birth_time, lat, lng, tz, as_of, output):
    """Gochara overlay for a date. Stable JSON contract for agents."""
    try:
        dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")
        birth_data = BirthData(name="Transit Query", birth_date=dt.date(), birth_time=dt, latitude=lat, longitude=lng, timezone=tz)
        from ..services.transit_service import transit_for_date
        result = transit_for_date(birth_data, date.fromisoformat(as_of))
        if output == "json":
            click.echo(json.dumps(result, indent=2, default=str))
        else:
            s = result["sade_sati"]
            click.echo(f"Natal Moon: {result['natal_moon_sign']} | Sade Sati active: {s.get('is_active')} ({s.get('type') or 'none'})")
            for t in result["transits"]:
                flag = "fav" if t["is_favorable"] else "unfav"
                vedha = f" vedha-by-{t['vedha_planet']}" if t["is_vedha_obstructed"] else ""
                click.echo(f"  {t['planet']:<10} {t['transit_sign']:<12} H{t['house_from_moon']:>2} {flag}{vedha}")
            click.echo(f"Double transit: {', '.join(result['double_transit_signs'])}")
    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)

@cli.group()
def profile():
    """Person-profile store: birth + events + hypotheses. Plain files under profiles/."""
    pass

@profile.command(name="init")
@click.option("--name", required=True)
@click.option("--date", "birth_date", required=True)
@click.option("--time", "birth_time", required=True)
@click.option("--lat", type=float, required=True)
@click.option("--lng", type=float, required=True)
@click.option("--tz", required=True)
@click.option("--place", default=None)
@click.option("--time-source", default="unknown")
@click.option("--time-confidence", default="unknown")
@click.option("--root", default="profiles")
def profile_init(name, birth_date, birth_time, lat, lng, tz, place, time_source, time_confidence, root):
    """Create profiles/<name>/ with birth.json + empty events/hypotheses."""
    try:
        from pathlib import Path
        from ..workflow.profiles import init_profile
        dt = datetime.strptime(f"{birth_date} {birth_time}", "%Y-%m-%d %H:%M")
        birth = BirthData(name=name, birth_date=dt.date(), birth_time=dt, latitude=lat, longitude=lng, timezone=tz, place_name=place)
        d = init_profile(name, birth, time_source, time_confidence, Path(root))
        click.echo(json.dumps({"profile": str(d)}))
    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)

@profile.command(name="add-event")
@click.option("--name", required=True)
@click.option("--on", required=True, help="Event date (YYYY-MM-DD)")
@click.option("--title", required=True)
@click.option("--detail", default="")
@click.option("--fit", default="unassessed")
@click.option("--root", default="profiles")
def profile_event(name, on, title, detail, fit, root):
    """Append event, auto-tagged with MD/AD/PD chain."""
    try:
        from pathlib import Path
        from ..workflow.profiles import append_event, birth_data_from_dict, load_birth
        from ..ephemeris.kerykeion_adapter import KerykeionAdapter
        rootp = Path(root)
        birth = birth_data_from_dict(load_birth(name, rootp))
        moon_long = KerykeionAdapter().get_planet_positions(birth)["Moon"]["abs_pos"]
        entry = append_event(name, date.fromisoformat(on), title, detail, fit, moon_long, rootp)
        click.echo(json.dumps(entry, indent=2, default=str))
    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)

@profile.command(name="hypothesis")
@click.option("--name", required=True)
@click.option("--id", "hid", required=True)
@click.option("--claim", required=True)
@click.option("--predict", multiple=True, help="Repeatable: --predict '...'")
@click.option("--test", "tests", multiple=True, help="Repeatable: --test '...'")
@click.option("--status", type=click.Choice(["open", "confirmed", "eliminated", "ambiguous"]), default="open")
@click.option("--root", default="profiles")
def profile_hyp(name, hid, claim, predict, tests, status, root):
    """Create/update a hypothesis entry."""
    try:
        from pathlib import Path
        from ..workflow.profiles import upsert_hypothesis
        entry = upsert_hypothesis(name, hid, claim, list(predict), list(tests), status, Path(root))
        click.echo(json.dumps(entry, indent=2, default=str))
    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)

@profile.command(name="status")
@click.option("--name", required=True)
@click.option("--root", default="profiles")
@click.option("--output", type=click.Choice(["text", "json"]), default="text")
def profile_status(name, root, output):
    """Elimination table: id | claim | status | tests."""
    try:
        from pathlib import Path
        from ..workflow.profiles import elimination_table
        rows = elimination_table(name, Path(root))
        if output == "json":
            click.echo(json.dumps(rows, indent=2))
        else:
            for r in rows:
                click.echo(f"[{r['status']:<10}] {r['id']}: {r['claim']}")
                for t in r["tests"]:
                    click.echo(f"    test: {t}")
    except Exception as e:
        click.echo(f"Error: {e}")
        raise SystemExit(1)



if __name__ == "__main__":
    cli()
