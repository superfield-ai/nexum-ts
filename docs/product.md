# Nexum — Product Overview

Nexum is a document intelligence API. It ingests documents from any source — internal or external — parses them into addressable blocks, and builds a typed link graph across the corpus. Customers deploy agents on top of the API that read the graph and write living documents: handbooks, profiles, strategic plans, or any other synthesized artifact their workflow requires.

Nexum does not own the end-user experience. It owns the substrate: ingestion, graph, provenance, and synthesis primitives. What customers build on top is up to them.

---

## The Problem

Organizations accumulate knowledge across documents they never connect. A policy document contradicts a commitment made in a contract signed last year. A customer profile lives across three CRMs and a support inbox. A strategic forecast is undermined by a competitor announcement nobody linked to it. The connections exist — they just live in someone's head, or nowhere. When people leave, the knowledge goes with them.

Nexum makes those connections explicit, machine-readable, and continuously maintained.

---

## The Flat File Ceiling

Markdown files — and tools like Obsidian that layer wiki-like linking on top of them — are the current state of the art for personal knowledge management. For a single person working alone, they are nearly optimal: human-readable, version-controllable, portable, and cheap to reason over.

The scaling problems are obvious. Search degrades. Ownership fragments. Cross-document consistency breaks silently. Refactoring propagates manually or not at all.

The less obvious problem is forward-looking. Current LLMs consume linear text: a document is flattened into a token sequence, and the model reasons over that sequence. This is a first-generation constraint, not a permanent one. Future reasoning machines — whether trained differently or equipped with richer I/O — may operate natively on structured graphs: querying subgraphs, traversing edges, operating on block-level nodes rather than character streams. A knowledge base built as flat files is not ready for that interface.

A flat file is an acceptable *report format* — a serialization of knowledge for human reading. But reports do not have to be the storage model. The same report can be generated on demand by loading the relevant branches of a document tree stored as structured nodes with typed relationships. When the output format and the storage format are decoupled, the knowledge base can serve multiple consumers: a human reading a rendered document, a current LLM consuming a text serialization, and a future reasoning engine traversing the graph directly.

Nexum is built on this premise. The canonical representation is the graph; flat text is one rendering of it.

---

## Who It's For

Nexum is a platform API. Direct customers are teams building document-intelligence products or internal tools — not end users navigating a corpus manually.

Strong fits:
- **AI product teams** embedding document intelligence into their own applications, where answers must be grounded in source material with auditable citations
- **Enterprise automation teams** building agents that read across internal systems (contracts, comms, records) and produce synthesized outputs
- **Knowledge management platform builders** who need a reliable graph layer beneath their own UX

The underlying use cases span any knowledge-intensive domain: legal, finance, healthcare, operations, strategy. Nexum is not optimized for any single vertical.

---

## Initial Target Use Cases

Three use cases anchor the initial product — chosen because each has a clear graph structure, an existing pain point that flat files make worse, and a natural agent-consumption story.

### Software Documentation

A software project produces at least four distinct document types that must stay consistent with one another: product specification, implementation notes, issue tracker, and end-user support documentation. In practice they diverge constantly. A decision recorded in a product doc is not propagated to the implementation notes. A bug in the issue tracker is closed but the user-facing docs still describe the broken behavior. A support ticket reveals an undocumented edge case that nobody links to the spec.

Nexum makes the links between these document types explicit and machine-maintained. An agent can flag a contradiction between an open issue and the current spec, or identify support tickets that describe behavior not covered in end-user documentation. The graph is the connective tissue the project already needs but currently maintains by hand.

### Legal Case Files

A legal matter generates a large, interconnected document set: pleadings, exhibits, contracts, correspondence, deposition transcripts, court orders, and research memos. Relevant passages span dozens of documents. Contradictions between a deposition and a contract clause, or between two expert declarations, are exactly the kind of cross-document relationship that wins or loses a case — and exactly the kind that lawyers currently find by reading everything twice.

