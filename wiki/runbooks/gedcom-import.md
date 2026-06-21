# Runbook: GEDCOM import / export

Context + fidelity rules: [../integrations/gedcom.md](../integrations/gedcom.md).

## Import a tree

1. Log in as super-admin; open the **GEDCOM** admin tab
   ([../../components/admin/AdminGedcomPanel.tsx](../../components/admin/AdminGedcomPanel.tsx)).
2. Select the **target tree** (imports bind to the active tree).
3. Choose a `.ged` file. `ImportExport.tsx` parses it client-side into persons + relationships.
4. **Review warnings** for unsupported/ignored tags before committing — don't ignore them.
5. Confirm import → `importGedcomToSupabase`
   ([../../services/archive.ts](../../services/archive.ts)) persists records and writes a
   `gedcom_imports` row (`status`, `stats`, `log`).
6. Verify: open the tree, spot-check a few imported persons (names, dates, places, sources).

## Export

- Use the export action in the GEDCOM panel / ImportExport component to produce a `.ged`.
  Serialization is `serializeGedcom` in [../../lib/gedcomParser.ts](../../lib/gedcomParser.ts);
  the component only wraps it in a Blob download.
- **Export is lossy + not id-preserving** — it emits names, sex, birth/death (date+place), and
  marriage families with children only. A re-import preserves person count and data fidelity but
  assigns fresh ids; see [../integrations/gedcom.md](../integrations/gedcom.md).
- Sample exports live in the repo root (`export-BloodTree.ged`,
  `export-BloodTree-Big-Andersen.ged`).

## Validation tips

- Large imports must show progress (SPEC §7) — watch for a hung UI on big files.
- Check that source/citation context survived (SPEC §5).
- Confirm `*_text` raw values are preserved for fuzzy dates/places.

## Troubleshooting

- **Nothing imported / silent fail** — check the `gedcom_imports.log` and the warnings list;
  the file may use tags the parser drops.
- **Records in the wrong tree** — the active tree at import time is the target; re-check the
  selector.
- **Round-trip differences** — expected today; round-trip tests are not yet implemented
  ([../roadmap.md](../roadmap.md) item E).
