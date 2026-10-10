import argparse
import itertools
import json
import math
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / ".generated"
DRAIN_IDS = [f"D{index:02d}" for index in range(1, 9)]
JUNCTION_IDS = [f"J{index:02d}" for index in range(1, 9)]
PROFILES = [
    {"id": "moderate", "label": "Moderate", "totalDepthMm": 20, "durationHours": 2},
    {"id": "heavy", "label": "Heavy", "totalDepthMm": 40, "durationHours": 2},
    {"id": "extreme", "label": "Extreme", "totalDepthMm": 80, "durationHours": 2},
]
BLOCKAGE_AREA_REDUCTION = 0.4
CLEAN_DIAMETER_M = 0.25


def rain_series(profile):
    start = datetime(2025, 1, 1)
    intensity = profile["totalDepthMm"] / profile["durationHours"]
    points = []
    for minute in range(0, profile["durationHours"] * 60, 5):
        at = start + timedelta(minutes=minute)
        points.append(f"RAIN {at:%m/%d/%Y} {at:%H:%M} {intensity:g}")
    for minute in (profile["durationHours"] * 60, 180):
        at = start + timedelta(minutes=minute)
        points.append(f"RAIN {at:%m/%d/%Y} {at:%H:%M} 0")
    return "\n".join(points)


def input_file(cleaned, profile):
    blocked_diameter = CLEAN_DIAMETER_M * math.sqrt(1 - BLOCKAGE_AREA_REDUCTION)
    junctions = []
    subcatchments = []
    infiltration = []
    conduits = []
    cross_sections = []
    for index, junction in enumerate(JUNCTION_IDS):
        elevation = 12.0 - index * 0.2
        junctions.append(f"{junction} {elevation:.2f} 0.60 0 0 0")
        subcatchments.append(f"S{index + 1:02d} RG1 {junction} 1.5 85 250 0.5 0")
        infiltration.append(f"S{index + 1:02d} 80 3 4 7 0")
        downstream = JUNCTION_IDS[index + 1] if index + 1 < len(JUNCTION_IDS) else "O01"
        drain = DRAIN_IDS[index]
        diameter = CLEAN_DIAMETER_M if drain in cleaned else blocked_diameter
        conduits.append(f"{drain} {junction} {downstream} 100 0.013 0 0 0 0")
        cross_sections.append(f"{drain} CIRCULAR {diameter:.5f} 0 0 0 1 0")

    return f"""[TITLE]
Tenet illustrative drainage maintenance network
Illustrative assumptions only; not a validated Delhi network.

[OPTIONS]
FLOW_UNITS CMS
INFILTRATION HORTON
FLOW_ROUTING DYNWAVE
LINK_OFFSETS DEPTH
MIN_SLOPE 0
ALLOW_PONDING NO
START_DATE 01/01/2025
START_TIME 00:00:00
REPORT_START_DATE 01/01/2025
REPORT_START_TIME 00:00:00
END_DATE 01/01/2025
END_TIME 03:00:00
SWEEP_START 01/01
SWEEP_END 12/31
DRY_DAYS 0
REPORT_STEP 00:05:00
WET_STEP 00:05:00
DRY_STEP 01:00:00
ROUTING_STEP 00:00:30
VARIABLE_STEP 0.75
LENGTHENING_STEP 0
MINIMUM_STEP 0.5
INERTIAL_DAMPING PARTIAL
NORMAL_FLOW_LIMITED BOTH
SKIP_STEADY_STATE NO
IGNORE_RAINFALL NO
IGNORE_SNOWMELT NO
IGNORE_GROUNDWATER NO
IGNORE_ROUTING NO
IGNORE_QUALITY NO

[EVAPORATION]
CONSTANT 0
DRY_ONLY NO

[RAINGAGES]
RG1 INTENSITY 0:05 1.0 TIMESERIES RAIN

[SUBCATCHMENTS]
{chr(10).join(subcatchments)}

[SUBAREAS]
{chr(10).join(f"S{index:02d} 0.015 0.25 1.27 2.54 25 OUTLET 100" for index in range(1, 9))}

[INFILTRATION]
{chr(10).join(infiltration)}

[JUNCTIONS]
{chr(10).join(junctions)}

[OUTFALLS]
O01 10.40 FREE NO

[CONDUITS]
{chr(10).join(conduits)}

[XSECTIONS]
{chr(10).join(cross_sections)}

[TIMESERIES]
{rain_series(profile)}

[REPORT]
INPUT NO
CONTROLS NO
SUBCATCHMENTS NONE
NODES ALL
LINKS NONE
"""