Nexum ingests the case corpus, resolves structural citations, and infers semantic and logical links across the full document set. Agents can synthesize profiles of key facts, flag contradictions between witness statements, and maintain running memos that update as new material is filed. Provenance is preserved throughout — every synthesized claim traces to the source block that supports it.

### Company Handbook

A handbook is a codification of how a company operates: policies, processes, decision rights, escalation paths, standards of conduct, and institutional knowledge that would otherwise live only in the heads of long-tenured employees. Done well, it is both a human reference and an agent-consumable procedure library.

The problem with existing handbooks is maintenance. They are written once, go stale, and contradict the actual policies documented in more recent Slack threads, board resolutions, or operational runbooks. Nexum treats the handbook as a living synthesized artifact: the handbook agent polls the internal corpus for new source material — decisions, postmortems, updated policies — and revises the affected handbook sections when contradictions appear. The handbook is always a synthesis of the current source record, not a snapshot from the last time someone updated a Google Doc.

Because every handbook block traces to source blocks, agents consuming the handbook for automated decision-making can verify provenance and flag when the underlying source has changed. The handbook is not just for humans reading a rendered page; it is a queryable knowledge base that agents can traverse.

---

## Principal Model

Nexum has one principal type: **entities**. Both human users and agents are entities. They share the same identity model, the same scope system, and the same access control checks. The only difference is how they authenticate and what scopes they are granted.

**Human principals** authenticate via session token (cookie or Bearer JWT). They are created through the registration flow and interact via the API or any application built on top of it.

**Agent principals** authenticate via API key (Bearer token). They are registered through the same entity creation endpoint as users, with `type: agent`. Their properties include a name, description, a list of granted scopes, and the corpus IDs they are permitted to read from and write to. There is no separate agent management API — agents are entities, created and managed with the same CRUD operations as any other principal.

Scopes are additive string grants stored on the entity. Example scopes: `corpus:read`, `corpus:write`, `blocks:synthesize`, `links:create`, `external:ingest`. A human administrator grants scopes to an agent at registration time; an agent cannot grant itself new scopes.

Agents interact with Nexum exclusively through the API. They do not have a UI. They poll for new material on a schedule; Nexum does not push events to agents.

---

## Core API Capabilities

### 1. Document Ingestion

POST a document — PDF, DOCX, Markdown, or plain text — and Nexum parses it into addressable blocks (paragraphs, clauses, numbered lines), embeds each block, and indexes it for all three query modes. Returns block IDs immediately; embedding and linking complete asynchronously.

Supported formats:
- PDF — filings, reports, contracts, research papers
- DOCX — drafts, redlines, internal memos
- Markdown — agent output, structured notes
- Plain text — transcripts, logs, extracted CRM records

**External source ingestion.** Documents do not have to originate from within the organization. Any agent can ingest external material — news articles, regulatory notices, trade journal pieces, competitor announcements — via the same ingest endpoint. External documents carry source metadata: origin URL, publication date, source type, and a caller-assigned credibility weight. Blocks from external documents propagate that metadata into any links and synthesized blocks derived from them.

### 2. Document Versioning

Every document in Nexum is versioned. Submitting a new draft creates a new version while preserving the original. The full history is retained and queryable.

**Unchanged blocks are shared across versions.** If a paragraph doesn't change between v1 and v2, it is the same record — same ID, same graph connections. Links accumulated in v1 are automatically present in v2 wherever that block survived.

**Changed blocks carry lineage.** A modified paragraph records its predecessor. The full edit history of any block is traversable.

**Current version is always the default.** All queries operate on current versions unless a prior version is explicitly requested.

### 3. Three Layers of Links

**Structural links** — resolved automatically from citations in the text. A document that references another block by name, number, or explicit citation gets a navigable edge to the target block.

**Semantic links** — blocks covering similar territory are linked via embedding similarity. No explicit citation required.

**AI-inferred links** — an LLM reads blocks in context and asserts typed relationships: *supports*, *contradicts*, *elaborates*, *overrides*, *is-exception-to*. These capture logical and argumentative structure beyond surface similarity.

### 4. Relationship Types

