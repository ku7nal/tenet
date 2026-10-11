"""Build explicitly uncalibrated SWMM comparisons for Victoria S61."""

import argparse
import itertools
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / ".scratch/drainage-maintenance-prioritization/data/victoria/qualified/S61"
OUTPUT_DIR = ROOT / ".generated/deploy/victoria-s61"
PROFILES = [
    {"id": "moderate", "label": "Moderate", "totalDepthMm": 20, "durationHours": 2},
    {"id": "heavy", "label": "Heavy", "totalDepthMm": 40, "durationHours": 2},
    {"id": "extreme", "label": "Extreme", "totalDepthMm": 80, "durationHours": 2},
]
CREW_LIMITS = (1, 2, 3)
BLOCKED_AREA_FRACTION = 0.4
IMPERVIOUS_PERCENT = 75


def _features(filename):
    return json.loads((SOURCE_DIR / filename).read_text(encoding="utf-8"))["features"]


def source_network():
    """Read and validate the qualified source-preserving S61 extract."""
    mains = _features("gravity_mains.geojson")
    manholes = _features("manholes.geojson")
    outfalls = _features("outfall.geojson")
    catchments = _features("catchment.geojson")
    if len(mains) != 15 or len(manholes) != 15 or len(outfalls) != 1 or len(catchments) != 1:
        raise ValueError("The qualified S61 extract has unexpected asset counts.")

    node_ids = {feature["properties"]["AssetID"] for feature in manholes}
    outfall_id = outfalls[0]["properties"]["AssetID"]
    node_ids.add(outfall_id)
    for feature in mains:
        props = feature["properties"]
        if props.get("UpstreamNodeID") not in node_ids or props.get("DownstreamNodeID") not in node_ids:
            raise ValueError(f"{props.get('AssetID')} references a node outside the qualified S61 extract.")
        if not all(isinstance(props.get(key), (int, float)) for key in ("Length_2D", "Diameter", "UpstreamInvert", "DownstreamInvert")):
            raise ValueError(f"{props.get('AssetID')} is missing a required hydraulic source attribute.")
        if props["Length_2D"] <= 0 or props["Diameter"] <= 0:
            raise ValueError(f"{props.get('AssetID')} has a non-positive length or diameter.")
    area_m2 = catchments[0]["properties"].get("Shape_Area")
    if not isinstance(area_m2, (int, float)) or area_m2 <= 0:
        raise ValueError("The S61 catchment has no valid source area.")
    return {"mains": mains, "manholes": manholes, "outfall": outfalls[0], "catchment": catchments[0], "areaM2": area_m2}


def feasible_sets(asset_ids, maximum=3):
    ids = sorted(asset_ids)
    return [combo for size in range(min(maximum, len(ids)) + 1) for combo in itertools.combinations(ids, size)]


def _overflow_total(outcome):
    if isinstance(outcome, dict):
        return sum(outcome.values())
    return float(outcome)


def rank_actions(asset_ids, outcomes):
    baseline = _overflow_total(outcomes[()])
    ranked = sorted(
        ({"assetId": asset_id, "overflowReductionM3": round(baseline - _overflow_total(outcomes[(asset_id,)]), 3)}
         for asset_id in asset_ids),
        key=lambda action: (-action["overflowReductionM3"], action["assetId"]),
    )
    return [{"rank": rank, **action} for rank, action in enumerate(ranked, 1)]


def recommend_plans(asset_ids, outcomes, crew_limit):
    candidates = [combo for combo in outcomes if len(combo) <= crew_limit]
    if not candidates:
        raise ValueError("No feasible plans are available.")
    baseline = outcomes[()]
    individual_benefit = {
        (asset_id,): _overflow_total(baseline) - _overflow_total(outcomes[(asset_id,)])
        for asset_id in asset_ids
    }
    ranked = sorted(asset_ids, key=lambda asset_id: (-individual_benefit[(asset_id,)], asset_id))
    independent = tuple(sorted(
        asset_id for asset_id in ranked[:crew_limit]
        if individual_benefit[(asset_id,)] > 0
    ))
    best = min(candidates, key=lambda combo: (_overflow_total(outcomes[combo]), combo))

    def plan(plan_id, label, combo):
        junctions = outcomes[combo]
        if not isinstance(junctions, dict):
            junctions = {"network-total": junctions}
        return {
            "id": plan_id,
            "label": label,
            "drainIds": list(combo),
            "totalOverflowM3": round(_overflow_total(junctions), 3),
            "junctions": [{"id": node, "overflowM3": round(volume, 3)} for node, volume in sorted(junctions.items())],
        }

    return {
        "no-cleaning": plan("no-cleaning", "No cleaning", ()),
        "independent": plan("independent", "Single-drain benefit", independent),
        "network-aware": plan("network-aware", "Network-aware plan", best),
    }


