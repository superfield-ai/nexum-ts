# Nexum — Research Plan

## Mission

Find the optimal storage architecture for heterogeneous document corpora across different institutional contexts (legal firms, hospitals, research groups, enterprises), and determine how far that architecture can stretch — from query-time retrieval to training-data curriculum to live inference substrate — before the efficiency trade-offs become untenable.

---

## Core Thesis

> A sufficiently structured graph database, combined with dense vector embeddings on every node, can serve simultaneously as:
> 1. A **queryable knowledge store** (RAG, semantic search, graph traversal)
> 2. A **training curriculum** (ordered, typed, weighted knowledge for fine-tuning or continual learning)
> 3. A **live inference substrate** (replacing static model weight files — ONNX, GGUF, safetensors — with a graph that is queried at inference time by specialized clients)
>
> The price is an order-of-magnitude inference latency penalty. The benefit is **isomorphism**: one artifact serves all three roles, with real-time updating and no synchronization lag between "what the model knows" and "what the store contains."

This thesis is unproven. The research plan below is designed to test it systematically.

---

## Research Areas

### Area 1 — Storage Architecture Fitness

**Question:** For a given institution (legal firm, hospital, research lab, enterprise), what storage configuration minimizes total cost of ownership across ingestion throughput, query latency, storage footprint, and update fidelity?

**Sub-questions:**
- How does corpus heterogeneity (mixed document types, languages, schemas) affect the fitness of pure-relational vs. pure-graph vs. hybrid storage?
- At what corpus scale does PostgreSQL's recursive CTE traversal become the binding constraint, and what is the crossover point to a dedicated graph DB (Kuzu, Neptune, TigerGraph)?
- Is pgvector HNSW still optimal for ANN search at 100M+ blocks, or does a dedicated vector store (Qdrant, Weaviate, Milvus) pay off?
- How much does schema rigidity vs. JSONB flexibility matter across domains?

**Hypotheses to test:**
- H1.1: PostgreSQL with pgvector is sufficient for corpora below 20M blocks with mixed document types, with no measurable query quality degradation vs. a specialized graph DB.
- H1.2: Heterogeneous corpora (e.g., PDFs + structured tables + code) degrade embedding quality more than they degrade structural link quality — meaning graph traversal outperforms semantic search in cross-type queries.
- H1.3: For a single-institution deployment, embedding storage dominates total DB size (> 70%) at 1536 dimensions, making quantization (int8 / binary) the most impactful optimization lever.

**Experiments:**
- Synthetic benchmark: build corpora at 1M / 5M / 20M / 100M blocks across 3 domain mixes (legal, medical, mixed). Measure query latency P50/P99 for all three query modes at each scale.
- Schema comparison: deploy same corpus into PostgreSQL, Kuzu, and Neo4j. Compare traversal time for 2-hop, 4-hop, 6-hop queries on the same link graph.
- Embedding dimension ablation: test 512 / 768 / 1024 / 1536 dimensions. Measure recall@10 on domain-specific test sets to find the minimum useful dimensionality per domain.

---

### Area 2 — Graph as Training Curriculum

**Question:** Can the typed link graph in Nexum serve directly as a training curriculum for a language model, and if so, what curriculum construction strategies produce the best downstream performance?

**Sub-questions:**
- Does link type (cites / contradicts / elaborates / supports / is-exception-to) encode enough signal to generate useful contrastive training pairs?
- Can a walk policy over the block graph produce training sequences that outperform random sampling of the same corpus?
- Does block-level dedup (shared UUIDs across document versions) naturally produce curriculum diversity, or does it create repetition artifacts?
- What is the minimum graph density (links per block) before curriculum-derived training improves over a flat corpus baseline?

**Hypotheses to test:**
- H2.1: Contrastive pairs drawn from `contradicts` and `supports` links produce better domain classification fine-tunes than randomly sampled pairs from the same corpus.
- H2.2: A BFS walk policy seeded from high-centrality blocks produces more coherent training sequences than random walk, as measured by next-token perplexity on held-out domain text.
- H2.3: The `ai` link layer (LLM-classified) produces higher-quality training signal than the `structural` layer (citation extraction) for tasks requiring reasoning, while `structural` is superior for factual retrieval tasks.
- H2.4: Training on graph-derived sequences generalizes better across document versions (measured by version-delta test sets) than flat-corpus training because the curriculum reflects semantic rather than positional structure.

