"""
Tests for Area 4 — Provenance and Compositional Reasoning.

All tests run without live services: Nexum and vanilla clients are mocked.
"""

from __future__ import annotations

import sys
import os

# Allow imports from the area4-provenance package root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ---------------------------------------------------------------------------
# H4.4 — attribution_audit
# ---------------------------------------------------------------------------

class TestAttributionAudit:
    """Tests for run_attribution_audit (H4.4: < 5% false attribution rate)."""

    def _make_nexum_client(self, citations_per_question: list[list[dict]]):
        """Return a mock Nexum client that returns pre-canned citations."""

        class _Client:
            def __init__(self, citations_sequence):
                self._citations = iter(citations_sequence)

            def query(self, question: str) -> dict:
                try:
                    citations = next(self._citations)
                except StopIteration:
                    citations = []
                return {"answer": "mock answer", "citations": citations}

        return _Client(citations_per_question)

    def test_attribution_audit_structure(self):
        """Output dict has precision, recall, f1, false_attribution_rate keys."""
        from attribution_audit import run_attribution_audit

        questions = [
            {
                "question": "What is the termination clause?",
                "gold_answer_span": "thirty days written notice",
                "gold_doc_id": "doc_001",
                "gold_block_hint": "termination",
            }
        ]
        citations_sequence = [
            [
                {"block_id": "b1", "text": "Either party may terminate with thirty days written notice.", "doc_id": "doc_001"},
                {"block_id": "b2", "text": "Governing law is California.", "doc_id": "doc_001"},
                {"block_id": "b3", "text": "Unrelated clause about confidentiality.", "doc_id": "doc_002"},
            ]
        ]
        client = self._make_nexum_client(citations_sequence)
        result = run_attribution_audit(client, questions, expert_sample_size=1)

        assert "precision" in result
        assert "recall" in result
        assert "f1" in result
        assert "false_attribution_rate" in result
        assert "h4_4_supported" in result
        assert "per_question" in result
        assert isinstance(result["per_question"], list)

    def test_false_attribution_rate_lt_05(self):
        """19/20 cited blocks contain gold span → FAR = 0.05 → h4_4_supported True."""
        from attribution_audit import run_attribution_audit

        # 20 questions; each gets one citation
        # 19 citations contain the gold span, 1 does not → precision = 19/20 = 0.95
        questions = [
            {
                "question": f"Question {i}",
                "gold_answer_span": "gold span text",
                "gold_doc_id": f"doc_{i:03d}",
                "gold_block_hint": "clause",
            }
            for i in range(20)
        ]
        citations_sequence = []
        for i in range(20):
            if i < 19:
                citations_sequence.append([
                    {"block_id": f"b{i}", "text": "This contains the gold span text exactly.", "doc_id": f"doc_{i:03d}"}
                ])
            else:
                # Last question: citation does NOT contain gold span
                citations_sequence.append([
                    {"block_id": f"b{i}", "text": "Completely unrelated text here.", "doc_id": f"doc_{i:03d}"}
                ])

        client = self._make_nexum_client(citations_sequence)
        result = run_attribution_audit(client, questions, expert_sample_size=20)

        assert result["false_attribution_rate"] == 0.05
        assert result["h4_4_supported"] is True

    def test_false_attribution_rate_gt_05(self):
        """15/20 cited blocks contain gold span → FAR = 0.25 → h4_4_supported False."""
        from attribution_audit import run_attribution_audit

        questions = [
            {
                "question": f"Question {i}",
                "gold_answer_span": "gold span text",
                "gold_doc_id": f"doc_{i:03d}",
                "gold_block_hint": "clause",
            }
            for i in range(20)
        ]
        citations_sequence = []
        for i in range(20):
            if i < 15:
                citations_sequence.append([
                    {"block_id": f"b{i}", "text": "This contains the gold span text exactly.", "doc_id": f"doc_{i:03d}"}
                ])
            else:
                citations_sequence.append([
                    {"block_id": f"b{i}", "text": "Completely unrelated text here.", "doc_id": f"doc_{i:03d}"}
                ])

        client = self._make_nexum_client(citations_sequence)
        result = run_attribution_audit(client, questions, expert_sample_size=20)

        assert result["false_attribution_rate"] == 0.25
        assert result["h4_4_supported"] is False


# ---------------------------------------------------------------------------
# H4.2 — compositional_reasoning
# ---------------------------------------------------------------------------

