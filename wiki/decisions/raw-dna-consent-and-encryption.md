# Decision: Consent + encryption for raw biometric DNA

**Decision.** Raw autosomal DNA (per-SNP genotype data) is treated as **sensitive biometric
data**: it is ingested only after explicit, timestamped, scope-limited consent, stored encrypted at
rest (or not persisted at all — keep only derived data), and **never** served on the public-first
read path. Consent does not imply indefinite retention.

## Why

- **Uniquely identifying and immutable.** Raw genotype data identifies not just the tested person
  but their blood relatives, and it can't be reissued the way a name, email, or even a photo can.
  The bar for storing it is higher than for any other data in the archive.
- **Public-first by default.** Linegra is a public-first archive
  ([../concepts/public-first-genealogy.md](../concepts/public-first-genealogy.md)); raw DNA must be
  opt-in and walled off from that default, not folded into the general media/document store.
- **Legal/ethical exposure.** Genetic data is special-category under GDPR and regulated under
  various US state biometric laws. Consent + data minimization is the baseline, not an enhancement.

## Rules

- **Consent gates ingestion.** Add `consent_given_at` (timestamptz) + `consent_scope` on
  `dna_tests`; no raw file is persisted without it. This **blocks K6** until it lands.
- **Minimize first.** Prefer *not* storing raw files at all — derive and keep only what's needed
  (segment overlaps, matching signatures/hashes). Full per-SNP raw ingestion is opt-in and the
  heaviest lift.
- **Encrypt at rest where stored.** Raw rows never travel through PostgREST/RLS public read.
  `dna_tests.is_private` already exists; raw-data rows must carry `is_private = true` and stay
  outside public read paths.
- **Deletable on demand.** A tested person (or admin) can purge raw data and its derived matches.
  Capture consent provenance (who/when/scope), not indefinite retention rights.

## Alternatives rejected

- **Store raw files like ordinary media.** Rejected — biometric sensitivity conflicts with the
  public-first default and the media store's read model.
- **Rely on `is_private` alone, no encryption/consent.** Rejected — a single flag is insufficient
  defense-in-depth for an immutable, hereditary identifier.

## Consequences

- **K6 (raw-autosomal ingestion) is blocked by this decision** until consent + encryption land.
- Adds a consent step to the DNA import/admin flow; the consent record is part of the audit trail.
- New SPEC ground — extend **SPEC §8** (security/permissions) when this item is picked up.

Related: [../concepts/dna-lineage-verification.md](../concepts/dna-lineage-verification.md),
[../roadmap.md](../roadmap.md) (K7), [../../docs/DNA_SETUP.md](../../docs/DNA_SETUP.md).
