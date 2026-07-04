// K6 — Full autosomal marker index builder and kit-vs-kit comparison.

export interface AutosomalMarkerIndex {
  /** rsid → normalized genotype (e.g. AG, CT). */
  markers: Record<string, string>;
  calledMarkers: number;
  noCallMarkers: number;
  chromosomeCount: number;
}

export interface AutosomalIndexStats {
  calledMarkers: number;
  noCallMarkers: number;
  chromosomeCount: number;
  indexVersion: 1;
}

export interface AutosomalKitComparison {
  sharedSnps: number;
  halfIdenticalSnps: number;
  mismatches: number;
  overlapRate: number;
}

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, '').trim());
};

const normalizeGenotype = (value: string): string | null => {
  const normalized = value.toUpperCase().replace(/[^ACGT]/g, '');
  if (!normalized || normalized === '--') return null;
  return normalized;
};

/** Parse every called SNP from a raw autosomal CSV into a compact index. */
export const buildAutosomalMarkerIndex = (csvText: string): AutosomalMarkerIndex => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error('The file is empty.');
  }

  const markers: Record<string, string> = {};
  let calledMarkers = 0;
  let noCallMarkers = 0;
  const chromosomes = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const [rsid = '', chromosome = '', , result = ''] = parseCsvLine(lines[i]);
    if (!rsid) continue;
    if (chromosome) chromosomes.add(chromosome);
    const genotype = normalizeGenotype(result);
    if (!genotype) {
      noCallMarkers += 1;
      continue;
    }
    calledMarkers += 1;
    markers[rsid] = genotype;
  }

  return {
    markers,
    calledMarkers,
    noCallMarkers,
    chromosomeCount: chromosomes.size,
  };
};

export const indexStatsFromIndex = (index: AutosomalMarkerIndex): AutosomalIndexStats => ({
  calledMarkers: index.calledMarkers,
  noCallMarkers: index.noCallMarkers,
  chromosomeCount: index.chromosomeCount,
  indexVersion: 1,
});

const sortAlleles = (value: string): string =>
  value.length === 2 ? [...value].sort().join('') : value;

const allelesMatch = (left: string, right: string): boolean =>
  sortAlleles(left) === sortAlleles(right);

/** Compare two in-memory marker indices (shared / half-identical / mismatch counts). */
export const compareAutosomalMarkerIndices = (
  left: AutosomalMarkerIndex,
  right: AutosomalMarkerIndex
): AutosomalKitComparison => {
  let sharedSnps = 0;
  let halfIdenticalSnps = 0;
  let mismatches = 0;

  Object.entries(left.markers).forEach(([rsid, genotype]) => {
    const other = right.markers[rsid];
    if (!other) return;
    sharedSnps += 1;
    if (genotype === other) return;
    if (allelesMatch(genotype, other)) {
      halfIdenticalSnps += 1;
      return;
    }
    mismatches += 1;
  });

  const denominator = Math.max(left.calledMarkers, right.calledMarkers, 1);
  return {
    sharedSnps,
    halfIdenticalSnps,
    mismatches,
    overlapRate: sharedSnps / denominator,
  };
};

export const serializeMarkerIndex = (index: AutosomalMarkerIndex): string => JSON.stringify(index.markers);

export const deserializeMarkerIndex = (
  serialized: string,
  stats?: AutosomalIndexStats
): AutosomalMarkerIndex => {
  const markers = JSON.parse(serialized) as Record<string, string>;
  const calledMarkers = Object.keys(markers).length;
  return {
    markers,
    calledMarkers,
    noCallMarkers: stats?.noCallMarkers ?? 0,
    chromosomeCount: stats?.chromosomeCount ?? 0,
  };
};
