import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from './gedcomParser';
import {
  ARCHIVE_FULL_LOAD_WARN_PEOPLE,
  assessArchiveLoad,
  buildBinaryAncestorFixture,
  DEFAULT_PEDIGREE_ANCESTOR_DEPTH,
  DEFAULT_PEDIGREE_DESCENDANT_DEPTH,
  DEFAULT_PEDIGREE_VIEW_BUDGET,
  evaluatePedigreeScopeBudget,
  MAX_EXPANDED_PEDIGREE_VIEW_BUDGET,
  MAX_PEDIGREE_ANCESTOR_DEPTH,
  MAX_PEDIGREE_DESCENDANT_DEPTH,
  measurePedigreeScopeCompute,
  SCOPE_COMPUTE_BUDGET_MS,
} from './treePerformance';

describe('treePerformance — pedigree scope budgets', () => {
  it('keeps default-depth scope within the default view budget on a deep binary tree', () => {
    const { people, relationships, focusId } = buildBinaryAncestorFixture(12);
    const { scope } = measurePedigreeScopeCompute(
      people,
      relationships,
      focusId,
      DEFAULT_PEDIGREE_ANCESTOR_DEPTH,
      DEFAULT_PEDIGREE_DESCENDANT_DEPTH
    );
    const evaluation = evaluatePedigreeScopeBudget(scope, DEFAULT_PEDIGREE_VIEW_BUDGET);
    expect(evaluation.ok).toBe(true);
    expect(evaluation.stats.people).toBeLessThanOrEqual(DEFAULT_PEDIGREE_VIEW_BUDGET.maxPeople);
  });

  it('keeps max-expanded scope within the expanded budget on a deep binary tree', () => {
    const { people, relationships, focusId } = buildBinaryAncestorFixture(12);
    const { scope } = measurePedigreeScopeCompute(
      people,
      relationships,
      focusId,
      MAX_PEDIGREE_ANCESTOR_DEPTH,
      MAX_PEDIGREE_DESCENDANT_DEPTH
    );
    const evaluation = evaluatePedigreeScopeBudget(scope, MAX_EXPANDED_PEDIGREE_VIEW_BUDGET);
    expect(evaluation.ok).toBe(true);
    expect(scope.hasMoreAncestors).toBe(true);
  });

  it('filters a large in-memory archive quickly at default depth', () => {
    const { people, relationships, focusId } = buildBinaryAncestorFixture(10);
    const { ms } = measurePedigreeScopeCompute(
      people,
      relationships,
      focusId,
      DEFAULT_PEDIGREE_ANCESTOR_DEPTH,
      DEFAULT_PEDIGREE_DESCENDANT_DEPTH
    );
    expect(ms).toBeLessThan(SCOPE_COMPUTE_BUDGET_MS);
  });
});

describe('treePerformance — archive load assessment', () => {
  it('flags large full-tree loads for admin-only workflows', () => {
    const small = assessArchiveLoad(100, 200);
    const large = assessArchiveLoad(ARCHIVE_FULL_LOAD_WARN_PEOPLE, 12_000);
    expect(small.exceedsWarnThreshold).toBe(false);
    expect(large.exceedsWarnThreshold).toBe(true);
    expect(large.message).toContain('loadPedigreeScope');
  });
});

const repoRoot = process.cwd();
const gedFixtures = fs
  .readdirSync(repoRoot)
  .filter((name) => name.toLowerCase().endsWith('.ged'))
  .map((name) => path.join(repoRoot, name));

describe.skipIf(gedFixtures.length === 0)('treePerformance — real .ged fixtures (local only)', () => {
  it.each(gedFixtures)(
    'default pedigree scope on %s stays within budget regardless of total tree size',
    (file) => {
      const { people, relationships } = parseGedcom(fs.readFileSync(file, 'utf8'));
      const focusId = people[0]?.id;
      expect(focusId).toBeTruthy();

      const { scope, ms } = measurePedigreeScopeCompute(
        people,
        relationships,
        focusId,
        DEFAULT_PEDIGREE_ANCESTOR_DEPTH,
        DEFAULT_PEDIGREE_DESCENDANT_DEPTH
      );

      const evaluation = evaluatePedigreeScopeBudget(scope, DEFAULT_PEDIGREE_VIEW_BUDGET);
      expect(evaluation.ok).toBe(true);
      expect(scope.people.length).toBeLessThan(people.length);
      expect(ms).toBeLessThan(SCOPE_COMPUTE_BUDGET_MS * 4);
    }
  );
});
