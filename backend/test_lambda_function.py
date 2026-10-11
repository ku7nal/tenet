import json
import unittest
from unittest.mock import patch

import lambda_function


class RecommendationApiTests(unittest.TestCase):
    def _get(self, basin):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "queryStringParameters": {"basin": basin, "rainfallProfile": "moderate", "crewLimit": "1"},
        }
        return lambda_function.handler(event, None)

    def test_victoria_returns_its_own_basin_scenario(self):
        result_bundle = {
            "metadata": {
                "basin": {"id": "victoria-s61", "label": "Victoria S61"},
                "model": {"calibration": "uncalibrated demonstration"},
            },
            "rainfallProfile": {"id": "moderate"},
            "rankedActions": [{"rank": 1, "assetId": "DGM000990", "overflowReductionM3": 3.5}],
            "plansByCrewLimit": {"1": [{"id": "no-cleaning"}, {"id": "independent"}, {"id": "network-aware", "drainIds": ["DGM000990"]}]},
        }
        with patch("lambda_function.load_results", return_value=result_bundle):
            result = self._get("victoria-s61")
        body = json.loads(result["body"])
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(body["basin"]["id"], "victoria-s61")
        self.assertEqual(body["model"]["calibration"], "uncalibrated demonstration")
        self.assertEqual(body["rankedActions"][0]["overflowReductionM3"], 3.5)
        self.assertIn("DGM", body["plans"][2]["drainIds"][0])

    def test_barapullah_still_returns_only_barapullah_scenarios(self):
        result_bundle = {
            "metadata": {"basin": {"id": "barapullah", "label": "Barapullah"}},
            "rainfallProfile": {"id": "moderate"},
            "plansByCrewLimit": {"1": []},
        }
        with patch("lambda_function.load_results", return_value=result_bundle):
            result = self._get("barapullah")
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(json.loads(result["body"])["basin"]["id"], "barapullah")

    def test_unknown_basin_is_rejected(self):
        result = self._get("delhi")
        self.assertEqual(result["statusCode"], 400)

    def test_result_for_the_wrong_basin_is_never_returned(self):
        wrong_basin = {"metadata": {"basin": {"id": "barapullah"}}}
        with patch("lambda_function.load_results", return_value=wrong_basin):
            result = self._get("victoria-s61")
        self.assertEqual(result["statusCode"], 500)


if __name__ == "__main__":
    unittest.main()