def parse_flood_volumes(report_path):
    report = report_path.read_text(encoding="utf-8", errors="replace")
    if re.search(r"\bERROR\s+\d+\s*:", report, re.IGNORECASE):
        raise RuntimeError(f"SWMM reported an error; inspect {report_path}")
    marker = report.find("Node Flooding Summary")
    if marker < 0:
        raise RuntimeError(f"No Node Flooding Summary in {report_path}")

    volumes = {junction: 0.0 for junction in JUNCTION_IDS}
    for line in report[marker:].splitlines():
        values = line.split()
        if not values or values[0] not in volumes or len(values) < 7:
            continue
        try:
            # SWMM reports total flood volume in million liters for CMS models.
            volumes[values[0]] = float(values[-2]) * 1000
        except ValueError:
            continue
    return volumes


def run_case(swmm, cleaned, profile):
    subset_name = "none" if not cleaned else "-".join(sorted(cleaned))
    name = f"{profile['id']}-{subset_name}"
    input_path = OUTPUT_DIR / f"{name}.inp"
    report_path = OUTPUT_DIR / f"{name}.rpt"
    output_path = OUTPUT_DIR / f"{name}.out"
    input_path.write_text(input_file(cleaned, profile), encoding="utf-8")
    result = subprocess.run(
        [swmm, str(input_path), str(report_path), str(output_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not report_path.exists():
        detail = result.stderr.strip() or result.stdout.strip() or "no report created"
        raise RuntimeError(f"SWMM failed for {name}: {detail}")
    return parse_flood_volumes(report_path)


def summarize_plan(drain_ids, junction_volumes):
    return {
        "drainIds": list(sorted(drain_ids)),
        "totalOverflowM3": round(sum(junction_volumes.values()), 3),
        "junctions": [
            {"id": junction, "overflowM3": round(volume, 3)}
            for junction, volume in sorted(junction_volumes.items())
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Precompute Tenet SWMM scenarios for all rainfall profiles.")
    parser.add_argument("--swmm", default=os.environ.get("SWMM_BIN") or shutil.which("swmm"),
                        help="EPA SWMM command-line executable (or set SWMM_BIN)")
    args = parser.parse_args()
    if not args.swmm:
        parser.error("EPA SWMM was not found; pass --swmm /path/to/swmm or set SWMM_BIN")

    OUTPUT_DIR.mkdir(exist_ok=True)
    feasible_sets = [
        subset
        for size in range(4)
        for subset in itertools.combinations(DRAIN_IDS, size)
    ]
    scenarios = {}
    for profile in PROFILES:
        profile = {
            **profile,
            "intensityMmPerHour": profile["totalDepthMm"] / profile["durationHours"],
            "source": "Illustrative uniform rainfall profile; not a local design storm.",
        }
        outcomes = {
            subset: run_case(args.swmm, set(subset), profile)
            for subset in feasible_sets
        }
        no_cleaning = outcomes[()]
        plans_by_crew = {}
        individual_benefit = {
            (drain,): sum(no_cleaning.values()) - sum(outcomes[(drain,)].values())
            for drain in DRAIN_IDS
        }
        ranked = sorted(DRAIN_IDS, key=lambda drain: (-individual_benefit[(drain,)], drain))
        for crew_limit in (1, 2, 3):
            candidates = [subset for subset in feasible_sets if len(subset) <= crew_limit]
            best = min(candidates, key=lambda subset: (sum(outcomes[subset].values()), subset))
            baseline = tuple(sorted(
                drain for drain in ranked[:crew_limit]
                if individual_benefit[(drain,)] > 0
            ))
            plans_by_crew[str(crew_limit)] = [
                {"id": "no-cleaning", "label": "No cleaning", **summarize_plan((), no_cleaning)},
                {"id": "independent", "label": "Single-drain benefit", **summarize_plan(baseline, outcomes[baseline])},
                {"id": "network-aware", "label": "Network-aware plan", **summarize_plan(best, outcomes[best])},
            ]
        scenarios[profile["id"]] = {
            "rainfallProfile": profile,
            "plansByCrewLimit": plans_by_crew,
        }

    result = {
        "metadata": {
            "basin": {"id": "barapullah", "label": "Barapullah basin"},
            "blockageAssumption": "Each candidate conduit has 40% of its cross-sectional area blocked; cleaning restores the full illustrative diameter.",
            "model": {"engine": "EPA SWMM command line", "runStatus": "complete"},
            "dmpContext": {"reportedSegmentCount": 330, "mappedToNetwork": False},
        },
        "scenarios": scenarios,
    }
    result_path = OUTPUT_DIR / "results.json"
    result_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    deploy_dir = OUTPUT_DIR / "deploy" / result["metadata"]["basin"]["id"]
    deploy_dir.mkdir(parents=True, exist_ok=True)
    for profile_id, scenario in scenarios.items():
        profile_result = {"metadata": result["metadata"], **scenario}
        path = deploy_dir / f"{profile_id}.json"
        path.write_text(json.dumps(profile_result, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {result_path} from {len(feasible_sets) * len(PROFILES)} SWMM runs.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
