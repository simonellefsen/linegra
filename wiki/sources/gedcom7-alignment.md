# GEDCOM 7.0 alignment — gap analysis & plan

Goal: structure Linegra's schema and code around the **FamilySearch GEDCOM 7.0** standard
([spec](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html)) while still importing legacy
**GEDCOM 5.5.1 / 5.x** files. This page maps GEDCOM 7 concepts to the current model and prioritizes
the work. Current importer/exporter: [../../lib/gedcomParser.ts](../../lib/gedcomParser.ts); schema:
[../schema.md](../schema.md); tag reference: [gedcom-spec.md](gedcom-spec.md).

> Reality check (2026-06-20): every `.ged` fixture we have is `GEDC.VERS 5.5.1`. No 7.0 files in
> the wild yet for this project, but the model should be 7.0-shaped and 5.x-tolerant.
>
> Grounded against the official spec cloned at `/Users/lindau/codex/GEDCOM` — the
> machine-readable `extracted-files/grammar.abnf` (line grammar), `enumerationsets.tsv` (exact
> enum values), `cardinalities.tsv`/`substructures.tsv` (the structure model), `exid-types.json`
> (EXID authorities), and `version-detection/`. **Enum values below are the verified v7 sets.**
>
> **Which version to target:** the repo's `main` branch IS the latest released spec — **7.0.18**
> (`specification/gedcom-0-introduction.md` subtitle; tags up to `v7.0.18`). Stay on `main`; the
> `v7.1` / `v8.0` branches are **unreleased** development. Minor versions are forward-compatible —
> "a 7.0 document is also a valid 7.1 document" — so **target 7.0** and 7.1 will only add, never
> break. (Note: use 7.0.18's `grammar.abnf`; 7.0.17 had a Longitude ABNF typo, fixed in .18.)

## GEDCOM 7.0 in one paragraph

Seven record types — **INDI, FAM, SOUR, REPO, OBJE, SNOTE, SUBM** — plus HEAD/TRLR. UTF-8 only
(leading BOM U+FEFF), **`CONC` removed** (only `CONT` continues lines), `@` doubled only when
leading, no length limits, `@VOID@` for "intentionally no pointer". Extensions are `_`-prefixed and
**should be documented in `HEAD.SCHMA` via `TAG _X <uri>`**. Rich, typed substructures for dates
(calendars, ranges, approximations, `PHRASE`), names (parts + `TYPE` + `TRAN`/`LANG`), places
(`FORM`/`LANG`/`TRAN`/`MAP`/`EXID`), events (full event detail), associations (`ASSO`/`ROLE`),
citations (`QUAY` 0–3, `DATA`), and media (`OBJE`/`FILE` with MIME).

---

## P0 — Parser grammar correctness (fixes real bugs today; needed for 5.x AND 7.0)

> **✅ DONE 2026-06-20** — implemented in [../../lib/gedcomTokenizer.ts](../../lib/gedcomTokenizer.ts)
> (`tokenizeGedcom`), consumed by [../../lib/gedcomParser.ts](../../lib/gedcomParser.ts): BOM strip,
> `CONC`/`CONT` merge, `@@` un-escape, `@VOID@`, `HEAD.GEDC.VERS` detection, plus `RESN` privacy.
> The **7.0-only exporter** (P3 item 2) also landed. Remaining: P1 schema spine + P2 records.

These are not "7.0 features" — they're correctness gaps that already lose data on 5.5.1 imports.

1. **`CONT` / `CONC` line continuation — BROKEN.** The parser does not concatenate continuation
   lines. `CONT` = append with a newline; `CONC` = append with no separator (5.x only; removed in
   7.0). Today the long `2 CONC …` biographical notes in `myheritage.ged` are dropped. **Fix:**
   a generic continuation handler that appends `CONC`/`CONT` payloads onto the text value of the
   current structure (NOTE, TEXT, SNOTE, AUTH/TITL/PUBL, etc.), not just citations.
2. **BOM + encoding.** Strip a leading U+FEFF. Assume UTF-8 (7.0 mandates it). For 5.x, detect/skip
   ANSEL/UTF-16 or at least don't choke. `FileReader.readAsText` already decodes UTF-8.
3. **`@` un-escaping.** Payloads escape a leading `@` as `@@` (7.0) / all `@` (5.x). Un-escape on read.
4. **Header / version detection.** Read `HEAD.GEDC.VERS` (and `HEAD.SCHMA`) to branch behavior:
   only accept `CONC` for ≤5.5.1; read documented extension tags for 7.0.
5. **`@VOID@` pointers.** Treat as "no pointer" instead of creating a phantom record/relationship.

## P1 — Schema modernization (high value; lossless genealogy)

The current schema flattens several GEDCOM structures lossily. Restructure toward 7.0:

| Area | Current | GEDCOM 7.0 | Recommendation |
| --- | --- | --- | --- |
| **Dates** | `*_date date` + `*_date_text` | calendar (GREGORIAN/JULIAN/FRENCH_R/HEBREW), type (exact / `FROM..TO` period / `BET..AND`/`BEF`/`AFT` range / `ABT`/`CAL`/`EST`), BCE, dual-date, `PHRASE`, `TIME` | A single Postgres `date` can't hold ranges/approx/BCE/Julian. Treat the **raw GEDCOM date string as canonical** and add a parsed structured value (calendar, modifier, year±BCE, month, day, end-date, phrase) — a reusable jsonb shape or `gedcom_date` columns. Keep a best-effort `date` only for sorting. **Julian↔Gregorian conversion is region/era-dependent and genuinely hard** (Sweden's 1700–1712 anomaly incl. `30 FEB 1712`, switch 1753) — see [historical-dates.md](historical-dates.md) + roadmap I; never silently coerce. |
| **Names** | flat `first_name`/`middle_name`/`last_name`/`maiden_name`/`title` | repeatable `NAME` with parts `NPFX/GIVN/NICK/SPFX/SURN/NSFX`, `TYPE` ∈ **{AKA, BIRTH, IMMIGRANT, MAIDEN, MARRIED, OTHER, PROFESSIONAL}**, `TRAN`+`LANG` | Add a `person_names` table (or structured jsonb): raw string, parts, type, language, translations, is-primary. Derive `first/last` for UI/search. `maiden_name` → a `NAME TYPE MAIDEN`. (We already half-model alt names in metadata.) |
| **Sex/gender** | `gender_type ('M','F','O')` | `SEX` ∈ **{M, F, X, U}** (X = not applicable, U = unknown) | Migrate enum to M/F/X/U (`O`→`X` or `U`), add `U`. Optionally a separate gender-identity field — 7.0 decouples biological SEX from partner roles. |
| **Restriction / privacy** | `is_private boolean`, plus TNG `_PRIVATE` | standard **`RESN`** (restriction) ∈ **{CONFIDENTIAL, LOCKED, PRIVACY}** (a List, can combine) | 7.0 has a *standard* privacy mechanism — map our `isPrivate` ↔ `RESN PRIVACY` (and `LOCKED` = read-only). On export emit `RESN`, not `_PRIVATE`. On import accept both standard `RESN` and TNG `_PRIVATE`. There is **no standard `_LIVING`** — keep treating it as an extension (already documented in [gedcom-spec.md](gedcom-spec.md)). |
| **Events/attributes** | `person_events(event_type text, date, place, description, employer)` | event detail: `TYPE`, `AGE`, `CAUS`, `AGNC`, `RELI`, `ASSO`, value (attributes like `OCCU`/`RESI`/`DSCR`), per-event `SOUR`/`NOTE` | Standardize `event_type` to 7.0 tags; add `classification(TYPE)`, `age`, `cause`, `agency`, `religion`, attribute `value`; replace ad-hoc `employer`. Link sources/notes per event. |
| **Citations / quality** | `sources.reliability smallint (1-3)` AND `citations.quality text` | `QUAY` enum **0–3** (0 unreliable … 3 direct primary); `DATA` (EVEN list, DATE period, TEXT+MIME/LANG) | Unify on `QUAY 0–3` (currently two inconsistent fields). Add citation `DATA` (events/date/text). |
| **Identifiers** | `sources.external_id` only | `UID` (UUID per record), `EXID` (+`TYPE` authority), `REFN` | Store `UID`/`EXID`/`REFN` per person/family/source/place. **Also fixes the export round-trip id loss** noted in the 2026-06-20 log (xref `@P<id>@` prefix). |

