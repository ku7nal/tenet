import unittest

from build_victoria_city_map import citywide_features


class VictoriaCityMapTests(unittest.TestCase):
    def test_builds_full_saved_city_layers_with_expected_counts(self):
        network = citywide_features()
        counts = {layer: sum(feature["properties"]["mapLayer"] == layer for feature in network["features"])
                  for layer in ("main", "manhole", "outfall")}
        self.assertEqual(counts, {"main": 4686, "manhole": 3590, "outfall": 87})
        self.assertEqual(network["crs"]["properties"]["name"], "urn:ogc:def:crs:OGC:1.3:CRS84")
        self.assertEqual(sum(feature["properties"]["mapLayer"] == "manhole" and feature["geometry"] is None
                             for feature in network["features"]), 3)
        self.assertTrue(all(feature["properties"].get("AssetID") for feature in network["features"]))
        self.assertEqual(sum(feature["properties"].get("OwnedBy") == "VC" and
                             feature["properties"].get("LifecycleStatus") == "ACT" and
                             feature["properties"].get("WaterType") == "STM" and
                             feature["geometry"] is not None
                             for feature in network["features"] if feature["properties"]["mapLayer"] == "main"), 4380)


if __name__ == "__main__":
    unittest.main()
