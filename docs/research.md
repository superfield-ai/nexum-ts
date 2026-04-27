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

### Area 5 — Autonomous Research Loop

**Question:** Can an agent operating over the Nexum graph autonomously generate, prioritize, execute, and refine research hypotheses, closing the loop without human intervention between cycles?

This area is meta: the research infrastructure itself is a research subject.

**Sub-questions:**
- What hypothesis representation allows automated falsifiability checking (i.e., a hypothesis that an agent can run an experiment against and get a binary pass/fail)?
- What search strategies over the hypothesis space are most sample-efficient? (exhaustive enumeration, Bayesian optimization over hypothesis parameters, tree search with UCB)
- Can the same block graph used for document storage serve as the hypothesis and result store, making research itself an instance of the Nexum model?
- What is the minimum human-in-the-loop frequency to prevent hypothesis drift (the agent optimizing a proxy metric rather than the true research question)?

**Hypotheses to test:**
- H5.1: Representing hypotheses as structured records (claim, operationalization, null hypothesis, experiment spec, result) in the block graph allows an agent to discover contradictions between hypotheses using the same `contradicts` link type used for document blocks.
- H5.2: A UCB-based hypothesis selection policy, treating each untested hypothesis as a bandit arm with estimated variance from prior related results, outperforms random hypothesis selection in terms of information gain per experiment.
- H5.3: Without human review every N cycles, an autonomous research agent will degenerate into optimizing a measurable proxy (e.g., raw retrieval recall) at the expense of the true research objective (end-task accuracy) within 10–20 cycles.
- H5.4: The graph's versioning model (block dedup across document versions) is directly applicable to hypothesis versioning — refined hypotheses can be modeled as new `document_versions` with `parent_block_id` links to the hypotheses they supersede.

**Experiments:**
- Implement a hypothesis store in the Nexum block graph: hypotheses as blocks, experimental results as linked blocks, refinements as new versions with `parent_block_id`.
- Run 3 autonomous cycles on Area 1 benchmarks. Measure: hypotheses generated, experiments run, hypotheses falsified, new hypotheses spawned from results.
- Compare UCB vs. random hypothesis selection over 20 cycles on a known benchmark where ground truth is available.
- Inject a proxy-optimization trap (a measurable metric that is easy to improve but uncorrelated with end-task performance). Observe how many cycles before a human reviewer would catch the drift.

---

## Related Research Documents

- [`research/pg-extensions.md`](research/pg-extensions.md) — Extended PostgreSQL options on the table (AGE, pgml, TimescaleDB, ParadeDB, Lantern) and the case for building a purpose-built `nexum` extension (`pgrx`-based) with a composite graph-vector index, curriculum walker, inference step function, and provenance aggregate.

---

## Dependency Order

The areas are not fully independent. Suggested sequencing:

```
Area 1 (Storage Fitness)
    │
    ├── Area 2 (Training Curriculum)   ← depends on Area 1 benchmarks establishing baselines
    │
    ├── Area 3 (Inference Substrate)   ← depends on Area 1 storage architecture decisions
    │       │
    │       └── Area 4 (Isomorphism)   ← depends on Area 2 + Area 3 results
    │
    └── Area 5 (Autonomous Loop)       ← can start in parallel; feeds all other areas over time
```

Area 5 is the flywheel. Once the hypothesis store and agent loop are operational, they can drive experimentation in Areas 1–4 without manual experiment scheduling.

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
| Hypotheses falsified per cycle | Research velocity | Area 5 |
| Proxy drift detection cycle | Safety | Area 5 |

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
6. **Escalate** to a human reviewer after every 5 cycles, or whenever a hypothesis in Area 5 (proxy drift) is triggered.

Every hypothesis, experiment spec, result, and child hypothesis is stored as a block in the Nexum graph, making the research process itself a first-class corpus.
