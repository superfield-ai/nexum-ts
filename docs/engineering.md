# Nexum — Engineering Design

## Overview

Nexum's backend is a single PostgreSQL database serving as both vector store and graph store, fronted by a Rust ingestion pipeline and a query API. The design avoids separate graph databases and vector databases: PostgreSQL with `pgvector`, `pgvector` HNSW indexes, and recursive CTEs handles all three query modes (full-text, semantic, graph traversal) with acceptable performance at legal-corpus scale (tens of millions of blocks).

---

## Data Model

### Core Principle

The atomic unit is a **block** — one paragraph, clause, or numbered line. Every block has a stable UUID, a vector embedding, its raw text, and positional metadata. All connections between blocks are stored as **links** in a separate edge table. Documents are metadata containers; all meaningful queries target blocks.

### Schema

```sql
-- Document registry: the logical identity of a document across all its versions
CREATE TABLE documents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              TEXT NOT NULL,
    source_path        TEXT,
    source_format      TEXT CHECK (source_format IN ('pdf', 'docx', 'markdown')),
    current_version_id UUID,                 -- FK set after first version inserted
    meta               JSONB,
    created_at         TIMESTAMPTZ DEFAULT now()
);

-- One row per ingested version of a document
CREATE TABLE document_versions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id        UUID NOT NULL REFERENCES documents(id),
    version_num   INTEGER NOT NULL,          -- 1, 2, 3 ...
    label         TEXT,                      -- "filed 2026-01-15", "redline v3"
    status        TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending', 'parsed', 'embedded', 'done', 'error')),
    ingested_at   TIMESTAMPTZ DEFAULT now(),
    meta          JSONB,
    UNIQUE (doc_id, version_num)
);

ALTER TABLE documents
    ADD CONSTRAINT fk_current_version
    FOREIGN KEY (current_version_id) REFERENCES document_versions(id)
    DEFERRABLE INITIALLY DEFERRED;

-- Blocks: immutable once created, content-addressed by hash
-- Unchanged blocks are shared across versions via version_blocks
CREATE TABLE blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID NOT NULL REFERENCES documents(id),
    content         TEXT NOT NULL,
    content_hash    TEXT NOT NULL,           -- SHA-256 of content; used for dedup on re-ingest
    block_type      TEXT NOT NULL,           -- paragraph, heading, list_item, table
    level           INTEGER,                 -- heading depth, null for non-headings
    line_start      INTEGER,
    line_end        INTEGER,
    eid             TEXT,                    -- Akoma Ntoso eId if source is AKN
    parent_block_id UUID REFERENCES blocks(id), -- lineage: prior version of this block
    embedding       vector(1536),
    tsv             TSVECTOR
                    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    meta            JSONB                    -- raw_refs, section context, page, etc.
);

CREATE INDEX ON blocks (doc_id, content_hash);
CREATE INDEX ON blocks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON blocks USING gin (tsv);
CREATE INDEX ON blocks (parent_block_id);

-- Junction table: maps versions to their ordered set of blocks
-- Unchanged blocks appear in multiple version rows with the same block_id
CREATE TABLE version_blocks (
    version_id    UUID NOT NULL REFERENCES document_versions(id),
    block_id      UUID NOT NULL REFERENCES blocks(id),
    seq           INTEGER NOT NULL,          -- ordering within this version
    PRIMARY KEY (version_id, block_id)
);

CREATE INDEX ON version_blocks (block_id);
CREATE UNIQUE INDEX ON version_blocks (version_id, seq);

-- Links: the graph edges between blocks
-- Because unchanged blocks share their UUID across versions,
-- their links are automatically inherited by every version that contains them
CREATE TABLE links (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    src           UUID NOT NULL REFERENCES blocks(id),
    dst           UUID NOT NULL REFERENCES blocks(id),
    layer         TEXT NOT NULL
                  CHECK (layer IN ('structural', 'semantic', 'ai')),
    rel_type      TEXT,                      -- cites, contradicts, elaborates, overrides, supports
    weight        FLOAT DEFAULT 1.0,
    confirmed     BOOLEAN,                   -- null=unreviewed, true=accepted, false=rejected
    provenance    JSONB NOT NULL,            -- {model, version, confidence, created_at}
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON links (src);
CREATE INDEX ON links (dst);
CREATE INDEX ON links (src, layer);
CREATE INDEX ON links (dst, layer);
```

### JSONB Usage

`meta` on blocks stores source-format-specific data that doesn't belong in typed columns:

```json
{
  "raw_refs": ["42 U.S.C. § 1983", "See ¶ 14 of Exhibit B"],
  "section_heading": "III. ARGUMENT",
  "page": 4,
  "akn_eid": "sec_3__para_2__subpara_a",
  "word_count": 87
}
```

