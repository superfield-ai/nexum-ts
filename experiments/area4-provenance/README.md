# Area 4 — Provenance and Compositional Reasoning

**Phase 2** of the Nexum research plan (see `docs/research.md`, Area 4).

This area tests whether block-level provenance produces auditable, accurate
answers for legal/medical buyers, and whether multi-hop compositional
reasoning requires graph traversal depth that vanilla RAG structurally
cannot provide.

---

## Hypotheses

### H4.1 — Block-level auditability (measurement)

**Claim:** For tasks that decompose into graph queries, a retrieval-augmented
client with block-level provenance produces more auditable outputs than a
static model, with no accuracy penalty.

**Operational definition of "more auditable":**
- Citation specificity (shorter cited passage = more precise)
- Citation count per answer
- Source diversity (distinct documents cited)
- Block traceability (can the citation be traced to a specific paragraph?)

Nexum is declared more auditable if it wins on >= 3 of 4 metrics.

Module: `auditability_report.py` → `generate_auditability_comparison()`

---

### H4.2 — Multi-hop compositional reasoning

**Claim:** Multi-step questions ("does clause A in contract X override clause B
in contract Y given law Z?") require >= 3-hop graph traversal; Nexum only
matches or beats vanilla RAG accuracy above that hop-depth threshold.

**Target:** `nexum_better` at all measured hop depths >= 3.

Module: `compositional_reasoning.py` → `build_multihop_questions()`,
`run_compositional_benchmark()`

---

### H4.3 — Train/serve skew (measurement, no a priori threshold)

**Claim (recast):** Measure Nexum (always-live corpus) vs. stale vanilla RAG
(corpus frozen at T-24h) vs. live vanilla RAG on recency-sensitive questions.
Report the skew penalty and delta; do not fabricate an effect size.

Module: `skew_test.py` → `simulate_skew_test()`

---

### H4.4 — False attribution rate < 5% (highest commercial value)

**Claim:** The graph's typed links enable attribution — tracing exactly which
blocks contributed to a generated answer — with < 5% false attribution rate,
something structurally impossible for dense transformer weights.

**Target:** `false_attribution_rate <= 0.05` (precision >= 0.95)

Module: `attribution_audit.py` → `run_attribution_audit()`

Reuses `attribution_f1()` from `experiments/g2-wedge-demo/attribution_eval.py`.

---

## Setup

```bash
cd experiments/area4-provenance
pip install -e ".[dev]"
```

---

## Run

```bash
python run_area4.py \
  --nexum-url http://localhost:3000 \
  --anthropic-key $ANTHROPIC_API_KEY \
  --cuad-path ../../experiments/lab-bench/data/cuad \
  --max-questions 100 \
  --output results/area4_results.json
```

Optional flags:
- `--skip-h4-2` — skip the compositional reasoning benchmark
- `--skip-h4-3` — skip the skew measurement

---

## Tests

```bash
pytest tests/ -v
```

All 8 tests run without live services (Nexum and vanilla clients are mocked).