Links are typed, not just weighted:
- **Cites** — explicit reference in text
- **Contradicts** — logically incompatible claims
- **Elaborates** — expands on a point
- **Overrides** — a later provision supersedes an earlier one
- **Supports** — corroborating evidence or argument
- **Is-exception-to** — carve-outs and qualifications

### 5. Query API

Three query modes, all returning block IDs with relevance scores and link context:

- **Semantic search** — natural language query against the embedding index; returns ranked blocks with connected neighbors
- **Full-text search** — keyword and phrase search via tsvector indexing
- **Graph traversal** — walk the link graph from a seed block; configurable depth, link-type filters, and direction (forward / backward / both)

Results across all modes include provenance: who created each link, when, and with what confidence.

**Edge embeddings.** Both nodes (blocks) and edges (links) carry vector embeddings. A semantic query can therefore surface relevant *relationships*, not just relevant blocks. For example: a query for "obligations that override earlier commitments" can match `overrides` links whose embedded representation scores highly against that query, independent of whether the individual blocks rank well in isolation. This makes the graph traversable by meaning, not just by structure.

### 6. Polling Cursor

Agents discover new ingest by polling `GET /blocks?corpus_id=X&since=<ISO_TIMESTAMP>`. The response returns all blocks created or updated after the cursor, along with their link state. Agents advance their cursor on each successful poll and repeat on their own schedule.

This is the primary mechanism for event-driven synthesis. Nexum does not push events to agents; agents pull.

### 7. Synthesis API

Write synthesized blocks back into the graph. A synthesized block is a first-class graph participant — linkable, versioned, and traceable to the source blocks that produced it.

The API accepts:
- The synthesized block content
- The entity ID of the agent that produced it (must match the authenticated principal)
- A list of source block IDs the synthesis drew from
- An optional confidence score

Nexum automatically creates `sourced-from` links between the synthesized block and its sources. If a source block is later corrected or retracted, the derived synthesized blocks are marked stale and returned with a `stale: true` flag on subsequent reads — agents discover staleness on their next poll cycle.

### 8. Synthesis Quorum

High-impact or mission-critical synthesized blocks can require multi-agent consensus before being published to the graph. The pattern draws from aerospace voting systems and blockchain multi-signature schemes: no single agent's output is trusted unilaterally; the block is only committed once a quorum of independent agents has signed off on the same conclusion.

**How it works.** A block submitted to the synthesis API can be marked `status: pending_quorum` with a `quorum` configuration specifying the required signatories (by entity ID) and the threshold (e.g., 3-of-5). The block exists in the graph in a `pending` state — readable by quorum participants but not traversable in normal queries. Each participating agent independently reads the same source blocks, runs its own synthesis, and submits a signature: a cryptographic attestation that its output matches the pending block's content hash, along with its own confidence score. When the threshold is reached, Nexum promotes the block to `published` status and it becomes a first-class graph participant. If agents disagree — if a signing agent produces a different content hash — the conflict is recorded and the block remains pending; resolution is the customer's workflow.

**What this provides.** A published block in a quorum corpus carries the signatures of every agent that attested to it. Any consumer can verify that N independent agents, operating on the same source material, reached the same conclusion. This is the graph-native equivalent of a multi-party audit: provenance includes not just who synthesized, but who vouched for it.

**Scope.** `blocks:quorum_sign` is a distinct scope. An agent cannot participate in quorum signing unless it has been explicitly granted this scope on the target corpus. The quorum configuration — which agents are eligible, what threshold is required, and whether human signatures are permitted — is set by the customer when the corpus is created.

### 9. Provenance on Every Block and Link

Every block and link carries full provenance: origin type (`source` / `synthesized` / `external`), creator (parser, embedding model, AI agent, human, caller-specified agent ID), timestamp, confidence, and — for external blocks — source metadata. Provenance is queryable and filterable.

---

## Key Properties

**Block-level precision.** Links resolve to specific paragraphs and lines, not documents. Queries return the exact block, not the document it came from.

**Graph-native embeddings.** Nodes and edges both carry vector embeddings. Semantic search operates over the full graph — surfacing relevant relationships, not just relevant documents. A future reasoning engine with native graph I/O can query the same substrate directly.

