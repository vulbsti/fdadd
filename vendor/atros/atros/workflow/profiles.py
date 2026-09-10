"""
Person profiles + hypothesis elimination. Agent-agnostic storage.

Layout per person (plain files, no harness lock-in):
    profiles/<name>/
        birth.json        BirthData + time_source + confidence
        events.json       [{date, title, detail, chain:{MD,AD,PD}, fit}]
        hypotheses.json   [{id, claim, predictions, tests, status}]
        session_log.md    append-only human-readable log

All functions are pure stdlib+json; the CLI in cli/main.py is a thin
wrapper emitting the same dicts as --output json.
"""

import json
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional

from ..core.models import BirthData

PROFILES_ROOT = Path("profiles")

KENDRA_HOUSES = {1, 4, 7, 10}


def profile_dir(name: str, root: Path = PROFILES_ROOT) -> Path:
    return Path(root) / name


def init_profile(
    name: str,
    birth: BirthData,
    time_source: str = "unknown",
    time_confidence: str = "unknown",
    root: Path = PROFILES_ROOT,
) -> Path:
    d = profile_dir(name, root)
    d.mkdir(parents=True, exist_ok=True)
    (d / "birth.json").write_text(
        json.dumps(
            {
                **json.loads(birth.model_dump_json()),
                "time_source": time_source,
                "time_confidence": time_confidence,
            },
            indent=2,
            default=str,
        )
    )
    for fname, empty in (("events.json", []), ("hypotheses.json", [])):
        p = d / fname
        if not p.exists():
            p.write_text("[]")
    log = d / "session_log.md"
    if not log.exists():
        log.write_text(f"# Session log — {name}\n")
    return d


def load_birth(name: str, root: Path = PROFILES_ROOT) -> Dict:
    return json.loads((profile_dir(name, root) / "birth.json").read_text())


def birth_data_from_dict(d: Dict) -> BirthData:
    bd = dict(d)
    bd.pop("time_source", None)
    bd.pop("time_confidence", None)
    return BirthData(**bd)


def tag_event_chain(moon_longitude: float, birth_date: date, on: date) -> Dict[str, Optional[str]]:
    """MD/AD/PD active on an event date (planet names only)."""
    from ..dashas.timeline import chain_for_date

    chain = chain_for_date(moon_longitude, birth_date, on)
    out: Dict[str, Optional[str]] = {}
    for key in ("mahadasha", "antardasha", "pratyantar", "sookshma"):
        p = chain[key]
        out[key] = p.planet if p is not None else None
    return out


def append_event(
    name: str,
    on: date,
    title: str,
    detail: str = "",
    fit: str = "unassessed",
    moon_longitude: float | None = None,
    root: Path = PROFILES_ROOT,
) -> Dict:
    d = profile_dir(name, root)
    birth = load_birth(name, root)
    bdate = date.fromisoformat(birth["birth_date"])
    chain: Dict[str, Optional[str]] = {}
    if moon_longitude is not None:
        chain = tag_event_chain(moon_longitude, bdate, on)
    events: List[Dict] = json.loads((d / "events.json").read_text())
    entry = {
        "date": on.isoformat(),
        "title": title,
        "detail": detail,
        "chain": chain,
        "fit": fit,
    }
    events.append(entry)
    events.sort(key=lambda e: e["date"])
    (d / "events.json").write_text(json.dumps(events, indent=2))
    with (d / "session_log.md").open("a") as f:
        f.write(f"\n## {on.isoformat()} — {title}\n{detail}\nChain: {chain} Fit: {fit}\n")
    return entry


def upsert_hypothesis(
    name: str,
    hid: str,
    claim: str,
    predictions: List[str],
    tests: List[str],
    status: str = "open",
    root: Path = PROFILES_ROOT,
) -> Dict:
    """status: open | confirmed | eliminated | ambiguous."""
    d = profile_dir(name, root)
    hyps: List[Dict] = json.loads((d / "hypotheses.json").read_text())
    entry = {
        "id": hid,
        "claim": claim,
        "predictions": predictions,
        "tests": tests,
        "status": status,
        "updated": datetime.now().isoformat(timespec="seconds"),
    }
    hyps = [h for h in hyps if h["id"] != hid] + [entry]
    (d / "hypotheses.json").write_text(json.dumps(hyps, indent=2))
    return entry


def set_hypothesis_status(name: str, hid: str, status: str, root: Path = PROFILES_ROOT) -> Dict:
    d = profile_dir(name, root)
    hyps: List[Dict] = json.loads((d / "hypotheses.json").read_text())
    for h in hyps:
        if h["id"] == hid:
            h["status"] = status
            h["updated"] = datetime.now().isoformat(timespec="seconds")
            (d / "hypotheses.json").write_text(json.dumps(hyps, indent=2))
            return h
    raise KeyError(f"hypothesis {hid} not found")


def elimination_table(name: str, root: Path = PROFILES_ROOT) -> List[Dict]:
    hyps: List[Dict] = json.loads((profile_dir(name, root) / "hypotheses.json").read_text())
    return [
        {"id": h["id"], "claim": h["claim"], "status": h["status"], "tests": h["tests"]}
        for h in hyps
    ]


def check_rectification(chart, sensitivity_report) -> Dict:
    """Behavioural anchor: reproduce bhava_utk.md §3C/3D/3E/5A from data.

    Returns bhava houses of Mercury/Jupiter, Malavya-weakened flag, and
    whether the 9:14-9:15 optimal range holds (both margins comfortable).
    """
    bhava = {p.planet: p.bhava_house for p in chart.bhava_chalit.positions}
    rashi_house = {p.planet: p.house for p in chart.lagna_chart.planets}
    dignity = {p.planet: (p.dignity or "") for p in chart.lagna_chart.planets}
    venus_bhava = bhava.get("Venus")
    malavya_weakened = (
        dignity.get("Venus") == "Exalted" and venus_bhava not in KENDRA_HOUSES
    )
    margins = {}
    for bp in sensitivity_report.boundary_planets:
        margins[bp.planet] = bp.margin_arcminutes
    result = {
        "mercury_bhava": bhava.get("Mercury"),
        "mercury_rashi_house": rashi_house.get("Mercury"),
        "jupiter_bhava": bhava.get("Jupiter"),
        "jupiter_rashi_house": rashi_house.get("Jupiter"),
        "venus_bhava": venus_bhava,
        "malavya_weakened": malavya_weakened,
        "boundary_margins_arcmin": margins,
        "mercury_delivers_11th": bhava.get("Mercury") == 11,
        "jupiter_delivers_11th": bhava.get("Jupiter") == 11,
    }
    return result