class TestCompositionalReasoning:
    """Tests for build_multihop_questions and run_compositional_benchmark (H4.2)."""

    def test_multihop_questions_have_required_fields(self):
        """build_multihop_questions returns dicts with all required keys."""
        from compositional_reasoning import build_multihop_questions

        contracts = [
            {
                "contract_id": f"contract_{i}",
                "title": f"Service Agreement {i}",
                "clauses": {
                    "termination": "Either party may terminate with 30 days notice.",
                    "governing_law": "This agreement is governed by New York law.",
                    "non_compete": "Employee shall not compete for 12 months.",
                    "arbitration": "Disputes shall be resolved by binding arbitration.",
                    "integration": "This agreement constitutes the entire agreement.",
                },
            }
            for i in range(3)
        ]

        questions = build_multihop_questions(contracts, max_hops=3)

        assert isinstance(questions, list)
        assert len(questions) > 0
        required_keys = {"question", "n_hops", "gold_answer", "required_doc_ids", "required_clause_types"}
        for q in questions:
            assert required_keys.issubset(q.keys()), f"Missing keys: {required_keys - q.keys()}"
            assert isinstance(q["n_hops"], int)
            assert q["n_hops"] >= 1
            assert isinstance(q["required_doc_ids"], list)
            assert isinstance(q["required_clause_types"], list)

    def test_compositional_benchmark_structure(self):
        """run_compositional_benchmark output has all hop levels and summary fields."""
        from compositional_reasoning import run_compositional_benchmark

        class _MockClient:
            def query(self, question: str) -> dict:
                return {"answer": "mock answer", "citations": []}

        nexum = _MockClient()
        vanilla = _MockClient()

        questions = [
            {
                "question": f"Hop {n} question",
                "n_hops": n,
                "gold_answer": "mock gold answer",
                "required_doc_ids": [f"doc_{n}"],
                "required_clause_types": ["termination"],
            }
            for n in range(1, 6)
        ]

        result = run_compositional_benchmark(nexum, vanilla, questions)

        # Must have keys for each hop level 1-5
        for n in range(1, 6):
            assert n in result, f"Missing key for hop level {n}"
            assert "nexum_accuracy" in result[n]
            assert "vanilla_accuracy" in result[n]
            assert "nexum_better" in result[n]

        assert "min_hops_where_nexum_wins" in result
        assert "h4_2_supported" in result

    def test_nexum_better_at_3hops(self):
        """Mock accuracies where nexum wins at 3,4,5 hops → min_hops_where_nexum_wins=3, h4_2_supported=True."""
        from compositional_reasoning import run_compositional_benchmark

        class _NexumClient:
            def query(self, question: str) -> dict:
                n_hops = int(question.split("hop=")[1])
                # Return answer that matches gold only for n_hops >= 3
                answer = "CORRECT ANSWER" if n_hops >= 3 else "wrong answer"
                return {"answer": answer, "citations": []}

        class _VanillaClient:
            def query(self, question: str) -> dict:
                return {"answer": "wrong answer", "citations": []}

        # Build questions: multiple per hop level so accuracy is stable
        questions = []
        for n in range(1, 6):
            for _ in range(4):
                questions.append({
                    "question": f"Test question hop={n}",
                    "n_hops": n,
                    "gold_answer": "CORRECT ANSWER",
                    "required_doc_ids": [f"doc_{n}"],
                    "required_clause_types": ["termination"],
                })

        result = run_compositional_benchmark(
            _NexumClient(), _VanillaClient(), questions, judge_model=None
        )

        assert result["min_hops_where_nexum_wins"] == 3
        assert result["h4_2_supported"] is True


# ---------------------------------------------------------------------------
# H4.1 — auditability_report
# ---------------------------------------------------------------------------

class TestAuditabilityReport:
    """Tests for generate_auditability_comparison (H4.1)."""

    def test_auditability_block_traceable(self):
        """Nexum citations have block_id, vanilla don't → block_traceable differs."""
        from auditability_report import generate_auditability_comparison

        questions = [{"question": "What is the termination clause?"}]

        nexum_results = [
            {
                "answer": "Thirty days notice required.",
                "citations": [
                    {"block_id": "b001", "text": "Either party may terminate with thirty days notice.", "doc_id": "doc_001"},
                    {"block_id": "b002", "text": "Non-compete survives termination.", "doc_id": "doc_001"},
                ],
            }
        ]
        vanilla_results = [
            {
                "answer": "Thirty days notice required.",
                "source_nodes": [
                    {"text": "Contract document text paragraph 1 containing many sentences about various clauses.", "doc_id": "doc_001"},
                    {"text": "Another long paragraph from the same document covering multiple topics.", "doc_id": "doc_001"},
                ],
            }
        ]

        result = generate_auditability_comparison(nexum_results, vanilla_results, questions)

        assert result["nexum"]["block_traceable"] is True
        assert result["vanilla"]["block_traceable"] is False

    def test_auditability_nexum_wins_3_of_4(self):
        """Nexum wins on specificity, block_traceable, diversity but loses on count → nexum_more_auditable True."""
        from auditability_report import generate_auditability_comparison

        questions = [{"question": "Multi-doc question?"}]

        # Nexum: short precise citations from multiple docs (specificity WIN, diversity WIN)
        # Nexum: has block_id (block_traceable WIN)
        # Nexum: fewer citations than vanilla (count LOSE)
        nexum_results = [
            {
                "answer": "Answer referencing two documents.",
                "citations": [
                    {"block_id": "b001", "text": "Short precise clause.", "doc_id": "doc_001"},
                    {"block_id": "b002", "text": "Another short clause.", "doc_id": "doc_002"},
                ],
            }
        ]
        # Vanilla: long passages, single doc, many citations, no block_id
        vanilla_results = [
            {
                "answer": "Answer from one document.",
                "source_nodes": [
                    {"text": "Very long passage covering many unrelated topics in extensive detail spanning multiple sentences.", "doc_id": "doc_001"},
                    {"text": "Another very long passage also from the same document with many unrelated sentences.", "doc_id": "doc_001"},
                    {"text": "Yet another long passage still from the same document repeating similar information.", "doc_id": "doc_001"},
                    {"text": "Fourth long passage still from the same document.", "doc_id": "doc_001"},
                ],
            }
        ]

        result = generate_auditability_comparison(nexum_results, vanilla_results, questions)

        assert result["nexum_more_auditable"] is True
        assert "h4_1_signal" in result
