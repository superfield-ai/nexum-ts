# Nexum — Product Overview

Nexum is a document intelligence API. It ingests documents from any source — internal or external — parses them into addressable blocks, and builds a typed link graph across the corpus. Customers deploy agents on top of the API that read the graph and write living documents: handbooks, profiles, strategic plans, or any other synthesized artifact their workflow requires.

Nexum does not own the end-user experience. It owns the substrate: ingestion, graph, provenance, and synthesis primitives. What customers build on top is up to them.

---

## The Problem

Organizations accumulate knowledge across documents they never connect. A policy document contradicts a commitment made in a contract signed last year. A customer profile lives across three CRMs and a support inbox. A strategic forecast is undermined by a competitor announcement nobody linked to it. The connections exist — they just live in someone's head, or nowhere. When people leave, the knowledge goes with them.

Nexum makes those connections explicit, machine-readable, and continuously maintained.

---

## Who It's For

Nexum is a platform API. Direct customers are teams building document-intelligence products or internal tools — not end users navigating a corpus manually.

Strong fits:
- **AI product teams** embedding document intelligence into their own applications, where answers must be grounded in source material with auditable citations
- **Enterprise automation teams** building agents that read across internal systems (contracts, comms, records) and produce synthesized outputs
- **Knowledge management platform builders** who need a reliable graph layer beneath their own UX

The underlying use cases span any knowledge-intensive domain: legal, finance, healthcare, operations, strategy. Nexum is not optimized for any single vertical.

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

### 6. Synthesis API

Write synthesized blocks back into the graph. A synthesized block is a first-class graph participant — linkable, versioned, and traceable to the source blocks that produced it.

The API accepts:
- The synthesized block content
- A pointer to the agent that produced it
- A list of source block IDs the synthesis drew from
- An optional confidence score

Nexum automatically creates `sourced-from` links between the synthesized block and its sources. If a source block is later corrected or retracted, all synthesized blocks derived from it are flagged via a webhook.

### 7. Provenance on Every Block and Link

Every block and link carries full provenance: origin type (`source` / `synthesized` / `external`), creator (parser, embedding model, AI agent, human, caller-specified agent ID), timestamp, confidence, and — for external blocks — source metadata. Provenance is queryable and filterable.

---

## Key Properties

**Block-level precision.** Links resolve to specific paragraphs and lines, not documents. Queries return the exact block, not the document it came from.

**Non-destructive.** Source documents are never modified. The graph is maintained separately and layered over the originals.

**Versioned and auditable.** Full version history on every document. Unchanged blocks share identity and graph connections across versions. Modified blocks carry lineage back to their predecessors.

**Incrementally updatable.** Ingest a new document or a new version and only the affected blocks and links are recomputed.

**External-source aware.** External documents are first-class ingest targets. Credibility weights and source metadata propagate through the graph so agents can reason about the reliability of synthesized claims.

---

## Synthesis Agents — Reference Patterns

The following patterns illustrate how customers deploy agents on top of the Nexum API. They are not built-in features — customers implement them using the ingest, query, and synthesis endpoints. They are documented here as reference architectures for common use cases.

### Handbook Agent

An agent that maintains a living company handbook: policies, procedures, and operating norms, each traceable to the internal decisions and events that produced them.

The agent ingests internal source material — decision logs, incident reports, postmortems, leadership communications — and uses the synthesis API to write structured handbook entries. Each entry links back to the source blocks it was derived from.

When a new source document contradicts an existing handbook entry, the Nexum graph surfaces a `contradicts` link between the new block and the existing synthesized block. The agent reads this signal and drafts a revision. The prior entry becomes the predecessor version; nothing is deleted.

The approval step — who reviews the draft, in what tool, on what schedule — is the customer's responsibility. Nexum surfaces the contradiction and the proposed revision via its API; the workflow around that is built by the customer.

### Customer Profile Agent

An agent that synthesizes a persistent, structured profile for each customer from every document and interaction the organization holds.

Source material spans systems: contracts, support tickets, sales notes, call transcripts, invoices, CRM exports. The agent ingests all of it and writes synthesized profile blocks for each customer — what they were promised, what they've experienced, where friction exists.

When a contract block says "48-hour SLA" and a support-ticket block says "customer was told 24 hours," Nexum creates a `contradicts` link. The profile agent surfaces this in its output; the customer decides how to resolve it.

Customer profile documents are graph-connected to the source blocks they draw from, to relevant handbook entries (which policies govern this relationship), and to other profiles where overlap exists.

### Strategic Planning Agent

An agent that maintains forward-looking planning documents grounded in both internal forecasts and external signals.

Internal source material: financial projections, OKRs, board decks, roadmaps. External source material: trade press, competitor announcements, regulatory notices, macroeconomic signals. Both are ingested via the same endpoint; external documents carry credibility weights assigned by the agent at ingest time.

The agent synthesizes structured strategy documents — competitive maps, risk registers, scenario plans — and writes them back via the synthesis API. Each claim links to the source blocks that support it. When an external signal contradicts an internal assumption, the `contradicts` link is queryable.

This pattern illustrates the general external-source capability: any agent can ingest external documents with caller-assigned metadata and use the resulting blocks in synthesis. The strategy agent is one application of that; the same mechanism applies to any workflow that needs to reason across internal and external material.

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

~~**Agent conflict resolution policy.**~~ Resolved: Nexum surfaces `contradicts` links and flags stale synthesized blocks via webhooks. Policy for what to do with a conflict — which agent has authority, whether synthesis is blocked — is implemented by the customer on top of the API.

~~**Corpus permissions model.**~~ Resolved: Nexum provides corpus-scoped API keys and block-level access metadata. Customers implement their own access control policies using these primitives; Nexum does not enforce document-level permissions internally.

**Synthesis cost and trigger model.**
Agents can trigger synthesis on any schedule or event. The right default — ingest-triggered vs. scheduled batch vs. on-demand — affects both cost and freshness guarantees. The API should expose an ingest webhook that agents can subscribe to, so event-driven synthesis is possible without polling. Decision needed: is the ingest webhook a v1 feature or deferred?

**External source credibility model.**
Credibility weights on external documents are currently caller-assigned at ingest time. This is flexible but puts the entire burden on the customer. An optional Nexum-managed credibility taxonomy (e.g., peer-reviewed / trade press / company blog / social) with sensible defaults would reduce integration friction. Decision needed: does Nexum ship a default taxonomy, or is credibility always fully caller-defined?
