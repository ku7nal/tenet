"""Prepare a compact static overview of the saved City of Victoria GIS layers."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / ".scratch/drainage-maintenance-prioritization/data/victoria/raw"
OUTPUT_PATH = ROOT / "public/data/victoria/citywide-network.geojson"
LAYERS = (
    ("Storm_Drain_Gravity_Mains.geojson", "main"),
    ("Storm_Drain_Manholes.geojson", "manhole"),
    ("Storm_Drain_Outfall_(Discharge).geojson", "outfall"),
)
MAP_FIELDS = (
    "AssetID", "InfrastructureID", "OwnedBy", "WaterType", "LifecycleStatus", "ImportanceFactor", "DataSource",
    "Diameter", "CrossSectionShape", "UpstreamInvert", "DownstreamInvert", "Slope", "Length_2D",
    "UpstreamNodeID", "DownstreamNodeID", "Elevation", "CatchmentArea", "SurveyRequired",
    "OutfallNo", "OutfallCategory",
)


def citywide_features():
    features = []
    crs = None
    for filename, map_layer in LAYERS:
        source = json.loads((SOURCE_DIR / filename).read_text(encoding="utf-8"))
        crs = crs or source.get("crs")
        for feature in source["features"]:
            properties = feature["properties"]
            features.append({
                "type": "Feature",
                "properties": {**{key: properties.get(key) for key in MAP_FIELDS}, "mapLayer": map_layer},
                "geometry": feature.get("geometry"),
            })
    if not crs or not features or any(not feature["properties"]["AssetID"] for feature in features):
        raise ValueError("City GIS layers are incomplete or have missing asset IDs.")
    return {"type": "FeatureCollection", "crs": crs, "features": features}


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(citywide_features(), separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
