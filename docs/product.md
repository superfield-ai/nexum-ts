# Nexum — Product Overview

Nexum is a document intelligence platform. It ingests source documents and AI-generated analysis, then builds a navigable graph of every connection between them — down to the paragraph and line level. Specialized agents maintain living documents — handbooks, customer profiles, strategic plans — synthesized from the corpus and continuously updated as new material arrives.

---

## The Problem

Organizations accumulate knowledge across documents they never connect. A court filing cites a statute mischaracterized by opposing counsel on page 4. A customer profile lives across three CRMs and a support inbox. A strategic plan is contradicted by a trade journal article nobody linked to the forecast. The connections exist — they just live in someone's head, or nowhere at all. When team members change, that knowledge disappears.

Nexum makes those connections explicit, auditable, and continuously maintained.

---

## Who It's For

- **Litigation teams** managing large document sets across a case or portfolio
- **In-house counsel** tracking how internal drafts relate to external filings and regulatory text
- **Legal AI workflows** where agent-generated analysis needs to be grounded in source documents with verifiable citations
- **Operations and people teams** building and maintaining company handbooks from decisions, incidents, and institutional memory
- **Customer-facing teams** synthesizing customer intelligence across CRMs, contracts, and interaction history
- **Strategy and executive teams** maintaining forward-looking plans grounded in internal forecasts and external signals

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

---

## Synthesis Agents

Nexum includes a layer of persistent agents that read across the corpus and write living documents — synthesized outputs that are themselves full participants in the graph: linkable, versioned, and traceable back to every source block that produced them.

Each agent owns a document type and a corpus scope. It runs continuously, updating its output as new source material arrives. When sources conflict, the conflict surfaces as a `contradicts` link — not silently resolved or hidden.

### Handbook Agent

Maintains the company's operating handbook: what the organization does in each scenario, how decisions get made, what policies apply to which situations.

Source material: internal communications, decision logs, incident reports, postmortems, policy documents, leadership Q&As. The agent synthesizes these into structured handbook entries — one entry per scenario or policy — and links each entry back to the specific blocks it was drawn from.

When a new decision or incident contradicts an existing handbook entry, the agent flags the conflict and drafts a revision. A human approves or rejects the update. The prior entry is never deleted — it becomes the predecessor in the version chain.

The handbook is the operating system of the organization. Every entry is traceable to why it exists.

### Customer Profile Agent

Synthesizes a persistent, structured profile for each customer from every interaction and document the organization holds across systems.

Source material: contracts, support tickets, sales notes, email threads, call transcripts, invoices, CRM records. The agent reads across all of these and maintains a unified profile per customer: what they were promised, what they've experienced, what they've asked for, where friction exists.

When a contract block says "48-hour SLA" and a support ticket block says "customer was told 24 hours," that's a `contradicts` link — surfaced in the profile and queryable by anyone who needs to know.

Customer profiles are first-class documents in the graph. They can be linked to other profiles (shared contacts, joint contracts), to internal policies (handbook entries that govern how the customer relationship should be handled), and to any source block that informs them.

### Strategic Planning Agent

Maintains forward-looking planning documents grounded in both internal forecasts and external signals.

Source material (internal): financial projections, OKRs, board decks, product roadmaps, hiring plans. Source material (external): industry trade journal articles, competitor announcements, regulatory notices, macroeconomic signals.

The agent reads across both and maintains structured strategy documents — market position assessments, risk registers, competitive maps, scenario plans. Each claim in a strategy document links to the source blocks that support it. When an external signal contradicts an internal assumption, the contradiction is explicit in the graph.

External source material is ingested on a schedule. Each external document is given an `epistemic_status` of `external` and a credibility weight assigned at the source level (company blog vs. peer-reviewed research vs. trade press). Strategy document blocks inherit uncertainty from their sources.

---

## Synthesized Blocks and Source Blocks

Source blocks come from documents the organization ingested: filings, contracts, emails, reports. They are ground truth within their scope — the record of what was said or written.

Synthesized blocks come from agents: handbook entries, customer profile sections, strategy claims. They are claims with provenance. A synthesized block's confidence is a function of its sources: how many support it, whether any contradict it, and the credibility of the source documents.

This distinction is tracked in the data model. Every block carries an `origin` field — `source` or `synthesized` — and synthesized blocks carry a pointer to the agent that produced them. If a source block is corrected or retracted, all synthesized blocks derived from it are flagged for agent review.

The graph does not treat synthesized blocks as less real — they are fully linkable and fully navigable. But their epistemic status is always visible, and the chain from claim back to source is always one click away.

---

## Open Product Questions

These are unresolved design questions that affect scope and sequencing decisions. They are recorded here so they stay visible rather than getting decided implicitly.

**1. Vertical focus vs. platform positioning.**
The current product narrative leads with legal. The synthesis agent layer opens the product to any knowledge-intensive organization. Expanding the ICP before finding repeatability in one vertical risks building for nobody. Decision needed: does Nexum go deep on legal first and expand later, or does it lead with the platform story from the start?

**2. Who owns the handbook agent's output?**
When the agent drafts a revision to a handbook entry, someone has to approve it. Is that approval workflow inside Nexum, or is Nexum just the substrate and the approval happens in an external tool (Notion, Confluence, Google Docs)? If Nexum owns the approval UX, that's a significant product surface to build and maintain.

**3. External source ingestion for the strategy agent.**
Monitoring news, trade journals, and competitor signals requires connectors to external feeds — RSS, web scraping, third-party APIs. This is infrastructure work distinct from the internal corpus management that Areas 1–7 of the research plan cover. It introduces new concerns: rate limiting, source deduplication, freshness signaling, credibility weighting. Is this in scope for v1 of the strategy agent, or does v1 only read internal documents?

**4. Agent conflict resolution.**
When two agents produce blocks that contradict each other — the handbook agent says "our SLA is 48 hours" and the customer profile agent synthesizes "customer was promised 24 hours" — the graph surfaces the contradiction. But what happens next? Does a human resolve it? Does one agent have authority over the other? Does the conflict block future synthesis that depends on both? The graph can detect it; the product needs a policy for what to do with it.

**5. Corpus partitioning and agent permissions.**
Each synthesis agent is scoped to a corpus (handbook corpus, customer corpus, strategy corpus) with write access on synthesized blocks and read access across the full graph. But some source material is sensitive — an executive's private notes, a confidential settlement. Should agents have read access to everything, or do source documents carry access controls that constrain which agents can read them? This is a permissions model question with significant product surface area.

**6. Synthesis frequency and cost.**
Agents that run continuously on large corpora will accumulate significant LLM inference cost. The right model depends on how often source material changes and how quickly synthesized documents need to reflect it. This needs a cost model before any of the three agents are designed at the implementation level — the answer likely pushes toward event-driven synthesis (run on ingest) rather than scheduled polling.