**Non-destructive.** Source documents are never modified. The graph is maintained separately and layered over the originals.

**Versioned and auditable.** Full version history on every document. Unchanged blocks share identity and graph connections across versions. Modified blocks carry lineage back to their predecessors.

**Incrementally updatable.** Ingest a new document or a new version and only the affected blocks and links are recomputed.

**External-source aware.** External documents are first-class ingest targets. Credibility weights and source metadata propagate through the graph so agents can reason about the reliability of synthesized claims.

**Quorum-gated publishing.** High-stakes synthesized blocks can require multi-agent consensus before entering the traversable graph. Published blocks in a quorum corpus carry cryptographic attestations from every signing agent — a verifiable record that independent agents reached the same conclusion from the same source material.

---

## Synthesis Agents — Reference Patterns

The following patterns are reference agent definitions — documented templates showing how to register an agent entity, configure its scopes, and implement its polling loop. They are not built-in features. Customers register these agents in their own Nexum deployment, configure them with the appropriate corpus access, and run the poll loop wherever they run their other services.

Each agent is an entity in the system: registered via `POST /entities` with `type: agent`, granted scopes by a human administrator, and authenticated on every API call with its API key.

### Handbook Agent

**Registration:** `type: agent`, scopes: `corpus:read` (internal corpus), `corpus:write` (handbook corpus), `blocks:synthesize`, `links:create`.

**Poll loop:** On each cycle, calls `GET /blocks?corpus_id=<internal>&since=<cursor>` to find new source material — decision logs, incident reports, postmortems, leadership communications. For each new block, queries the graph for related handbook entries via semantic search and graph traversal. If a new block contradicts an existing handbook entry (a `contradicts` link appears), the agent synthesizes a revised entry and writes it back via the synthesis API. The prior entry becomes its predecessor; nothing is deleted. Advances the cursor on success.

The approval step — who reviews the draft, in what tool, on what schedule — is built by the customer. The agent writes a draft synthesized block with a `pending_review: true` flag in its properties; the customer's application reads that flag and routes it to the appropriate reviewer.

### Customer Profile Agent

**Registration:** `type: agent`, scopes: `corpus:read` (all source corpora), `corpus:write` (profiles corpus), `blocks:synthesize`, `links:create`.

**Poll loop:** On each cycle, polls for new blocks across all source corpora — contracts, support tickets, CRM exports, call transcripts. Groups new blocks by customer entity. For each customer with new activity, re-synthesizes the affected sections of their profile and writes updated blocks. Creates `sourced-from` links to every source block used.

When a contract block and a support-ticket block carry incompatible claims, the existing `contradicts` link in the graph surfaces automatically in the next synthesis pass. The profile agent includes the conflict in its output with both sides of the contradiction visible; resolution is the customer's workflow.

### Strategic Planning Agent

**Registration:** `type: agent`, scopes: `corpus:read` (internal + external corpora), `external:ingest`, `corpus:write` (strategy corpus), `blocks:synthesize`, `links:create`.

**Poll loop:** Two input streams. Internal: polls for new blocks from financial projections, OKRs, board decks, roadmaps. External: fetches configured sources (trade press, competitor sites, regulatory feeds), ingests new documents via `POST /ingest` with `origin: external` and source metadata, then polls for the resulting blocks. Synthesizes structured strategy documents — competitive maps, risk registers, scenario plans — and writes them back. Each synthesized claim links to its source blocks; external blocks propagate their source metadata into those links.

This pattern illustrates the general external-source capability. Any agent with `external:ingest` scope can bring outside material into the graph. The strategic planning agent is one application; the same mechanism works for any workflow that needs to reason across internal and external material.

### Credibility Agent (Reference Template)

**Registration:** `type: agent`, scopes: `corpus:read` (external corpus), `blocks:synthesize`.

**Purpose:** Evaluates external source blocks and writes credibility assessments back as synthesized metadata blocks. Other agents query these assessments when reasoning about external material.

