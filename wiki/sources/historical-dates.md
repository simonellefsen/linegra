# Historical date & calendar handling

Genealogical dates are **not** modern proleptic-Gregorian dates. Converting and interpreting them
correctly is one of the hardest parts of a genealogy data model, because the rules vary by
**country, region, era, and the way the record itself expresses the date**. This page captures the
domain so the [GEDCOM 7 date work](gedcom7-alignment.md) (P1) and roadmap item I are grounded in
reality rather than a naive "Julian vs Gregorian" toggle.

Primary reference for the Swedish/Finnish specifics below: *Almanacka för 500 år* (a Swedish
500-year almanac: Easter tables 1500–1999, weekday/Sunday/holiday calendars, name-day and Latin
medieval-dating registers).

## 1. Julian ↔ Gregorian adoption is region- and era-dependent

There is **no single global cutoff**. The Gregorian calendar was introduced in 1582 but adopted
over ~340 years:

| Region | Switched | Days skipped |
| --- | --- | --- |
| Catholic Europe (Spain, Portugal, Italy, Poland, much of France) | Oct 1582 | 4 Oct → 15 Oct (10) |
| Protestant German states, Denmark–Norway, Dutch republics | ~1700 | 10–11 |
| Great Britain & colonies (incl. American colonies) | 1752 | 2 Sep → 14 Sep (11) |
| **Sweden & Finland** | **1753** | **17 Feb → 1 Mar (11)** |
| Russia | 1918 | 13 |
| Greece | 1923 | 13 |

**Implication for Linegra:** a tree spanning regions cannot use one conversion rule. Conversion
must be keyed off **place + date**, and is often ambiguous. So the design principle is: **store the
date exactly as recorded (raw text) plus its calendar tag; never silently coerce to Gregorian.**
Any conversion is an explicit, optional, clearly-labelled derivation.

## 2. The Swedish calendar anomaly (1700–1712) and 1753

Sweden's transition was uniquely messy (the almanac ships dedicated "special calendars" for the
two anomaly years **1712 and 1753**):

- **1700–1712:** Sweden tried a gradual switch by *omitting* leap days. It dropped 29 Feb 1700 but
  then kept the leap days in 1704 and 1708, ending up **one day ahead of Julian and ten behind
  Gregorian** — a calendar used nowhere else, in Sweden *and* Finland.
- **1712:** Sweden reverted to the Julian calendar by adding a *second* leap day, producing the
  famous **30 February 1712**. (A real, valid date in Swedish records — a date parser must not
  reject it.)
- **1753:** Sweden/Finland finally adopted Gregorian by skipping 17 Feb → 1 Mar 1753 (11 days).

So for Swedish data: dates are **Julian before 1753** (with the 1700–1712 anomaly), Gregorian
after — and the gap years contain dates that are illegal in both standard calendars.

## 3. Dates recorded as feasts, name-days, and Latin forms

Pre-modern church records very often do **not** give a numeric date at all. They name a day:

- **Movable feasts** (relative to Easter): e.g. *Fastlagssöndagen* (Shrove Sunday),
  *Askonsdagen* (Ash Wednesday), *Pingstdagen* (Whitsunday/Pentecost), *Annandag Pingst*. Resolving
  these needs the Easter date for that year (the almanac's Easter table 1500–1999). Note also that
  **before 1773** the 3rd and 4th days of Pentecost were Swedish/Finnish holidays.
- **Name-days** (the saint/name calendar): e.g. *Hindersmässan* = St *Henrik* = **19 Jan**. The
  name-day calendar itself was reformed (the almanac distinguishes "Kalender före 1901").
- **Latin / Roman medieval dating**: *Dominica …*, *feria …*, Roman-numeral years, etc. (the
  almanac's Latin register `L`, `GN:b` medieval calendar days, `RS` Roman numerals).

These are common in the kinds of `.ged` files this project imports (Danish/Swedish church-record
exports). Fully resolving them to civil dates is essentially reimplementing the almanac's
algorithm (Easter computus + Sunday/holiday/name-day tables + Latin lookups) — a large, optional,
later enrichment. **Minimum bar:** preserve the original phrase verbatim (GEDCOM 7 `PHRASE`).

## 4. Year-start (dual dating)

The civil year did not always begin on 1 January (e.g. Annunciation/Lady-Day style starting 25
March in parts of Europe/England until 1752), producing dates written like **1648/9**. GEDCOM 7
keeps the normalized year and the original via `PHRASE` (`30 JAN 1649` + `PHRASE 30 JAN 1648/9`).

## Design takeaways for Linegra

1. **Lossless first.** Persist the raw date string + GEDCOM 7 calendar tag (`GREGORIAN`/`JULIAN`/…)
   + `PHRASE`. The structured-date model in [gedcom7-alignment.md](gedcom7-alignment.md) P1 must be
   able to represent Julian, BCE, ranges, approximations, `30 FEB 1712`, and a free-text phrase.
2. **Conversion is opt-in and place/era-aware**, never a silent global toggle. Surface the
   assumptions (which calendar, which adoption date) to the user.
3. **Feast/name-day/Latin resolution is a separate, later module** (roadmap item I, advanced);
   until then, keep the phrase intact and let users enter the civil date manually.
4. **Sorting** needs a best-effort comparable instant, but it must not be mistaken for an
   authoritative converted date.