def _rain_series(profile):
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


def build_model_input(cleaned, network, profile):
    mains = network["mains"]
    manholes = network["manholes"]
    outfall_id = network["outfall"]["properties"]["AssetID"]
    invert_values = {}
    for feature in mains:
        props = feature["properties"]
        for node_key, invert_key in (("UpstreamNodeID", "UpstreamInvert"), ("DownstreamNodeID", "DownstreamInvert")):
            node_id = props[node_key]
            invert_values.setdefault(node_id, []).append(props[invert_key])
    node_inverts = {node_id: min(values) for node_id, values in invert_values.items() if node_id != outfall_id}
    rim_elevations = {f["properties"]["AssetID"]: f["properties"].get("Elevation") for f in manholes}
    junction_lines = []
    for node_id, invert in sorted(node_inverts.items()):
        rim = rim_elevations.get(node_id)
        if not isinstance(rim, (int, float)) or rim <= invert:
            raise ValueError(f"{node_id} has no usable source rim elevation above its modeled invert.")
        junction_lines.append(f"{node_id} {invert:.3f} {rim - invert:.3f} 0 0 0")

    area_ha = network["areaM2"] / 10_000 / len(mains)
    width_m = math.sqrt(network["areaM2"] / len(mains))
    subcatchments = []
    subareas = []
    infiltration = []
    conduits = []
    cross_sections = []
    for feature in mains:
        props = feature["properties"]
        asset_id = props["AssetID"]
        upstream = props["UpstreamNodeID"]
        downstream = props["DownstreamNodeID"]
        blocked_diameter_m = props["Diameter"] / 1000 * math.sqrt(1 - BLOCKED_AREA_FRACTION)
        diameter_m = props["Diameter"] / 1000 if asset_id in cleaned else blocked_diameter_m
        subcatchment_id = f"SC_{asset_id}"
        subcatchments.append(f"{subcatchment_id} RG1 {upstream} {area_ha:.6f} {IMPERVIOUS_PERCENT} {width_m:.2f} 1.0 0")
        subareas.append(f"{subcatchment_id} 0.015 0.25 1.27 2.54 0 OUTLET 100")
        # Runoff/infiltration parameters are assumptions; the City source has no soil or subcatchment fields.
        infiltration.append(f"{subcatchment_id} 50 5 3 7 0")
        inlet_offset = props["UpstreamInvert"] - node_inverts[upstream]
        outlet_invert = props["DownstreamInvert"] if downstream == outfall_id else props["DownstreamInvert"]
        outlet_node_invert = outlet_invert if downstream == outfall_id else node_inverts[downstream]
        outlet_offset = outlet_invert - outlet_node_invert
        if inlet_offset < -0.001 or outlet_offset < -0.001:
            raise ValueError(f"{asset_id} has a pipe invert below the selected node invert.")
        conduits.append(f"{asset_id} {upstream} {downstream} {props['Length_2D']:.3f} 0.013 {max(0, inlet_offset):.3f} {max(0, outlet_offset):.3f} 0 0")
        cross_sections.append(f"{asset_id} CIRCULAR {diameter_m:.5f} 0 0 0 1 0")

    outfall_invert = min(
        feature["properties"]["DownstreamInvert"]
        for feature in mains
        if feature["properties"]["DownstreamNodeID"] == outfall_id
    )
    return f"""[TITLE]
Victoria S61 uncalibrated demonstration model
Source topology and selected attributes only; excluded external-link DGM005479 is not modeled.
Source diameters treated as millimetres, lengths and invert elevations as metres.
Runoff and blockage parameters are explicit assumptions; not engineering advice.

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
{chr(10).join(subareas)}

[INFILTRATION]
{chr(10).join(infiltration)}

[JUNCTIONS]
{chr(10).join(junction_lines)}

[OUTFALLS]
{outfall_id} {outfall_invert:.3f} FREE NO

[CONDUITS]
{chr(10).join(conduits)}

[XSECTIONS]
{chr(10).join(cross_sections)}

[TIMESERIES]
{_rain_series(profile)}

[REPORT]
INPUT NO
CONTROLS NO
SUBCATCHMENTS NONE
NODES ALL
LINKS NONE
"""


def parse_flood_volumes(report_path, node_ids):
    report = report_path.read_text(encoding="utf-8", errors="replace")
    if re.search(r"\bERROR\s+\d+\s*:", report, re.IGNORECASE):
        raise RuntimeError(f"SWMM reported an error; inspect {report_path}")
    marker = report.find("Node Flooding Summary")
    if marker < 0:
        raise RuntimeError(f"No Node Flooding Summary in {report_path}")
    volumes = {node_id: 0.0 for node_id in node_ids}
    for line in report[marker:].splitlines():
        fields = line.split()
        if fields and fields[0] in volumes and len(fields) >= 7:
            try:
                # SWMM report volume is million liters for CMS; convert to m³.
                volumes[fields[0]] = float(fields[-2]) * 1000
            except ValueError:
                pass
    return volumes


