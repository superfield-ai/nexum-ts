# Nexum

Block-level document intelligence. Ingests documents (PDF, DOCX, Markdown), parses them into addressable blocks (sentences, paragraphs), and builds a typed cross-link graph across any corpus — legal, medical, research, or business.

See [`docs/engineering.md`](docs/engineering.md) for the full data model and query design.

---

## Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** ≥ 16 with the [`pgvector`](https://github.com/pgvector/pgvector) extension
- **pdftotext** (poppler-utils) — for PDF ingestion
- An **OpenAI API key** — for block embeddings (`text-embedding-3-small`)
- An **Anthropic API key** — for AI link classification

```bash
# macOS
brew install postgresql@16 poppler
brew install pgvector   # or: psql -c "CREATE EXTENSION vector" after manual install

# Ubuntu / Debian
sudo apt install postgresql-16 postgresql-16-pgvector poppler-utils
```

---

## Setup

```bash
git clone git@github.com:superfield-ai/nexum.git
cd nexum
npm install
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://localhost:5432/nexum
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Database

```bash
# Create the database
createdb nexum

# Apply the schema
psql nexum < db/schema.sql
```

The schema creates five tables: `documents`, `document_versions`, `blocks`, `version_blocks`, `links`. Full DDL is in [`db/schema.sql`](db/schema.sql) and documented in [`docs/engineering.md`](docs/engineering.md).

---

## Running

```bash
# Development (watch mode)
npm run dev

# Production build
npm run build
npm start
```

---

## Testing

```bash
# Unit tests
npm test

# Integration tests (requires a running Postgres with schema applied)
npm run test:integration

# All tests
npm run test:all
```

Integration tests run against a real database — there are no mocks for the DB layer. The test runner expects `DATABASE_URL` to point to a test database (e.g. `nexum_test`). Create it with:

```bash
createdb nexum_test
psql nexum_test < db/schema.sql
```

---

## Key Concepts

**Block** — the atomic unit. One paragraph or sentence, with a stable UUID, a 1536-dim embedding vector, a SHA-256 content hash (for dedup across versions), and a `parent_block_id` pointing to its predecessor in prior versions.

**Link** — a typed edge between two blocks. Three layers: `structural` (extracted citations), `semantic` (embedding similarity), `ai` (LLM-classified). Each link carries a `provenance` JSONB with model, confidence, and timestamp.

**Version dedup** — when a new version of a document is ingested, unchanged blocks (same content hash) reuse their existing UUID and inherit all existing links automatically. Only modified or new blocks are re-embedded and re-linked.

**Query modes** — PostgreSQL handles all three: full-text (`tsvector`), semantic (pgvector HNSW ANN), and graph traversal (recursive CTEs up to ~5–6 hops).

---

## Project Structure

```
nexum/
├── db/
│   └── schema.sql          # Full DDL
├── docs/
│   ├── engineering.md      # Data model, queries, pipeline design
│   ├── product.md          # Feature overview
│   └── competitive.md      # Market context
├── src/
│   ├── ingest/             # Ingestion pipeline (parse → embed → link)
│   ├── query/              # Query API (semantic, full-text, graph)
│   └── linker/             # AI link classification (Anthropic API)
└── tests/
    ├── unit/
    └── integration/
```