**Experiments:**
- Construct curriculum from a legal corpus (e.g., 10K contracts). Fine-tune a base LM on three curricula: (a) flat random, (b) BFS walk over structural links, (c) contrastive pairs from AI links. Evaluate on clause extraction and contradiction detection tasks.
- Vary graph density by threshold: include only AI links with confidence > 0.5, > 0.7, > 0.9. Measure downstream task performance as a function of link confidence cutoff.
- Ablate link type: train separate models with only `structural`, only `semantic`, only `ai` links. Compare on 3 tasks per domain.

---

### Area 3 — Graph as Inference Substrate

**Question:** Can a graph of embedded blocks serve as the operational store for inference — replacing a static weight file — and what is the realistic efficiency floor?

**Sub-questions:**
- What is the latency multiplier between a static ONNX/GGUF forward pass and a graph-resident inference loop (iterative ANN retrieval + aggregation) for equivalent tasks?
- What client architecture minimizes the overhead of graph-resident inference? (sparse attention over retrieved blocks, iterative retrieval-then-generate, differentiable memory networks)
- Does the graph's isomorphism property (training data = inference target = same store) produce measurable accuracy gains on tasks involving recently updated knowledge, compared to static models with stale weights?
- What update granularity is necessary for the "real-time updating model" claim to hold in practice? Per-block insert? Per-link insert? Per-query refresh?

**Hypotheses to test:**
- H3.1: For factoid Q&A over a corpus updated in the last 24 hours, a graph-resident inference client outperforms a fine-tuned static model trained on yesterday's snapshot, purely due to recency — even at 10x latency penalty.
- H3.2: The latency gap between graph-resident inference and static model inference can be bounded to 20–50x (not 1000x) with a two-tier cache: hot blocks (high degree, recent access) in memory, cold blocks on disk-backed HNSW.
- H3.3: A transformer with sparse cross-attention over ANN-retrieved blocks (instead of full KV cache) produces outputs within 5% BLEU/ROUGE of a comparably sized static model on summarization tasks, while accessing only 1–5% of the graph per inference call.
- H3.4: Inserting a new block into the graph and updating its links propagates to inference behavior within one query cycle without any retraining step — demonstrating the isomorphism property empirically.

**Experiments:**
- Latency benchmark: implement a minimal graph-inference client (ANN retrieval → block aggregation → LM generation). Measure tokens/sec vs. llama.cpp GGUF baseline on same hardware for 5 task types.
- Cache tier experiment: simulate Zipfian access patterns over 1M blocks. Measure hit rates and effective latency with in-memory cache sizes of 1%, 5%, 10% of corpus.
- Knowledge recency test: take a corpus with a known "fact change" (e.g., a contract amendment). Update only the delta blocks in the graph. Compare graph-resident client vs. static model on questions that depend on the amendment.
- Sparse attention ablation: implement retrieval-augmented generation where the number of retrieved blocks per step varies (k=1, 5, 10, 50, 100). Plot task performance vs. latency.

---

### Area 4 — Isomorphism Properties and Trade-offs

**Question:** What does the isomorphism between training data, inference data, and storage actually buy, and where does it break down?

**Sub-questions:**
- Does a unified store reduce synchronization bugs (train/serve skew) measurably? What is the baseline frequency of such bugs in two-store systems?
- Are there tasks where static weights are strictly superior regardless of recency? (e.g., tasks requiring deep compositional reasoning that cannot be decomposed into block-level retrieval)
- What is the minimum model size for a "graph-resident" client to be competitive? Is there a size floor below which graph retrieval cannot compensate for lack of parametric knowledge?
- Can the typed link structure be used to explain inference outputs (provenance-traced answers) in ways that static models cannot?

**Hypotheses to test:**
- H4.1: For any task that can be expressed as a graph query (retrieval, comparison, citation tracing), a graph-resident client with provenance tracking produces more auditable outputs than a static model, with no accuracy penalty.
- H4.2: Tasks requiring multi-step compositional reasoning (e.g., "does clause A in contract X override clause B in contract Y given law Z?") require at least 3-hop graph traversal, and graph-resident clients only match static model accuracy above a minimum graph density threshold.
- H4.3: Train/serve skew bugs (where the model's knowledge diverges from the store's knowledge) account for > 30% of retrieval failures in two-store systems, and the isomorphic design eliminates this class of failure entirely.
- H4.4: The graph's typed links enable attribution — tracing exactly which blocks contributed to a generated answer — with < 5% false attribution rate, something structurally impossible for dense transformer weights.