`provenance` on links captures auditability:

```json
{
  "layer": "ai",
  "model": "claude-sonnet-4-6",
  "confidence": 0.91,
  "created_at": "2026-04-27T14:32:00Z",
  "prompt_version": "v2"
}
```

---

## Ingestion Pipeline

The ingestion pipeline is written in Rust using `tokio` for async I/O and `rayon` for CPU-bound parsing. It is a staged channel pipeline with bounded channels providing automatic backpressure.

### Stages

```
[Discoverer]          scans filesystem or queue for new documents
      │ mpsc::channel<DocPath> (bound: 64)
      ▼
[Reader]              reads raw bytes, dispatches by format
      │ mpsc::channel<RawDoc> (bound: 64)
      ▼
[Parser Pool]         format-specific parsers, spawn_blocking → rayon
      │ mpsc::channel<Vec<RawBlock>> (bound: 256)
      ▼
[Citation Extractor]  regex patterns resolve raw_refs to block candidates
      │ mpsc::channel<Vec<BlockWithRefs>> (bound: 256)
      ▼
[Embedder]            HTTP to embedding API, semaphore rate-limited
      │ mpsc::channel<Vec<Block>> (bound: 512)
      ▼
[Postgres Writer]     sqlx COPY protocol, batched inserts
```

Each stage is a `tokio::spawn` loop. Parsing is CPU-bound and dispatched to `rayon` via `spawn_blocking`. Embedding calls are I/O-bound and run concurrently behind a `tokio::sync::Semaphore` to respect API rate limits.

### Format Parsers

| Format | Approach |
|--------|----------|
| PDF | `pdftotext` (poppler) via `tokio::process::Command` for text; structure recovered via heuristics (line numbers, heading caps, indentation) |
| DOCX | `docx-rs` crate; heading styles map directly to `level`, paragraph styles to `block_type` |
| Markdown | `pulldown-cmark`; ATX headings, paragraphs, and list items are natural block boundaries |

All parsers emit the same `RawBlock` type. Format-specific metadata is preserved in `meta: JSONB`.

### Citation Extraction

After parsing, a regex pass over `content` extracts citation strings into `meta.raw_refs`. These are later resolved to target block UUIDs during a link-building pass. Resolution uses:

- Case citations (`Smith v. Jones, 123 F.3d 456`) matched against the block corpus by document title and block content
- Section/paragraph references (`¶ 14`, `§ 3.2`, `Exhibit B`) resolved against the same document's block index

Resolved citations become `layer: structural` links.

### Embedding

Blocks are embedded in batches via the configured embedding API (OpenAI `text-embedding-3-small` at 1536 dimensions, or a self-hosted model via compatible API). A `tokio::sync::Semaphore` caps concurrent requests. Embeddings are written to `blocks.embedding` as `pgvector` vectors.

### Versioning During Ingestion

When a new version of an existing document is ingested, the pipeline performs block-level diffing before inserting:

1. Parse the new document into `RawBlock` structs and compute `SHA-256(content)` for each.
2. Query `blocks WHERE doc_id = $id AND content_hash = ANY($hashes)` to find unchanged blocks.
3. **Unchanged blocks** — reuse the existing `block_id` in `version_blocks`. No re-embedding needed.
4. **Modified or new blocks** — insert a new `blocks` row. Set `parent_block_id` to the closest positional match from the prior version (matched by `seq`). Queue for embedding and AI linking.
5. **Deleted blocks** — simply absent from the new `version_blocks` entries; their rows and links are retained for historical queries.
6. Set `documents.current_version_id` to the new version after the pipeline completes.

This means structural and AI-inferred links on an unchanged block are inherited by the new version automatically — no re-linking pass required for the stable parts of a document.

### Idempotency

`document_versions.status` tracks pipeline progress per version. A crashed run resumes from the last completed stage. Blocks are inserted with `ON CONFLICT DO NOTHING` keyed on `(doc_id, content_hash)`. Version-block mappings use `ON CONFLICT DO NOTHING` on the `version_blocks` primary key.

---

## Query Modes

### Semantic Search

```sql
SELECT b.id, b.content, b.embedding <=> $1 AS distance
FROM blocks b
ORDER BY b.embedding <=> $1
LIMIT 20;
```

HNSW index makes this sub-millisecond at millions of rows.

### Full-Text Search

```sql
SELECT b.id, b.content, ts_rank(b.tsv, query) AS rank
FROM blocks b, plainto_tsquery('english', $1) query
WHERE b.tsv @@ query
ORDER BY rank DESC
LIMIT 20;
```

### Graph Traversal (multi-hop)

