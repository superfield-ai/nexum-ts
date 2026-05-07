"""
run_benchmark.py — Main entry point for the G1 Postgres scale benchmark.

Usage::

    python run_benchmark.py \\
        --db-url postgresql://localhost/nexum_bench \\
        --scales 1m 5m \\
        --n-queries 100 \\
        --output results/g1_result.json

    # Skip ingest — restore from local cache instead (fast path)
    python run_benchmark.py \\
        --db-url postgresql://nexum:nexum@localhost:5433/nexum_bench \\
        --from-cache --scales 1m \\
        --n-queries 100

Runs ingestion + benchmark at each scale.
Writes a structured results JSON and prints pass/fail for G1.
Exit code 0 if P99 < 500 ms at all tested scales, else 1.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

import psycopg2
import psycopg2.extras

from ingest import generate_and_ingest, DOMAIN_MIXES
from benchmark import run_latency_benchmark
from schema import ensure_schema
from sizing_memo import compute_sizing_memo
from db_cache import cmd_restore, CACHE_DIR, _dump_path


# ---------------------------------------------------------------------------
# Scale parsing
# ---------------------------------------------------------------------------

def _parse_scale(s: str) -> int:
    """Parse a scale string like '1m', '5m', '20m', '100m' to an int."""
    s = s.strip().lower()
    if s.endswith("m"):
        return int(float(s[:-1]) * 1_000_000)
    if s.endswith("k"):
        return int(float(s[:-1]) * 1_000)
    return int(s)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _connect(db_url: str) -> "psycopg2.connection":
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    return conn


def _truncate_tables(conn) -> None:
    """Remove all rows from Nexum tables to start a fresh benchmark scale."""
    with conn.cursor() as cur:
        cur.execute(
            "TRUNCATE links, version_blocks, blocks, "
            "document_versions, documents RESTART IDENTITY CASCADE"
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="G1 Postgres scale floor benchmark — Nexum H1.1 Phase 0 Spike B"
    )
    parser.add_argument(
        "--db-url",
        default="postgresql://localhost/nexum_bench",
        help="Postgres connection URL (default: postgresql://localhost/nexum_bench)",
    )
    parser.add_argument(
        "--scales",
        nargs="+",
        default=["1m", "5m"],
        metavar="SCALE",
        help="Corpus sizes to benchmark, e.g. 1m 5m 20m (default: 1m 5m)",
    )
    parser.add_argument(
        "--n-queries",
        type=int,
        default=100,
        metavar="N",
        help="Queries per mode per scale (default: 100)",
    )
    parser.add_argument(
        "--domain-mix",
        choices=list(DOMAIN_MIXES.keys()),
        default="mixed",
        help="Domain mix for synthetic corpus generation (default: mixed)",
    )
    parser.add_argument(
        "--embedding-dim",
        type=int,
        default=1536,
        help="Embedding dimensionality (default: 1536)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Batch size for execute_values inserts (default: 1000)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed (default: 42)",
    )
    parser.add_argument(
        "--output",
        default="results/g1_result.json",
        metavar="PATH",
        help="Output JSON path (default: results/g1_result.json)",
    )
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Skip schema creation (assumes schema already applied)",
    )
    parser.add_argument(
        "--from-cache",
        action="store_true",
        help=(
            "Restore database from ~/.cache/nexum/ dump instead of re-ingesting. "
            "Requires a prior 'python db_cache.py dump' run. "
            "Skips ingest for the first scale only (assumes single-scale cache)."
        ),
    )
    parser.add_argument(
        "--docker-container",
        default="nexum-bench",
        help="Docker container name for cache restore (default: nexum-bench)",
    )
    args = parser.parse_args(argv)

    scales = [_parse_scale(s) for s in args.scales]
    domain_mix = DOMAIN_MIXES[args.domain_mix]

    # ── cache restore path ────────────────────────────────────────────────────
    if args.from_cache:
        scale_label = args.scales[0].lower().rstrip("m") + "m" if args.scales else "1m"
        dim = args.embedding_dim
        dump = _dump_path(scale_label, dim)
        if not dump.exists():
            print(
                f"[G1] ERROR — --from-cache requested but no dump found at {dump}\n"
                f"[G1] Run: python db_cache.py dump --scale {scale_label} --dim {dim}",
                file=sys.stderr,
            )
            return 1

        import types
        restore_args = types.SimpleNamespace(
            docker_container=args.docker_container,
            db_url=args.db_url,
            scale=scale_label,
            dim=dim,
            jobs=4,
        )
        print(f"[G1] --from-cache: restoring from {dump} …")
        rc = cmd_restore(restore_args)
        if rc != 0:
            return rc
        print("[G1] Cache restore complete — skipping ingest for first scale.")

    print(f"[G1] Connecting to {args.db_url!r} …")
    try:
        conn = _connect(args.db_url)
    except Exception as exc:
        print(f"[G1] ERROR — cannot connect: {exc}", file=sys.stderr)
        return 1

    if not args.skip_schema and not args.from_cache:
        print("[G1] Applying schema …")
        try:
            ensure_schema(conn)
        except Exception as exc:
            print(f"[G1] ERROR — schema apply failed: {exc}", file=sys.stderr)
            conn.close()
            return 1

    all_results: list[dict[str, Any]] = []
    overall_pass = True
    cache_used_for: set[str] = set()

    for scale_idx, n_blocks in enumerate(scales):
        scale_label = f"{n_blocks // 1_000_000}M" if n_blocks >= 1_000_000 else str(n_blocks)
        print(f"\n[G1] === Scale: {scale_label} blocks ===")

        use_cache = args.from_cache and scale_idx == 0
        if use_cache:
            # Data already restored — measure what's there without truncating/re-ingesting.
            print(f"[G1] Using cached data (skipping truncate + ingest) …")
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM blocks")
                cached_n = cur.fetchone()[0]
                cur.execute("SELECT pg_total_relation_size('blocks') + pg_total_relation_size('links')")
                cached_storage = cur.fetchone()[0]
            ingest_stats = {
                "n_blocks": cached_n,
                "n_documents": None,
                "n_links": None,
                "embedding_dim": args.embedding_dim,
                "storage_bytes": cached_storage,
                "embedding_storage_bytes": cached_n * args.embedding_dim * 4,
                "ingest_time_seconds": 0.0,
                "source": "cache",
            }
            cache_used_for.add(scale_label)
            print(f"[G1] Cached data: {cached_n:,} blocks, {cached_storage / 1e9:.2f} GB")
        else:
            print(f"[G1] Truncating existing data …")
            _truncate_tables(conn)

            print(f"[G1] Ingesting {n_blocks:,} blocks (domain_mix={args.domain_mix}) …")
            ingest_stats = generate_and_ingest(
                conn=conn,
                n_blocks=n_blocks,
                domain_mix=domain_mix,
                embedding_dim=args.embedding_dim,
                seed=args.seed,
                batch_size=args.batch_size,
            )
            print(
                f"[G1] Ingest done in {ingest_stats['ingest_time_seconds']:.1f}s — "
                f"{ingest_stats['n_blocks']:,} blocks, "
                f"{ingest_stats['n_links']:,} links, "
                f"{ingest_stats['storage_bytes'] / 1e9:.2f} GB total, "
                f"{ingest_stats['embedding_storage_bytes'] / 1e9:.2f} GB embeddings"
            )

        print(f"[G1] Running latency benchmark ({args.n_queries} queries/mode) …")
        bench = run_latency_benchmark(
            conn=conn,
            corpus_id=scale_label,
            n_queries=args.n_queries,
            embedding_dim=args.embedding_dim,
            seed=args.seed,
        )

        status = "PASS" if bench["pass_g1"] else "FAIL"
        if not bench["pass_g1"]:
            overall_pass = False

        print(
            f"[G1] {scale_label} → {status}\n"
            f"       semantic:  P50={bench['semantic']['p50_ms']:.1f}ms  "
            f"P99={bench['semantic']['p99_ms']:.1f}ms\n"
            f"       fulltext:  P50={bench['fulltext']['p50_ms']:.1f}ms  "
            f"P99={bench['fulltext']['p99_ms']:.1f}ms\n"
            f"       graph 2h:  P50={bench['graph_traversal']['2_hop']['p50_ms']:.1f}ms  "
            f"P99={bench['graph_traversal']['2_hop']['p99_ms']:.1f}ms\n"
            f"       graph 4h:  P50={bench['graph_traversal']['4_hop']['p50_ms']:.1f}ms  "
            f"P99={bench['graph_traversal']['4_hop']['p99_ms']:.1f}ms\n"
            f"       graph 6h:  P50={bench['graph_traversal']['6_hop']['p50_ms']:.1f}ms  "
            f"P99={bench['graph_traversal']['6_hop']['p99_ms']:.1f}ms"
        )

        all_results.append(
            {
                "scale_label": scale_label,
                "ingest": ingest_stats,
                "benchmark": bench,
            }
        )

    # Sizing memo (always computed — arithmetic, not experiment)
    sizing = compute_sizing_memo(embedding_dim=args.embedding_dim)

    output = {
        "gate": "G1",
        "hypothesis": "H1.1",
        "pass_criterion": "P99 < 500ms at 5M blocks for all query modes",
        "overall_pass": overall_pass,
        "scales_tested": [s["scale_label"] for s in all_results],
        "results": all_results,
        "sizing_memo": sizing,
    }

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2)
    print(f"\n[G1] Results written to {args.output}")

    overall_label = "PASS" if overall_pass else "FAIL"
    print(f"[G1] Overall G1 gate: {overall_label}")

    conn.close()
    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(main())
