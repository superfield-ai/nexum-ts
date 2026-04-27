# Nexum — Product Overview

Nexum is a document intelligence platform for legal teams. It ingests legal filings, internal drafts, and AI-generated analysis, then builds a navigable graph of every connection between them — down to the paragraph and line level.

---

## The Problem

Legal work is fundamentally about relationships between text. A motion cites a statute which was interpreted by a ruling which your opposing counsel's brief mischaracterizes on page 4, paragraph 2. Today those connections live in a lawyer's head or a tangle of manual annotations. When team members change, that knowledge disappears.

---

## Who It's For

- **Litigation teams** managing large document sets across a case or portfolio
- **In-house counsel** tracking how internal drafts relate to external filings and regulatory text
- **Legal AI workflows** where agent-generated analysis needs to be grounded in source documents with verifiable citations

---

## Core Features

### 1. Document Ingestion
Upload PDFs (court filings), Word documents (internal drafts), or Markdown files (agent analysis). Nexum parses each document into addressable blocks — paragraphs, clauses, numbered lines — and stores them for querying.

Supported formats:
- PDF — court filings, regulatory documents, contracts
- DOCX — internal drafts, redlines
- Markdown — AI agent output, research notes

### 2. Document Versioning

Every document in Nexum is versioned. Uploading a new draft of a filing creates a new version while preserving the original. The full history of every document is retained and queryable.

**Unchanged blocks are shared across versions.** If paragraph 3 of a contract doesn't change between v1 and v2, it is the same record in the database — with the same ID and the same graph connections. Only modified or new blocks are treated as distinct. This means links accumulated on a block in v1 are automatically present in v2 wherever that block survived unchanged.

**Changed blocks carry lineage.** When a paragraph is modified, the new block records its predecessor. You can trace any block back through its edit history and see how the graph of connections evolved alongside the text.

**Version comparison.** View a diff between any two versions of a document at the block level — which blocks were added, removed, or modified, and how the link graph changed as a result.

**Current version is always the default.** All searches and graph queries operate on current versions by default. Querying a prior version is an explicit opt-in.

### 3. Three Layers of Links

Every block can be connected to any other block across any document. Links come from three sources:

**Structural links** — extracted automatically from citations already in the text. When a filing says "see ¶ 14 of Exhibit B" or cites a statute, Nexum resolves that reference to the actual target block and creates a navigable edge.

**Semantic links** — blocks that cover similar territory are surfaced automatically via embedding similarity. No explicit citation needed. Useful for finding contradictions, parallel arguments, or precedents across documents that don't cite each other.

**AI-inferred links** — an LLM reads blocks in context and asserts typed relationships: *supports*, *contradicts*, *elaborates*, *overrides*, *is-an-exception-to*. These go beyond similarity to capture logical and argumentative structure.

### 4. Block-Level Navigation

Click any paragraph or line to see everything connected to it — across all documents in the corpus. Navigate forward (what does this block link to?) or backward (what cites or relates to this block?). Filter by link type or source document.

### 5. Relationship Types

Links are typed, not just weighted. The system distinguishes:
- **Cites** — explicit reference in text
- **Contradicts** — logically incompatible claims
- **Elaborates** — expands on a point
- **Overrides** — a later provision supersedes an earlier one
- **Supports** — corroborating evidence or argument
- **Is-exception-to** — carve-outs and qualifications

### 6. Semantic Search

Ask a natural language question and retrieve the most relevant blocks across all documents, ranked by semantic similarity. Results link out to their full context and connected blocks.

### 7. Graph Exploration

Browse the document corpus as a graph. See which documents are most densely connected, which blocks are referenced most frequently, and where arguments converge or diverge across filings.

### 8. Provenance on Every Link

Every connection carries metadata: who or what created it (parser, embedding model, AI agent, human), when, and with what confidence. Teams can audit, override, or annotate any link.

---

## Key Properties

**Line-level precision.** Links resolve to specific paragraphs and lines, not just documents. A citation to page 4 paragraph 2 of a filing lands on that block, not the document as a whole.

**Non-destructive ingestion.** Source documents are never modified. The graph is maintained separately and layered over the originals.

**Versioned and auditable.** Every document retains its full version history. Unchanged blocks share their identity and graph connections across versions. Modified blocks carry lineage back to their predecessors.

**Incrementally updatable.** Add a new filing or a new version and only the affected blocks and links are recomputed. The rest of the graph is untouched.

**Human-correctable.** Any automatically generated link can be confirmed, rejected, or annotated by a human. Manual corrections feed back into model quality over time.