## P2 — Missing record types

| Record | Current | Recommendation |
| --- | --- | --- |
| **REPO** (repository) | `sources.repository` is free text | `repositories` table + `source↔repo` link with `CALN` (call number). |
| **SNOTE** (shared note) | notes are inline-only | Support shared notes referenced by pointer, with `MIME` (text/plain vs text/html) + `LANG` + `TRAN`. At minimum add `mime`/`lang` to `notes`. |
| **OBJE** (multimedia) | `media_items(url, type enum image/audio/video/document, source, category)` | 7.0 `OBJE` has repeatable `FILE`, each with a real **MIME** media type (`FORM`, e.g. `image/jpeg`), an optional **`MEDI`** (source medium ∈ {AUDIO, BOOK, CARD, ELECTRONIC, FICHE, FILM, MAGAZINE, MANUSCRIPT, MAP, NEWSPAPER, OTHER, PHOTO, TOMBSTONE, VIDEO}), `TITL`, `TRAN` alt formats, and `CROP` regions. Note **MEDI = the medium it came from, not the file type** (that's MIME). Store real MIME, multiple files per object, crop/region. |
| **ASSO** (association) | `relationships` are family/bio only | Non-family links with `ROLE` ∈ **{CHIL, CLERGY, FATH, FRIEND, GODP, HUSB, MOTH, MULTIPLE, NGHBR, OFFICIATOR, OTHER, PARENT, SPOU, WIFE, WITN}** + `PHRASE`, attachable to a person **or an event**. Extend `relationship_type` or add an `associations` table. |
| **SUBM** (submitter) | none | Optional: capture submitter/contributor records from HEAD. Low priority. |

## P3 — Places, GEDCOM 7 export, and extensions

1. **Places**: current `places` (lat/lng + street/city/county/state/country) is a reasonable
   flattening, but 7.0 `PLAC` is an ordered list governed by `FORM`, plus `LANG`, `TRAN`
   translations, `MAP` (we have lat/lng), and `EXID`. Add raw hierarchical string + `FORM` + `LANG`
   + translations + place `EXID`. (Our deterministic place parser assumes most-specific-first —
   that's the GEDCOM convention, good.)
2. **GEDCOM 7.0 export**: `serializeGedcom` currently emits a minimal 5.5.1-ish file. A compliant
   7.0 writer needs: `HEAD.GEDC.VERS 7.0`, UTF-8 **BOM**, `CONT` (never `CONC`), `@VOID@`, real
   xref ids (`UID`), structured names/events/dates/places/sources/repos/OBJE/SNOTE, and **`SCHMA`
   declaring every `_`-extension** we emit (see below). Offer a 7.0 vs 5.5.1 export toggle.
3. **Extension strategy (`SCHMA`)**: formalize our custom tags. On **import**, read `HEAD.SCHMA`
   to interpret documented extension tags by URI (so third-party `_LIVING`-style tags are
   understood, not just guessed). On **export**, declare our tags (`_LIVING`, `_PRIVATE`, any
   DNA/Linegra-specific tags) in `SCHMA` with stable Linegra URIs. See
   [gedcom-spec.md](gedcom-spec.md) for the TNG `_LIVING`/`_PRIVATE` semantics we already handle.

## 5.5.1 → 7.0 conversion rules (importer)

From the official [migration guide](https://gedcom.io/migrate/). These are the concrete
transforms our 5.x importer must apply (and the inverse on 7.0 export). Several are easy wins that
belong with P0:

- **Enum case.** 5.5.1 enum payloads are lower-case; 7.0 is UPPER-case. Normalize on read:
  `NAME.TYPE birth`→`BIRTH`, `PEDI birth`→`BIRTH`, `RESN confidential`→`CONFIDENTIAL`,
  `FAMC.STAT challenged`→`CHALLENGED`, `SEX` non-standard→`U`.
- **Name pieces.** In 5.5.1, `GIVN`/`SURN` could be comma-lists (`SURN Hernandez, Martinez`); in
  7.0 these repeat as separate structures — split on comma, don't treat as one surname.
- **Removed/renamed tags:** `RELA`→`ROLE` (free text → enum; unmapped → `OTHER` + `PHRASE`);
  `ROMN`/`FONE`→`TRAN` (+`LANG` BCP-47); `AFN`/`RFN`/`RIN`→`EXID` (+`TYPE` URI, see
  `exid-types.json`); `NOTE` *record* → `SNOTE`; `SUBN`, `BLOB` dropped.
- **MAP coordinates.** 7.0 `LATI`/`LONG` carry a hemisphere letter: `N51.507` / `E0.128` (S/W ⇒
  negative). Parse the leading `N/S/E/W` into our signed `lat`/`lng` numerics (and re-emit it).
- **Media `FORM` → MIME.** `jpeg`→`image/jpeg`, `gif`→`image/gif`, `bmp`→`image/bmp`,
  `tiff`→`image/tiff`, `wav`→`audio/wav`, … Inline `OBJE` becomes a separate `OBJE` record +
  pointer; `FILE` paths become URIs (`file:///…`).
- **Sources.** Inline `SOUR` text becomes a separate `SOUR` record + pointer (TITL/TEXT).
- **Dates:** dual-dating `30 JAN 1648/9` → `30 JAN 1649` + `PHRASE 30 JAN 1648/9`; reorder
  ranges so `BET <earlier> AND <later>`; custom calendars `@#ROMAN@` → `_ROMAN` extension.
- **Ages:** `AGE CHILD`→`< 8y` (+`PHRASE Child`), `INFANT`→`< 1y`, `STILLBORN`→`DEAT`/`AGE 0y`
  + `BIRT`/`TYPE Stillborn`; new format uses `y`/`m`/`w`/`d` units.
- **Encoding:** ANSEL/UNICODE → UTF-8 + BOM (covered in P0).

These reinforce that the importer needs a small **5.x→internal normalization layer** keyed off
`HEAD.GEDC.VERS`, separate from the 7.0 path.

## Cross-cutting recommendations

- **Lossless archival.** Genealogy users expect round-trip fidelity. Keep the **raw GEDCOM
  payload/lines** for anything we don't fully model (in `metadata`/a raw table) so re-export is
  lossless even before the schema fully catches up. This de-risks the migration.
- **Capture `gedcom_version`** on each import (`gedcom_imports.stats`) and per-tree, to drive
  version-aware import/export.
- **Keep the warnings discipline** (SPEC §5): unsupported tags → warnings; now also surface
  `SCHMA`-documented extensions distinctly from truly-unknown tags.
- **Test with real 7.0 samples** — the [gedcom.io](https://gedcom.io) test files / `gedcom7` test
  suite — once the parser handles the grammar (P0).

## Suggested phasing

1. **P0 grammar** (CONC/CONT, BOM, `@`, header/version, `@VOID@`) — small, high-impact, fixes
   current data loss. Do first; add fixtures/tests.
2. **P1 dates + names + SEX + event detail + QUAY + UID** — the schema spine. Migrations + mapper +
   parser + UI. Biggest effort; sequence dates → names → events.
3. **P2 records** (REPO, SNOTE, OBJE/MIME, ASSO) — additive tables.
4. **P3 GEDCOM 7 export + SCHMA** — compliant writer + round-trip tests.

Each phase is independently shippable behind the existing import/export flow; the raw-payload
archival rule keeps every phase lossless.
