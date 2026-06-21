# Integration: GEDCOM

GEDCOM is the genealogy interchange format. Linegra supports tolerant import and export.

> **Where the code lives:** the line grammar is [../../lib/gedcomTokenizer.ts](../../lib/gedcomTokenizer.ts)
> (`tokenizeGedcom` — BOM, `CONC`/`CONT`, `@VOID@`, version detection); **parsing and
> serialization** are [../../lib/gedcomParser.ts](../../lib/gedcomParser.ts) —
> `parseGedcom(text): GedcomParseResult` (imports **5.x and 7.x**) and
> `serializeGedcom(people, relationships): string` (exports **GEDCOM 7.0 only**). Unit-tested incl.
> round-trip in [../../lib/gedcomParser.test.ts](../../lib/gedcomParser.test.ts) /
> [../../lib/gedcomTokenizer.test.ts](../../lib/gedcomTokenizer.test.ts). The import/export **UI**
> (file input, Blob download) is [../../components/ImportExport.tsx](../../components/ImportExport.tsx) +
> [../../components/admin/AdminGedcomPanel.tsx](../../components/admin/AdminGedcomPanel.tsx);
> **persistence** is `importGedcomToSupabase` in
> [../../services/archive.ts](../../services/archive.ts).

> **Export is GEDCOM 7.0, and still lossy by design.** `serializeGedcom` emits names, sex,
> restriction, birth/death/burial (date+place+map), and marriage families with children — not yet
> events/sources/media (P1/P2). Xrefs are valid sequential ids (`@I1@`); the internal UUID is
> preserved via `1 UID`, but import does not yet *read* `UID`, so a round trip still assigns fresh
> ids and re-derives both parent links for each child. Tests assert person-count + referential
> integrity, not byte-identity.

## Import flow

1. User selects a `.ged` file in the GEDCOM admin panel.
2. `ImportExport.tsx` parses it client-side into `Person[]` + `Relationship[]`, collecting
   **warnings for unsupported/ignored tags**.
3. Records are bound to the **selected tree** and persisted via `importGedcomToSupabase`,
   which writes persons/relationships/places/events/sources and records the run in
   `gedcom_imports` (`status`, `stats`, `log`).

See the diagram in [../architecture.md](../architecture.md#4-gedcom-import-pipeline).

## Fidelity requirements (SPEC §5)

- Support standard individual/family/event records.
- **Capture ignored/unsupported tags** in import warnings (don't fail silently).
- Preserve source + citation context where available.
- Bind every imported record to the active tree.
- Keep raw values: the schema's `*_text` columns hold fuzzy dates/places alongside parsed ones.

## Test fixtures (in repo root)

- `export-BloodTree.ged`, `export-BloodTree-Big-Andersen.ged` — exported trees usable for
  round-trip / large-tree testing.

## Gotchas

- Large GEDCOM imports are an "expensive workflow" — must show progress (SPEC §7).
- Round-trip (import → export → diff) is **not** yet covered by tests — see
  [../roadmap.md](../roadmap.md) item E.

## GEDCOM 7.0

The importer/exporter currently target GEDCOM **5.5.1** (all fixtures are `GEDC.VERS 5.5.1`). The
plan to align the schema + code with **GEDCOM 7.0** (while still importing 5.x) — including a known
correctness bug where `CONC`/`CONT` continuation lines are not concatenated, so long notes are
dropped — is in [../sources/gedcom7-alignment.md](../sources/gedcom7-alignment.md) (roadmap item H).

Runbook: [../runbooks/gedcom-import.md](../runbooks/gedcom-import.md).
