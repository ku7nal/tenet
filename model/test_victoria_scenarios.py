import unittest

from build_victoria_scenarios import build_model_input, feasible_sets, rank_actions, recommend_plans, source_network


class VictoriaScenarioTests(unittest.TestCase):
    def test_model_uses_s61_source_links_and_documents_unit_assumptions(self):
        network = source_network()
        model = build_model_input({"DGM000990"}, network, {"id": "heavy", "totalDepthMm": 40, "durationHours": 2})
        self.assertIn("DGM000990", model)
        self.assertIn("0.25000", model)  # source diameter 250, assumed millimetres
        self.assertIn("diameters treated as millimetres", model)
        self.assertIn("external-link", model)

    def test_cleaning_restores_only_the_selected_pipe_diameter(self):
        network = source_network()
        profile = {"id": "heavy", "totalDepthMm": 40, "durationHours": 2}
        blocked = build_model_input(set(), network, profile)
        cleaned = build_model_input({"DGM000990"}, network, profile)
        self.assertIn("0.19365", blocked)
        self.assertIn("0.25000", cleaned)

    def test_feasible_sets_and_plan_selection_respect_crew_limit(self):
        candidates = ["A", "B", "C", "D"]
        self.assertEqual(len(feasible_sets(candidates)), 15)
        outcomes = {combo: float(100 - 10 * len(combo) - (5 if "B" in combo else 0)) for combo in feasible_sets(candidates)}
        plans = recommend_plans(candidates, outcomes, 2)
        self.assertEqual(plans["network-aware"]["drainIds"], ["A", "B"])
        self.assertEqual(plans["network-aware"]["totalOverflowM3"], 75.0)
        self.assertLessEqual(len(plans["network-aware"]["drainIds"]), 2)

    def test_single_asset_ranking_uses_overflow_reduction_then_asset_id(self):
        outcomes = {(): {"J1": 100}, ("A",): {"J1": 80}, ("B",): {"J1": 50}, ("C",): {"J1": 80}}
        ranking = rank_actions(["C", "B", "A"], outcomes)
        self.assertEqual([item["assetId"] for item in ranking], ["B", "A", "C"])
        self.assertEqual([item["overflowReductionM3"] for item in ranking], [50, 20, 20])


if __name__ == "__main__":
    unittest.main()
