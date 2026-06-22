# Decision: AI narrative is human-editable, human-owned, and grounded

**Decision.** All AI-generated narrative — person biographies and book chapters — is a **first
draft that a human always owns and can freely edit**. AI output is never locked or presented as
authoritative. Generated genealogical claims should be **grounded** in stored facts/sources, and
narrative that isn't evidence-backed must be visibly distinguishable from what is.

## Why

- **Accuracy is the product.** Genealogy is evidence work; uneditable AI prose presented as fact is
  a liability (hallucinated dates, places, or relationships). The narrative must stay correctable.
- **Human ownership of voice.** The archive's narrative voice is the curator's; AI is an assistant.
  `person_biographies.is_manual` already exists to signal human authorship — treat it as
  authoritative, not decorative.
- **Editability is load-bearing.** The book editor (M1), manual biography editing (M6), and
  AI-assisted editing (M10) all assume editable text. This decision is their foundation.

## Rules

- **`is_manual` is respected.** Any human edit sets `is_manual = true`; once manual, a biography is
  human-owned. An AI rewrite of a manual bio is a **"replace draft" action that confirms first**,
  never a silent overwrite.
- **AI never auto-mutates saved, human-edited narrative** without an explicit user action.
- **Ground what you can.** Generated text should cite/anchor to `BookChapterFacts` and the existing
  sources/citation system where possible. Passages with no factual basis are flagged as narrative
  interpolation, not blended into asserted fact (M11).
- **Surface the distinction publicly.** Public-facing narrative should make clear what is
  evidence-backed versus interpretive.

## How it works

- Builds on the existing `person_biographies` model (`is_manual`, `signature`, staleness) and
  `BookChapterFacts` in [../../lib/bookComposer.ts](../../lib/bookComposer.ts); books already reuse
  stored biographies rather than recomposing blindly.
- Grounding ties into the existing `sources` / citation records — no new evidence store required.

## Alternatives rejected

- **AI output as final/locked.** Rejected — accuracy and human ownership both forbid it.
- **Free-form narrative with no grounding markers.** Rejected — in a genealogy context, unmarked
  inference reads as assertion and erodes trust.

## Consequences

- M1 (book editor), M6 (manual bio editing), and M10 (AI-assisted editing) all build on this; M11
  (grounding/citations) is the mechanism.
- Requires a confirm-before-overwrite on manual bios, and prompt/structure work for grounding.
- New SPEC ground — extend **SPEC §3.5** (admin workspace) and **§8** when these items are picked up.

Related: [../concepts/ai-family-books.md](../concepts/ai-family-books.md),
[../concepts/ai-assisted-normalization.md](../concepts/ai-assisted-normalization.md),
[../roadmap.md](../roadmap.md) (M), [../../services/ai.ts](../../services/ai.ts),
[../../lib/bookComposer.ts](../../lib/bookComposer.ts).
