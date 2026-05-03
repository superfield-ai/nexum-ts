# Area 7 — Differentiable Graph Model: Full Run

**Phase 3 of the Nexum research plan.** This experiment runs the complete Area 7 pipeline on a 100K-block synthetic legal corpus, building on the three Phase 0/1 spikes:

| Spike | Gate | Purpose |
|-------|------|---------|
| `g0-differentiability` | G0 / H7.1 | Proved the typed-link forward pass is differentiable (loss decreases within 1K steps on 10K blocks) |
| `g3-typed-signal` | G3 / H7.2 | Measured typed-link gradient signal (`contradicts` / `supports` develop distinct weight profiles) |
| `g4-onnx-lossless` | G4 / H7.3 | Confirmed ONNX round-trip is lossless (< 1% accuracy delta) on a 10K-block model |

This full run scales those findings to 100K blocks and adds two new measurements: the staleness decay curve (H7.4) and the ONNX Runtime throughput comparison (H7.5).

---

## H7.1–H7.5 Hypotheses

| ID | Claim | Pass criterion | Module |
|----|-------|----------------|--------|
| H7.1 | Typed-link forward pass is differentiable; loss converges in < 10K steps on domain tasks | Both task accuracies improve; loss decreases | `full_training.py` |
| H7.3 | ONNX-serialized model accuracy within 1% of live graph on held-out eval | `accuracy_delta < 0.01` | `onnx_production.py` |
| H7.4 | Frozen ONNX accuracy decays measurably as corpus updates accumulate | Decay curve captured; higher update rate = faster decay | `staleness_curve.py` |
| H7.5 | ONNX Runtime achieves ≥ 10x throughput vs. live graph traversal | `throughput_ratio >= 10.0` | `throughput_comparison.py` |

H7.2 (typed-link gradient signal separation) was measured in the G3 spike; this full run produces the supporting evidence at scale through the combined loss training signal.

---

## Two Deployment Paths

**Lossless path (G0 + G4 confirmed):** The live graph IS the differentiable model. ONNX export is a lossless serialization — same parameters, same computation graph. No distillation, no student model, no parameter reduction. Staleness is the only cost of freezing.

**Distillation path (G0 failed):** The graph is a retrieval substrate. A separate student model is trained using the typed-link curriculum (Area 2). The frozen artifact is competitive but not equivalent to the live graph. Accuracy delta is not zero by construction.

This experiment runs the lossless path. Both paths converge at H7.4 (staleness curve) — the question of when to re-export is independent of how the export was produced.

---

## Module Structure

```
area7-differentiable-graph/
├── full_training.py          # H7.1: 100K-block training, clause + contradiction tasks
├── onnx_production.py        # H7.3: ONNX export + round-trip accuracy comparison
├── staleness_curve.py        # H7.4: frozen model accuracy decay simulation
├── throughput_comparison.py  # H7.5: ONNX Runtime vs. live graph latency benchmark
├── run_area7.py              # Orchestrator CLI
├── _run_helpers.py           # Internal: build_trained_model_and_data()
├── tests/
│   └── test_area7.py         # 8 tests, all CPU, no GPU required
├── results/                  # Output JSON + PNG (gitignored for large files)
└── pyproject.toml
```

---

## Usage

### Small / CI run (fast, ~1–2 min on CPU)

```bash
cd experiments/area7-differentiable-graph
python run_area7.py --n-blocks 10000 --n-steps 500
```

### Full run (100K blocks, 5K steps)

```bash
python run_area7.py \
  --n-blocks 100000 \
  --n-steps 5000 \
  --output results/area7_results.json
```

### Skip optional phases

```bash
# Skip staleness (always fast and deterministic, but can be skipped):
python run_area7.py --skip-staleness-curve

# Skip throughput benchmark (requires onnxruntime):
python run_area7.py --skip-throughput
```

### Run tests

```bash
# From repo root:
pytest experiments/area7-differentiable-graph/tests/ -v

# From the area7 directory:
cd experiments/area7-differentiable-graph
pytest tests/ -v
```

---

## Results Summary Format

`results/area7_results.json` contains:

```json
{
  "config": { ... },
  "phases": {
    "h7_1_training": {
      "h7_1_supported": true,
      "final_clause_accuracy": 0.82,
      "final_contradiction_accuracy": 0.79,
      "improvement_clause": 0.12,
      "improvement_contradiction": 0.08,
      "loss_curve": [ ... ],
      ...
    },
    "h7_3_onnx": {
      "h7_3_supported": true,
      "pytorch_accuracy": 0.79,
      "onnx_accuracy": 0.79,
      "accuracy_delta": 0.000,
      "onnx_model_size_mb": 4.2,
      ...
    },
    "h7_4_staleness": {
      "10":    { "accuracy_by_day": [...], "half_life_days": 12.3 },
      "100":   { "accuracy_by_day": [...], "half_life_days": 5.1  },
      "1000":  { "accuracy_by_day": [...], "half_life_days": 1.8  },
      "10000": { "accuracy_by_day": [...], "half_life_days": 0.4  },
      "decay_curves_plotted": true
    },
    "h7_5_throughput": {
      "h7_5_supported": true,
      "onnx_p50_ms": 3.2,
      "live_graph_p50_ms": 50.0,
      "throughput_ratio": 15.6,
      ...
    }
  }
}
```

`results/area7_staleness_curve.png` — accuracy vs. days-since-export for all four update rates.

---

## Dependencies

See `pyproject.toml`. Core: `torch>=2.2`, `torch-geometric>=2.5`, `onnx>=1.16`, `onnxruntime>=1.18`, `scipy>=1.13`, `matplotlib`.

Install:
```bash
pip install -e ".[dev]"
```