```sql
WITH RECURSIVE graph AS (
    -- seed
    SELECT dst, 1 AS depth, ARRAY[src] AS path, rel_type
    FROM links
    WHERE src = $1 AND layer = ANY($2)   -- filter by layer

    UNION ALL

    SELECT l.dst, g.depth + 1, g.path || l.src, l.rel_type
    FROM links l
    JOIN graph g ON l.src = g.dst
    WHERE g.depth < $3                   -- max hops
      AND l.src != ALL(g.path)           -- cycle guard
)
SELECT DISTINCT b.*, g.depth, g.rel_type
FROM graph g
JOIN blocks b ON b.id = g.dst
ORDER BY g.depth;
```

### Version-Aware Queries

**Blocks in the current version of a document:**
```sql
SELECT b.*, vb.seq
FROM blocks b
JOIN version_blocks vb ON vb.block_id = b.id
WHERE vb.version_id = (
    SELECT current_version_id FROM documents WHERE id = $1
)
ORDER BY vb.seq;
```

**Blocks in a specific historical version:**
```sql
SELECT b.*, vb.seq
FROM blocks b
JOIN version_blocks vb ON vb.block_id = b.id
WHERE vb.version_id = $version_id
ORDER BY vb.seq;
```

**Diff two versions — added, removed, and changed blocks:**
```sql
WITH v1 AS (
    SELECT block_id, seq FROM version_blocks WHERE version_id = $v1_id
),
v2 AS (
    SELECT block_id, seq FROM version_blocks WHERE version_id = $v2_id
)
SELECT
    COALESCE(v2.block_id, v1.block_id) AS block_id,
    CASE
        WHEN v1.block_id IS NULL THEN 'added'
        WHEN v2.block_id IS NULL THEN 'removed'
        ELSE 'unchanged'
    END AS change
FROM v1
FULL OUTER JOIN v2 USING (block_id);
```

**Lineage of a block through all versions:**
```sql
WITH RECURSIVE lineage AS (
    SELECT id, content, parent_block_id, 1 AS generation
    FROM blocks WHERE id = $1

    UNION ALL

    SELECT b.id, b.content, b.parent_block_id, l.generation + 1
    FROM blocks b
    JOIN lineage l ON b.id = l.parent_block_id
)
SELECT * FROM lineage ORDER BY generation DESC;
```

### Hybrid (semantic + graph neighborhood)

Find semantically similar blocks, then expand each result one hop through the graph to surface structurally related content:

```sql
WITH neighbors AS (
    SELECT id, content, embedding <=> $1 AS distance
    FROM blocks
    ORDER BY embedding <=> $1
    LIMIT 10
),
expanded AS (
    SELECT l.dst AS id, 'graph' AS origin
    FROM links l
    JOIN neighbors n ON l.src = n.id
    WHERE l.layer IN ('structural', 'ai')
)
SELECT b.*, n.distance, e.origin
FROM blocks b
LEFT JOIN neighbors n ON n.id = b.id
LEFT JOIN expanded e ON e.id = b.id
WHERE b.id IN (SELECT id FROM neighbors UNION SELECT id FROM expanded);
```

---

## Link Generation (Layer 3 — AI)

After embedding, a separate AI linker pass reads block pairs (seeded by semantic similarity candidates) and asks the LLM to classify the relationship. Only pairs above a similarity threshold are evaluated to bound cost.

The linker runs as an async Rust process calling the Anthropic API, writing results to `links` with `layer: 'ai'` and full provenance.

---

## Technology Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Database | PostgreSQL 16 | Single store for documents, vectors, and graph |
| Vector index | pgvector HNSW | Sub-ms ANN search, native Postgres |
| Full-text | tsvector (built-in) | No additional service |
| Ingestion | Rust + tokio | Async I/O, rayon for CPU parsing, backpressure via bounded channels |
| PDF parsing | pdftotext (poppler) | More reliable than pure-Rust PDF parsers for complex legal layouts |
| DOCX parsing | docx-rs | Native Rust |
| Markdown | pulldown-cmark | Native Rust |
| ORM / DB driver | sqlx | Async, compile-time query checking, COPY protocol support |
| Embedding API | OpenAI / self-hosted | Configurable; local model avoids rate limits |
| AI linking | Anthropic Claude API | Typed relationship extraction via structured output |

---

## Scalability Notes

- At legal-corpus scale (< 10M blocks), PostgreSQL handles all three query modes without a dedicated graph DB.
- Recursive CTE traversal degrades past 5–6 hops on dense graphs. For deeper traversal, Apache AGE (adds Cypher to Postgres) or an external graph DB (Kuzu) can be introduced later without changing the block/link schema.
- Embedding and AI linking are the pipeline bottlenecks. Both are horizontally scalable by running multiple ingestion worker processes against the same database, coordinated via `documents.status` row locking (`SELECT ... FOR UPDATE SKIP LOCKED`).
