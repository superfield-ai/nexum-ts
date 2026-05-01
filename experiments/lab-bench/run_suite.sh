#!/usr/bin/env bash
# Run the Nexum standard evaluation suite.
#
# Usage:
#   ./run_suite.sh [--nexum-url http://localhost:3000] [--output results/run-$(date +%Y%m%d)]
#
# Runs:
#   1. BEIR subset (trec-covid, hotpotqa, fiqa) — NDCG@10
#   2. HotpotQA Supporting Fact F1 — attribution proxy
#   3. CUAD span F1 — legal clause extraction
#
# Results written to $OUTPUT_DIR/{beir,hotpotqa,cuad}/

set -euo pipefail

NEXUM_URL="${NEXUM_URL:-http://localhost:3000}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="${OUTPUT_DIR:-results/run-$TIMESTAMP}"
MAX_QUESTIONS="${MAX_QUESTIONS:-500}"

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --nexum-url) NEXUM_URL="$2"; shift 2 ;;
    --output)    OUTPUT_DIR="$2"; shift 2 ;;
    *)           echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$OUTPUT_DIR"
echo "Nexum lab-bench suite"
echo "  Nexum:  $NEXUM_URL"
echo "  Output: $OUTPUT_DIR"
echo "  Time:   $TIMESTAMP"
echo ""

# -------------------------------------------------------------------------
# 1. Fetch fixtures (idempotent — skips if data already present)
# -------------------------------------------------------------------------
echo "=== Fixtures ==="
if [[ ! -f data/cuad/contracts.jsonl ]]; then
  echo "Downloading CUAD…"
  python fixtures/cuad.py --output-dir data/cuad
else
  echo "CUAD already present."
fi

if [[ ! -f data/hotpotqa/questions.jsonl ]]; then
  echo "Downloading HotpotQA (distractor split)…"
  python fixtures/hotpotqa.py --output-dir data/hotpotqa --split distractor
else
  echo "HotpotQA already present."
fi

echo ""

# -------------------------------------------------------------------------
# 2. BEIR subset
# -------------------------------------------------------------------------
echo "=== BEIR (trec-covid, hotpotqa, fiqa) ==="
python eval/beir_eval.py \
  --nexum-url "$NEXUM_URL" \
  --datasets trec-covid hotpotqa fiqa \
  --query-mode semantic \
  --output "$OUTPUT_DIR/beir"
echo ""

# -------------------------------------------------------------------------
# 3. HotpotQA Supporting Fact F1
# -------------------------------------------------------------------------
echo "=== HotpotQA Supporting Fact F1 ==="
python eval/hotpotqa_eval.py \
  --nexum-url "$NEXUM_URL" \
  --questions data/hotpotqa/questions.jsonl \
  --corpus data/hotpotqa/corpus.jsonl \
  --max-questions "$MAX_QUESTIONS" \
  --output "$OUTPUT_DIR/hotpotqa"
echo ""

# -------------------------------------------------------------------------
# 4. CUAD span F1
# -------------------------------------------------------------------------
echo "=== CUAD span F1 ==="
python eval/cuad_eval.py \
  --nexum-url "$NEXUM_URL" \
  --contracts data/cuad/contracts.jsonl \
  --qa data/cuad/qa.jsonl \
  --max-questions "$MAX_QUESTIONS" \
  --output "$OUTPUT_DIR/cuad"
echo ""

# -------------------------------------------------------------------------
# 5. Summary
# -------------------------------------------------------------------------
python - <<'PYEOF'
import json, sys, pathlib, os

out = os.environ.get("OUTPUT_DIR", "results")
lines = []

beir_summary = pathlib.Path(out) / "beir" / "summary.json"
if beir_summary.exists():
    d = json.loads(beir_summary.read_text())
    lines.append(f"BEIR mean NDCG@10: {d['mean_ndcg@10']:.4f}")
    for name, r in d.get("datasets", {}).items():
        lines.append(f"  {name}: NDCG@10={r['ndcg@10']:.4f}  Recall@100={r['recall@100']:.4f}")

hp_summary = pathlib.Path(out) / "hotpotqa" / "hotpotqa_summary.json"
if hp_summary.exists():
    d = json.loads(hp_summary.read_text())
    lines.append(f"HotpotQA  Answer F1: {d['answer_f1']:.4f}  Supporting Fact F1: {d['supporting_fact_f1']:.4f}")

cuad_summary = pathlib.Path(out) / "cuad" / "cuad_summary.json"
if cuad_summary.exists():
    d = json.loads(cuad_summary.read_text())
    lines.append(f"CUAD      Mean F1: {d['mean_f1']:.4f}  Has-answer accuracy: {d['has_answer_accuracy']:.4f}")

print("\n=== Results ===")
print("\n".join(lines))
summary_path = pathlib.Path(out) / "suite_summary.txt"
summary_path.write_text("\n".join(lines) + "\n")
print(f"\nSummary written to {summary_path}")
PYEOF
