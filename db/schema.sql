-- Nexum schema — PostgreSQL 16 + pgvector
-- Apply with: psql <db> < db/schema.sql
-- Idempotent: uses IF NOT EXISTS throughout

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Corpora: optional grouping of documents (e.g. a legislative archive, a case file)
CREATE TABLE IF NOT EXISTS corpora (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    meta        JSONB,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Document registry: the logical identity of a document across all its versions
CREATE TABLE IF NOT EXISTS documents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              TEXT NOT NULL,
    source_path        TEXT,
    source_format      TEXT CHECK (source_format IN ('pdf', 'docx', 'markdown')),
    current_version_id UUID,                 -- FK set after first version inserted
    meta               JSONB,
    created_at         TIMESTAMPTZ DEFAULT now()
);

-- Idempotently add corpus_id and external_id columns to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS corpus_id UUID REFERENCES corpora(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE INDEX IF NOT EXISTS documents_corpus_id_idx ON documents (corpus_id);
CREATE INDEX IF NOT EXISTS documents_corpus_id_external_id_idx ON documents (corpus_id, external_id);

-- One row per ingested version of a document
CREATE TABLE IF NOT EXISTS document_versions (
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_current_version'
          AND table_name = 'documents'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT fk_current_version
            FOREIGN KEY (current_version_id) REFERENCES document_versions(id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

-- Blocks: immutable once created, content-addressed by hash
-- Unchanged blocks are shared across versions via version_blocks
CREATE TABLE IF NOT EXISTS blocks (
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
    -- Dimension set for all-MiniLM-L6-v2 (384).
    -- To change: ALTER TABLE blocks ALTER COLUMN embedding TYPE vector(N); then drop and rebuild blocks_embedding_hnsw_idx.
    embedding       vector(384),
    tsv             TSVECTOR
                    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    meta            JSONB                    -- raw_refs, section context, page, etc.
);

CREATE INDEX IF NOT EXISTS blocks_doc_content_hash_idx ON blocks (doc_id, content_hash);
-- Drop and recreate HNSW index to ensure it matches the current embedding dimension (384).
-- If the column type changes in future, repeat this pattern.
DROP INDEX IF EXISTS blocks_embedding_hnsw_idx;
CREATE INDEX blocks_embedding_hnsw_idx ON blocks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS blocks_tsv_gin_idx ON blocks USING gin (tsv);
CREATE INDEX IF NOT EXISTS blocks_parent_block_id_idx ON blocks (parent_block_id);

-- Junction table: maps versions to their ordered set of blocks
-- Unchanged blocks appear in multiple version rows with the same block_id
CREATE TABLE IF NOT EXISTS version_blocks (
    version_id    UUID NOT NULL REFERENCES document_versions(id),
    block_id      UUID NOT NULL REFERENCES blocks(id),
    seq           INTEGER NOT NULL,          -- ordering within this version
    PRIMARY KEY (version_id, block_id)
);

CREATE INDEX IF NOT EXISTS version_blocks_block_id_idx ON version_blocks (block_id);
CREATE UNIQUE INDEX IF NOT EXISTS version_blocks_version_seq_idx ON version_blocks (version_id, seq);

-- Links: the graph edges between blocks
-- Because unchanged blocks share their UUID across versions,
-- their links are automatically inherited by every version that contains them
CREATE TABLE IF NOT EXISTS links (
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

CREATE INDEX IF NOT EXISTS links_src_idx ON links (src);
CREATE INDEX IF NOT EXISTS links_dst_idx ON links (dst);
CREATE INDEX IF NOT EXISTS links_src_layer_idx ON links (src, layer);
CREATE INDEX IF NOT EXISTS links_dst_layer_idx ON links (dst, layer);