**Experiments:**
- Adversarial skew test: deliberately introduce a 24-hour lag between corpus update and model re-training. Measure task degradation. Then repeat with graph-resident client on the same updated corpus. Compare.
- Compositional reasoning benchmark: construct multi-hop question sets requiring 2, 3, 4, 5 hops through the link graph. Measure accuracy as a function of hops for graph-resident vs. static model.
- Attribution audit: on a held-out QA set, collect predicted source blocks from the graph-resident client. Have domain experts verify attribution accuracy.

---

### Area 5 — Update Semantics and Live Consistency

**Question:** When one store simultaneously serves as knowledge base, training curriculum, and inference target, what are the consistency guarantees required for the "real-time updating model" claim to hold — and what breaks when they are violated?

The isomorphism thesis assumes that inserting a block into the graph immediately makes that knowledge available at inference time. This is not trivially true. Embeddings must be computed, HNSW indexes must be updated, link classifiers must run, and any cached inference state must be invalidated. The question is how much of this must be synchronous before the system can claim real-time behavior, and what the practical latency floor is.

**Sub-questions:**
- What is the end-to-end latency from block insertion to that block being retrievable in an inference call — broken down by pipeline stage (embed, index, link, cache invalidation)?
- Is partial visibility safe? If a block is embedded and indexed but its AI links haven't been classified yet, does serving it degrade inference quality or produce inconsistent results?
- How does update contention behave under high-ingest conditions? If 10K blocks are inserted simultaneously (e.g., a new document version), does HNSW index build time create a retrieval dead zone?
- Can the versioning model (shared block UUIDs across document versions) be exploited to make updates atomic at the version level — presenting a consistent snapshot to inference clients while the new version is being indexed?
- What is the minimum embedding refresh granularity? If a block's content changes slightly (typo fix, metadata update), does its embedding drift enough to matter for retrieval, and can drift be detected cheaply without re-embedding the full corpus?

**Hypotheses to test:**
- H5.1: End-to-end insertion-to-retrieval latency is dominated by the HNSW index update step (not embedding or link classification), and can be reduced below 500ms for single-block inserts by deferring index consolidation to a background process.
- H5.2: Serving partially-linked blocks (embedded + indexed but AI links not yet classified) degrades inference quality by less than 5% on reasoning tasks — meaning the embedding alone carries most of the retrieval signal, and link classification is a quality enhancement rather than a correctness requirement.
- H5.3: Version-level atomicity (exposing a new document version to inference clients only after all its blocks are fully indexed and linked) eliminates partial-visibility artifacts at the cost of a latency window proportional to document size — and that window is acceptable (< 60 seconds) for documents up to 500 pages.
- H5.4: Embedding drift after minor content edits (< 5% token change) is below the retrieval discrimination threshold for 95% of blocks — meaning selective re-embedding triggered by content hash change is sufficient, and full corpus re-embedding is never required for incremental updates.
- H5.5: Under high-ingest load (10K blocks/minute), a write-optimized insertion path (defer HNSW index build, serve new blocks via sequential scan until index catches up) outperforms a synchronous index-on-insert path in end-to-end query recall, because the sequential scan fallback for un-indexed blocks is cheaper than the index build latency stall.

**Experiments:**
- Insertion latency breakdown: instrument the ingestion pipeline to record time at each stage (parse, embed, index insert, link classify, cache invalidate). Measure P50/P99 for single-block and batch (1K block) inserts.
- Partial-visibility eval: build a 100-question eval set. Answer each question at three pipeline stages: (a) after embedding only, (b) after structural links, (c) after AI links. Measure accuracy delta across stages.
- Version atomicity test: ingest a 500-page document. Measure the wall-clock window between first block insert and full version availability. Evaluate inference quality at 25%, 50%, 75%, 100% indexing completion.
- Embedding drift detection: take 10K blocks. Apply random minor edits (1–10% token substitution). Re-embed and measure cosine distance to original. Identify the token-change threshold at which retrieval rank shifts by more than 3 positions.
- High-ingest contention: simulate 10K blocks/minute ingest against a live query workload. Compare synchronous index-on-insert vs. deferred index consolidation on query recall and ingest throughput.