def run_case(swmm, cleaned, network, profile):
    node_ids = sorted({feature["properties"]["AssetID"] for feature in network["manholes"]})
    with tempfile.TemporaryDirectory(prefix="tenet-victoria-") as temp_dir:
        input_path = Path(temp_dir) / "scenario.inp"
        report_path = Path(temp_dir) / "scenario.rpt"
        output_path = Path(temp_dir) / "scenario.out"
        input_path.write_text(build_model_input(cleaned, network, profile), encoding="utf-8")
        result = subprocess.run([swmm, str(input_path), str(report_path), str(output_path)], capture_output=True, text=True, check=False)
        if result.returncode != 0 or not report_path.exists():
            detail = result.stderr.strip() or result.stdout.strip() or "no report created"
            raise RuntimeError(f"SWMM failed for {profile['id']} {sorted(cleaned)}: {detail}")
        return parse_flood_volumes(report_path, node_ids)


def main():
    parser = argparse.ArgumentParser(description="Precompute uncalibrated EPA SWMM comparisons for the Victoria S61 pilot.")
    parser.add_argument("--swmm", default=os.environ.get("SWMM_BIN") or shutil.which("swmm"),
                        help="EPA SWMM command-line executable (or set SWMM_BIN)")
    args = parser.parse_args()
    if not args.swmm:
        parser.error("EPA SWMM was not found; pass --swmm /path/to/swmm or set SWMM_BIN")

    network = source_network()
    asset_ids = sorted(feature["properties"]["AssetID"] for feature in network["mains"])
    scenarios = {}
    combinations = feasible_sets(asset_ids)
    for definition in PROFILES:
        profile = {
            **definition,
            "intensityMmPerHour": definition["totalDepthMm"] / definition["durationHours"],
            "source": "Illustrative uniform rainfall profile; not a Victoria design storm.",
        }
        outcomes = {combo: run_case(args.swmm, set(combo), network, profile) for combo in combinations}
        ranked_actions = rank_actions(asset_ids, outcomes)
        plans_by_crew = {
            str(limit): list(recommend_plans(asset_ids, outcomes, limit).values())
            for limit in CREW_LIMITS
        }
        scenarios[profile["id"]] = {"rainfallProfile": profile, "rankedActions": ranked_actions, "plansByCrewLimit": plans_by_crew}
        print(f"Completed {profile['label']}: {len(combinations)} feasible cleaning sets.", flush=True)

    metadata = {
        "basin": {"id": "victoria-s61", "label": "Victoria, BC · S61 pilot"},
        "blockageAssumption": "Each candidate main is modeled with 40% of cross-sectional area obstructed; cleaning restores its source-reported diameter. No blockage observations support this assumption.",
        "model": {"engine": "EPA SWMM command line", "runStatus": "complete", "calibration": "uncalibrated demonstration"},
        "assumptions": [
            "Uses 15 source gravity mains, 15 source manholes, source endpoint IDs, pipe lengths, diameters, inverts and manhole rim elevations; source approximate slopes are not used.",
            "At each manhole, modeled invert is the lowest incident source pipe invert; the reported rim elevation defines junction depth.",
            "Assumes source diameters are millimetres and source lengths/invert elevations are metres; the City metadata units were not verified.",
            "Splits the 11.13 ha source catchment equally among 15 mains; runoff is attached to each main's upstream node.",
            "Assumes 75% imperviousness, 1% land slope, impervious/pervious Manning n of 0.015/0.25, depression storage of 1.27/2.54 mm, Horton infiltration (50/5 mm per hour, decay 3 per hour, dry time 7 days), and pipe Manning n 0.013.",
            "Assumes a free outfall at the terminal pipe's downstream invert because the source outfall elevation is missing.",
            "Cleaning is assumed complete before rainfall and only changes the modeled obstruction on the selected main.",
            "The 20/40/80 mm two-hour uniform storms are illustrative and are not local design storms.",
        ],
        "dataGaps": [
            "No verified source units or vertical datum; no subcatchment runoff/soil data or local design rainfall.",
            "No observed flow, flooding, blockage, inspection, or maintenance records; no calibration or validation observations.",
            "Reuse terms for the exact City source layers are unconfirmed; confirm them before publishing this dataset or derived results.",
            "Outfall elevation is missing and DGM005479 remains excluded as an external cross-catchment link.",
            "City GIS is not field-verified or authoritative for engineering; outputs are scenario comparisons only.",
        ],
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for profile_id, scenario in scenarios.items():
        result = {"metadata": metadata, **scenario}
        (OUTPUT_DIR / f"{profile_id}.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(scenarios)} Victoria S61 profile files to {OUTPUT_DIR}.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
