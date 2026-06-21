# Source: GEDCOM tag notes

Distilled, practical notes on the GEDCOM tags that matter for Linegra's importer. This is a
working reference, **not** the full GEDCOM standard — when in doubt, consult the official
GEDCOM 5.5.1 / 7.0 specification. How Linegra uses these:
[../integrations/gedcom.md](../integrations/gedcom.md).

## Record structure

GEDCOM is a line-based, level-numbered hierarchy:

```
0 @I1@ INDI          # individual record
1 NAME John /Smith/  # surname between slashes
1 SEX M
1 BIRT
2 DATE 12 MAR 1850
2 PLAC London, England
0 @F1@ FAM            # family record
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1872
```

## Tags Linegra cares about

| Tag | Maps to |
| --- | --- |
| `INDI` | a `persons` row |
| `NAME` (`/.../` = surname) | `first_name` / `last_name` (+ maiden where present) |
| `SEX` | `gender_type` (M/F/O) |
| `BIRT`/`DEAT`/`BURI` + `DATE`/`PLAC` | person birth/death/burial date(+text) and place(+text) |
| `FAM`, `HUSB`/`WIFE`/`CHIL` | `relationships` (marriage/partner + parent/child) |
| `MARR` + `DATE` | relationship `status`/event |
| `SOUR`, `CITN`/`PAGE` | `sources` + `citations` |
| `NOTE` | `notes` |
| `OCCU`, `RESI`, other events | `person_events` / person fields |
| `_LIVING` (TNG custom) | `isLiving` — see below |
| `_PRIVATE` (TNG custom) | `isPrivate` (`_PRIVATE Y` → private; absence → public) |

## TNG custom tags (`_LIVING` / `_PRIVATE`)

Exports from [TNG (The Next Generation)](https://family.nose.dk/) use the `_`-prefixed custom
tags `_LIVING` and `_PRIVATE`. **TNG only ever emits `_LIVING Y`** (for people it considers
living) and **omits the tag entirely for the deceased** — there is no `_LIVING N`. So the
importer treats absence of `_LIVING` *in a file that uses it* as **deceased**, not as the default
"living" (`usesLivingTag` in `lib/gedcomParser.ts`). A GEDCOM that never uses `_LIVING` leaves
`isLiving` unset and falls back to the [living-inference rules](../../lib/lifespan.ts)
(death/burial or implausibly-old ⇒ deceased). See the 2026-06-20 log entry.

## Fidelity rules (SPEC §5)

- **Tolerant import:** unknown/unsupported tags must be **captured as warnings**, not silently
  dropped or fatal.
- Preserve raw values: fuzzy `DATE`/`PLAC` text goes into the `*_text` columns alongside any
  parsed typed value.
- Preserve source + citation context where available.
- Bind every record to the active tree.

## Edge cases to watch

- **Dates** are often approximate (`ABT`, `BEF`, `AFT`, `EST`) or non-Gregorian — keep the
  original string in `*_text`.
- **Places** vary wildly in granularity — store text; structure into `places` only when clean.
- **Custom `_`-prefixed tags** (vendor extensions) are common and should land in warnings, not
  errors.