---

### Area 6 — GPU Acceleration for PostgreSQL Extensions

**Question:** Can GPU-accelerated operations inside PostgreSQL close the efficiency gap between graph-resident inference and static model inference — and which pipeline stages benefit most?

The order-of-magnitude latency penalty in the inference substrate thesis comes from three places: ANN retrieval (HNSW graph walk on CPU), embedding computation (either network round-trip or CPU inference), and aggregation (weighted sum or attention over retrieved block vectors). All three are parallelizable. GPUs are already the standard compute substrate for embedding models and attention. The question is whether bringing that compute inside — or immediately adjacent to — the PostgreSQL process is architecturally viable and worth the operational complexity.

**Sub-questions:**
- Which operation in the inference step function (ANN retrieval, embedding, aggregation/attention) has the highest GPU speedup potential, and what is the crossover corpus size at which GPU wins?
- Can pgml's in-process model execution be extended to GPU-backed inference (via CUDA or ROCm), and what is the memory pressure implication for the Postgres buffer pool?
- Is a GPU-colocated sidecar (a small inference server on the same host, accessed via Unix socket) a better architecture than true in-process GPU execution for latency and operational simplicity?
- For the HNSW index specifically: do GPU-accelerated ANN libraries (FAISS-GPU, cuVS/RAFT) outperform pgvector's CPU HNSW at the corpus scales relevant to Nexum (1M–100M blocks), and can their indexes be kept in sync with the Postgres block table?
- Does batching inference requests (accumulating N queries before a GPU kernel launch) improve throughput enough to offset the added latency, and what is the optimal batch size per corpus scale?

**Hypotheses to test:**
- H6.1: GPU-accelerated ANN search (FAISS-GPU or cuVS) outperforms pgvector CPU HNSW by > 10x on throughput at 10M+ blocks, at equivalent recall@10, making it the dominant optimization lever for the inference substrate at scale.
- H6.2: In-process GPU embedding (pgml + CUDA) reduces single-block embedding latency below 5ms, eliminating the embedding stage as a bottleneck and making HNSW index update the new binding constraint.
- H6.3: A GPU-colocated sidecar accessed via Unix socket achieves within 20% of true in-process GPU latency, with significantly lower operational complexity — making it the preferred architecture over modifying the Postgres process directly.
- H6.4: Batched GPU inference (batch size 32–128) improves throughput by > 5x vs. single-query GPU inference, and the added queuing latency (< 50ms at batch size 32) is acceptable for non-interactive workloads (curriculum generation, background link classification).

**Experiments:**
- ANN benchmark: load 10M blocks into pgvector (CPU HNSW), FAISS-GPU (flat + IVF), and cuVS/RAFT HNSW. Measure throughput (queries/sec) and recall@10 at equivalent index build time. Run on same GPU hardware.
- Embedding latency breakdown: compare (a) OpenAI API round-trip, (b) CPU-local model via pgml, (c) GPU-local model via pgml + CUDA. Measure P50/P99 for single and batched (32, 128) requests.
- Sidecar vs. in-process: implement both architectures. Measure latency for the full inference step function (ANN + embed + aggregate). Compare on a 1000-query workload.
- Batch size sweep: for GPU embedding and GPU ANN, sweep batch sizes 1, 8, 32, 128, 512. Measure throughput and P99 latency. Identify the knee of the curve.
- Buffer pool pressure: measure Postgres shared_buffers hit rate before and after loading a GPU-backed embedding model into the process. Quantify eviction pressure on the block table data pages.

---

### Area 7 — Frozen Artifact Export (ONNX / Safetensors / GGUF from the Graph)

**Question:** Can the Nexum graph be compiled into a standard optimized inference artifact — ONNX, Safetensors, or GGUF — that captures the knowledge state of the store at a point in time, enabling high-performance static inference where the latency penalty of graph-resident inference is unacceptable?