**Poll loop:** On each cycle, polls for new `origin: external` blocks. For each new block, evaluates the source against configurable criteria — publication history, domain reputation, cross-referenceability with other sources in the corpus, freshness. Writes a synthesized credibility block linked to the source block with a numeric score and a short rationale. Agents that synthesize from external material query for the linked credibility block before including the source in their output.

The credibility evaluation logic is entirely within the agent — Nexum has no built-in taxonomy. Different deployments implement different credibility models appropriate to their domain. Nexum ships this template as a starting point; the evaluation prompt and scoring rubric are customer-defined.

### Quorum Agent Panel (Reference Template)

**Registration:** Multiple agents, each `type: agent`, scopes: `corpus:read` (source corpus), `blocks:quorum_sign` (quorum corpus). No single agent has `corpus:write` on the quorum corpus directly — publishing is gated by the quorum mechanism.

**Purpose:** Ensures that high-stakes synthesized intelligence — risk assessments, legal findings, mission-critical operational decisions — is attested to by multiple independent reasoners before entering the traversable graph. Modeled on aerospace voting systems (where flight-critical computations are run on separate hardware and cross-checked) and blockchain multi-signature schemes (where funds cannot move without N-of-M keyholders signing).

**Pattern:** One agent (the *proposer*) synthesizes a candidate block from the source corpus and submits it with `status: pending_quorum` and a quorum configuration listing the eligible signing agents and the required threshold. The proposer then polls until the block is promoted or rejected. Each signing agent runs independently: it reads the same source block IDs, runs its own synthesis, and compares its output hash to the pending block's hash. If they match, it submits its signature via `POST /blocks/<id>/sign`. If they diverge, it submits a dissent with its alternative content; the conflict is recorded and the proposer is notified.

The agents in a quorum panel should be meaningfully independent: different prompts, different model versions, or agents operating on different subsets of the source corpus and reconciling. A panel of identical agents running the same prompt provides redundancy against failure, not independence against error.

**What customers configure:** Which corpora require quorum, the eligible agent panel, the signing threshold, whether human principals can sign (and count toward the threshold), and the conflict-resolution workflow when agents dissent.

---

## Synthesized vs. Source Blocks

Source blocks originate from documents the customer ingested — filings, contracts, transcripts, reports. They are the record of what was written or said.

Synthesized blocks are agent outputs. They are claims with provenance, not ground truth. A synthesized block's reliability is a function of its sources: how many support it, whether any contradict it, and the credibility weights of the external documents in its lineage.

Every block carries an `origin` field: `source`, `synthesized`, or `external`. Synthesized blocks carry the ID of the agent that produced them. External blocks carry source metadata. The graph does not treat synthesized blocks as less traversable — they are fully linkable — but their epistemic status is always visible in the API response.

---

## Open Product Questions

Resolved decisions are struck through. Remaining questions affect API design or roadmap sequencing.

~~**Vertical focus vs. platform positioning.**~~ Resolved: Nexum is a vertically agnostic platform API. Legal, finance, healthcare, and operations are all valid deployment targets. No single vertical is prioritized in the core product.

~~**Who owns the handbook agent's approval workflow?**~~ Resolved: the customer. Nexum surfaces contradictions and synthesized revisions via the API; the approval UX is built by the customer in whatever tool they use.

~~**Agent conflict resolution policy.**~~ Resolved: Nexum surfaces `contradicts` links and marks stale synthesized blocks; policy is implemented by the customer on top of the API.

~~**Corpus permissions model.**~~ Resolved: agents are entities with explicit scope grants on registered corpora. Nexum enforces scope at the API boundary; customers control which scopes each agent receives.

~~**Synthesis trigger model.**~~ Resolved: agents poll via the `since` cursor endpoint on their own schedule. Nexum does not push events. Polling is the canonical trigger mechanism.

~~**External source credibility model.**~~ Resolved: Nexum ships a Credibility Agent reference template. Evaluation logic, scoring rubric, and taxonomy are customer-defined within the agent. No built-in taxonomy.

All major product design questions are currently resolved. Open questions will be added here as new decisions arise.
