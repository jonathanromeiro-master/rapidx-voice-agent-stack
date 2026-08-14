#!/usr/bin/env python3
import json
import pathlib
import unittest


WORKFLOW_PATH = pathlib.Path(__file__).parents[1] / "workflows" / "jonathan-bdr-wayno-esquadrias.json"


class JonathanBdrWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.workflow = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
        self.nodes = {node["id"]: node for node in self.workflow["nodes"]}

    def test_is_a_routed_outbound_workflow_not_a_single_prompt(self):
        self.assertEqual(sum(node["type"] == "startCall" for node in self.nodes.values()), 1)
        self.assertGreaterEqual(sum(node["type"] == "agentNode" for node in self.nodes.values()), 7)
        self.assertEqual(sum(node["type"] == "endCall" for node in self.nodes.values()), 3)
        self.assertGreaterEqual(len(self.workflow["edges"]), 20)

    def test_preserves_interrupt_and_opt_out_guards(self):
        for node in self.nodes.values():
            if node["type"] == "endCall":
                self.assertFalse(node["data"]["allow_interrupt"])
            elif node["type"] in {"startCall", "agentNode"}:
                self.assertTrue(node["data"]["allow_interrupt"])

        opt_out_targets = {
            edge["source"]
            for edge in self.workflow["edges"]
            if edge["target"] == "12"
        }
        self.assertEqual(
            opt_out_targets,
            {"1", "2", "3", "4", "5", "6", "7", "8", "9"},
        )

    def test_requires_capacity_before_qualification(self):
        prompts = "\n".join(node["data"].get("prompt", "") for node in self.nodes.values())
        self.assertIn("Hoje a fábrica de vocês tem capacidade de pegar mais obras de linha Gold/Suprema?", prompts)
        self.assertIn("E vocês teriam abertura para implementar um trabalho visando levar a fábrica mais perto da capacidade máxima?", prompts)
        self.assertIn("Não finja que existe agenda conectada", prompts)


if __name__ == "__main__":
    unittest.main()