This closes the loop on the core thesis. The isomorphic store is the live, authoritative source of knowledge. But some deployments — mobile, edge, latency-critical APIs, air-gapped environments — cannot tolerate the 20–50x latency penalty of graph-resident inference even with GPU acceleration (Area 6). The answer is not to abandon isomorphism, but to treat the graph as a compiler input: periodically "freeze" its current state into a standard weights artifact, deploy that artifact for high-performance inference, and accept that the frozen artifact is a snapshot — current as of its export timestamp — while the live graph continues to update.

The research question is whether a graph-derived frozen artifact is competitive with a conventionally trained model of equivalent parameter count, and what the right export architecture looks like.

**Sub-questions:**
- What graph-to-weights compilation strategies exist? Options include: distillation (train a small student model on graph-derived curriculum from Area 2), direct embedding matrix export (pack block embeddings into a retrieval-optimized weight format), and attention weight synthesis (construct transformer attention matrices from link weights and embeddings).
- What is the fidelity loss from freezing — how quickly does a frozen artifact become stale relative to the live graph, and what is the right re-export cadence per institution type?
- Can the typed link structure (rel_type, weight, layer) be encoded into the frozen artifact's weights such that the static model inherits relationship-aware behavior, rather than treating all knowledge as flat?
- Is GGUF, Safetensors, or ONNX the right target format for a graph-distilled model? They have different trade-offs in quantization support, operator coverage, and ecosystem tooling.
- What is the minimum corpus size / graph density at which a frozen graph-derived model outperforms a conventionally trained model of the same parameter count on domain-specific tasks?

**Hypotheses to test:**
- H7.1: A student model distilled from a graph-derived curriculum (Area 2) and exported to GGUF achieves within 10% task accuracy of the graph-resident inference client on the same benchmark, at 100x lower inference latency — making frozen export the preferred deployment path for latency-sensitive workloads.
- H7.2: Encoding link weights and rel_types as soft attention biases during distillation produces a frozen model that outperforms a distilled model trained on flat corpus by > 8% on multi-hop reasoning tasks — demonstrating that the graph structure survives compilation into weights.
- H7.3: The staleness penalty of a frozen artifact grows super-linearly with corpus update rate: at update rates below 100 blocks/day the frozen model degrades negligibly (< 2% accuracy drop per week), but above 1000 blocks/day staleness becomes the dominant error source within 48 hours.
- H7.4: A GGUF export pipeline from the Nexum graph (graph → curriculum → distillation → quantization → GGUF) can produce a deployment-ready artifact in under 4 hours for a 10M-block corpus on a single A100, making daily re-export operationally feasible.
- H7.5: Safetensors is the superior intermediate format (over ONNX) for graph-distilled models because its zero-copy mmap semantics allow partial loading of the embedding matrix — mirroring the hot/cold block cache from Area 6 — while ONNX's operator graph representation adds unnecessary overhead for retrieval-heavy architectures.

**Experiments:**
- Distillation pipeline: implement graph → curriculum (Area 2 BFS walk) → student model fine-tune → GGUF export. Evaluate on 3 domain benchmarks vs. graph-resident client and vs. conventionally trained baseline.
- Link-encoded distillation: compare two distillation runs — (a) flat sequence training, (b) attention-bias-injected training using link weights. Measure multi-hop reasoning accuracy delta.
- Staleness curve: export a frozen artifact daily for 2 weeks while continuously ingesting updates into the live graph. Measure accuracy on a stable held-out eval set each day. Plot accuracy vs. days-since-export at different update rates (10, 100, 1000, 10K blocks/day).
- Export pipeline timing: instrument the full export pipeline. Measure wall-clock time per stage (curriculum generation, distillation training, quantization, GGUF pack) at corpus sizes 1M, 5M, 10M blocks.
- Format comparison: export the same distilled model to ONNX, Safetensors, and GGUF. Measure cold-load time, warm inference latency, quantization fidelity at int8 and int4, and ecosystem tooling compatibility (llama.cpp, HuggingFace transformers, ONNX Runtime).

---

## Related Research Documents

- [`research/pg-extensions.md`](research/pg-extensions.md) — Extended PostgreSQL options on the table (AGE, pgml, TimescaleDB, ParadeDB, Lantern) and the case for building a purpose-built `nexum` extension (`pgrx`-based) with a composite graph-vector index, curriculum walker, inference step function, and provenance aggregate.

---

## Dependency Order

The areas are not fully independent. Suggested sequencing:

```
Area 1 (Storage Fitness)
    │
    ├── Area 2 (Training Curriculum)      ← depends on Area 1 baselines
    │
    ├── Area 3 (Inference Substrate)      ← depends on Area 1 storage decisions
    │       │
    │       └── Area 4 (Isomorphism)      ← depends on Area 2 + Area 3 results
    │
    ├── Area 5 (Update Semantics)         ← depends on Area 1 + Area 3; governs
    │                                        the live-consistency guarantees that
    │                                        Areas 3 and 4 assume
    │
    ├── Area 6 (GPU Acceleration)         ← depends on Area 5 latency baselines;
    │                                        optimizes the bottlenecks Area 5 identifies
    │
    └── Area 7 (Frozen Artifact Export)   ← depends on Area 2 (curriculum) for
                                             distillation input; produces the
                                             high-performance complement to the
                                             live graph-resident client
```

---

## Metrics Taxonomy

| Metric | Type | Used In |
|---|---|---|
| Query latency P50/P99 (ms) | Efficiency | Areas 1, 3 |
| Storage bytes per block | Efficiency | Area 1 |
| ANN recall@10 | Quality | Areas 1, 3 |
| Graph traversal throughput (hops/sec) | Efficiency | Areas 1, 3 |
| Fine-tune task accuracy delta | Quality | Area 2 |
| Inference tokens/sec | Efficiency | Area 3 |
| Knowledge recency delta (hours) | Correctness | Areas 3, 4 |
| Attribution accuracy (%) | Auditability | Area 4 |
| Insertion-to-retrieval latency (ms) | Correctness | Areas 5, 6 |
| Embedding drift (cosine delta) | Correctness | Area 5 |
| GPU ANN throughput (queries/sec) | Efficiency | Area 6 |
| Batch inference throughput (tokens/sec) | Efficiency | Area 6 |
| Frozen artifact task accuracy vs. live graph (%) | Quality | Area 7 |
| Staleness accuracy decay (% / day) | Correctness | Area 7 |
| Export pipeline wall-clock time (hours) | Efficiency | Area 7 |

---

## Open Questions (not yet hypotheses)

These are not yet falsifiable but need conceptual resolution before experiments can be designed:

1. **Client architecture:** What is the right abstraction for a "graph-resident inference client"? Is it a transformer with retrieval-augmented attention, a differentiable memory network, a chain-of-thought agent, or something novel?
2. **Curriculum ordering:** BFS/DFS over the link graph is a natural walk, but is there a principled way to derive a total ordering of blocks that maximizes information gain per training step?
3. **Update atomicity:** When a block is updated in a live production corpus, which downstream inference operations need to be invalidated? Can a dependency graph over cached inference results be maintained cheaply?
4. **Embedding drift:** If blocks share a UUID across versions but the content changes (via `parent_block_id` lineage), the embedding is stale. How do we detect and manage embedding drift without re-embedding the entire corpus?
5. **Multi-tenancy:** Different institutions have different privacy requirements. Does the isomorphism property (one store = training + inference) create unacceptable data leakage risk in shared-infrastructure deployments?

---

## Agent Loop Protocol

For autonomous research agents operating over this plan:

1. **Select** the highest-priority untested hypothesis using UCB: `score = mean_expected_value + c * sqrt(log(total_cycles) / cycles_tested)`. Default `c = 1.4`.
2. **Operationalize** the hypothesis into a concrete experiment spec: dataset, metric, baseline, intervention, acceptance criterion.
3. **Execute** the experiment. Write results as a new block linked to the hypothesis block with `rel_type: supports | contradicts | inconclusive`.
4. **Spawn** child hypotheses: for each supported hypothesis, generate a more specific version; for each contradicted hypothesis, generate an alternative explanation.
5. **Prune** hypotheses superseded by results. Mark with a `confirmed: false` link from the child hypothesis block back to the parent.
6. **Escalate** to a human reviewer after every 5 cycles, or whenever a result contradicts a previously supported hypothesis.

Every hypothesis, experiment spec, result, and child hypothesis is stored as a block in the Nexum graph, making the research process itself a first-class corpus.
