// K4 — Haplogroup → migration route reference with geographic steps and era context.

export type HaplogroupLine = 'Y-DNA' | 'mtDNA' | 'Mitotree';

export interface MigrationStep {
  region: string;
  period: string;
  note: string;
}

export interface HaplogroupRouteInfo {
  haplogroup: string;
  line: HaplogroupLine;
  /** Full Mitotree haplotype when merged with mtDNA on the same maternal line. */
  mitotreeTerminal?: string;
  /** Where this line is most common today. */
  region: string;
  era: string;
  /** Plain-language explanation of the era label. */
  eraGuide: string;
  description: string;
  /** Phylogenetic SNP path from macro-haplogroup to terminal. */
  path: string[];
  migrationSteps: MigrationStep[];
  /** True when migration context is inferred from a parent clade, not an exact terminal match. */
  inferred?: boolean;
}

interface RouteEntry {
  region: string;
  era: string;
  description: string;
  path: string[];
  migrationSteps: MigrationStep[];
}

const ERA_GUIDES: Record<string, string> = {
  Paleolithic:
    'Old Stone Age (c. 2.5 million years ago – 10,000 BCE). Hunter-gatherer societies before agriculture; includes the last Ice Age and the spread of modern humans out of Africa.',
  'Upper Paleolithic':
    'Late Old Stone Age (c. 50,000 – 10,000 BCE). Modern humans colonize Eurasia; cave art, refined stone tools, and post-glacial resettlement of northern Europe.',
  Mesolithic:
    'Middle Stone Age (c. 10,000 – 5,000 BCE). Post-Ice-Age foragers in newly ice-free coasts and forests; fishing and microlith cultures in Scandinavia.',
  Neolithic:
    'New Stone Age (c. 10,000 – 3,000 BCE). Farming and pottery spread from the Near East into Europe, mixing with local hunter-gatherers.',
  'Neolithic–Bronze Age':
    'c. 4000 – 1200 BCE. Farming societies, metalworking, and long-distance exchange reshape European population structure.',
  'Bronze Age':
    'c. 3200 – 600 BCE. Widespread metal use, warrior elites, and trade networks linking Scandinavia to continental Europe.',
  'Iron Age / Viking Age':
    'c. 500 BCE – 1100 CE. Iron technology, expanding chiefdoms and kingdoms; Norse expansion across the North Atlantic.',
  Medieval: 'c. 500 – 1500 CE. Christian kingdoms, written records, and the genealogical horizon for many European lineages.',
  Holocene: 'The current geological epoch (c. 11,700 BCE – present), covering post-Ice-Age climate and all recorded human history.',
  'Late Paleolithic': 'c. 14,000 – 10,000 BCE. Warming after the Last Glacial Maximum; populations move north into emptied landscapes.',
  'Mesolithic–Neolithic': 'c. 8000 – 2500 BCE. Transition from foraging to farming across much of western Europe.',
};

const withEraGuide = (entry: RouteEntry): RouteEntry => entry;

const Y_OUT_OF_AFRICA: MigrationStep[] = [
  {
    region: 'East Africa',
    period: 'c. 200,000 – 60,000 BCE',
    note: 'Origin of modern humans; deep Y-chromosome diversity in Africa.',
  },
  {
    region: 'Near East / Arabian corridor',
    period: 'c. 60,000 – 45,000 BCE',
    note: 'Primary exit route from Africa into western Asia during the Upper Paleolithic.',
  },
];

const Y_ROUTES: Record<string, RouteEntry> = {
  'R-M207': withEraGuide({
    region: 'Eurasia',
    era: 'Upper Paleolithic',
    description:
      'Haplogroup R is a major Eurasian Y-DNA lineage. Most European men carry branches of R1b (R-M269) or R1a.',
    path: ['R-M207'],
    migrationSteps: [
      ...Y_OUT_OF_AFRICA,
      {
        region: 'Central Asia / Iranian plateau',
        period: 'c. 25,000 – 15,000 BCE',
        note: 'R diversifies; R1b and R1a split and expand toward Europe and South Asia.',
      },
    ],
  }),
  'R-M269': withEraGuide({
    region: 'Western & Northern Europe',
    era: 'Bronze Age',
    description:
      'R-M269 (R1b-M269) dominates Atlantic and much of northern Europe. Scandinavian subclades descend from this wide founder wave.',
    path: ['R-M207', 'R-M269'],
    migrationSteps: [
      ...Y_OUT_OF_AFRICA,
      {
        region: 'Pontic–Caspian steppe / Eastern Europe',
        period: 'c. 3500 – 2500 BCE',
        note: 'Steppe-related expansions bring R1b lineages westward into central and Atlantic Europe.',
      },
      {
        region: 'Scandinavia & North Sea coast',
        period: 'c. 2000 BCE – 500 CE',
        note: 'Later Iron Age and Germanic-era branching produces region-specific R1b subclades.',
      },
    ],
  }),
  'R-Z284': withEraGuide({
    region: 'Scandinavia',
    era: 'Iron Age / Viking Age',
    description:
      'R-Z284 is a distinctly Nordic R1b branch — common in Norway, Sweden, and the Scottish Northern Isles.',
    path: ['R-M207', 'R-M269', 'R-Z284'],
    migrationSteps: [
      ...Y_OUT_OF_AFRICA,
      {
        region: 'Eastern Europe / Baltic',
        period: 'c. 2500 – 500 BCE',
        note: 'R1b lineages spread north with metal-age cultures and coastal exchange.',
      },
      {
        region: 'Norway, Sweden, Denmark',
        period: 'c. 500 BCE – 1100 CE',
        note: 'R-Z284 and downstream SNPs (e.g. R-BY…) refine during the Iron Age and Viking period.',
      },
    ],
  }),
  'R-BY67151': withEraGuide({
    region: 'Norway / Scandinavia',
    era: 'Iron Age / Viking Age',
    description:
      'R-BY67151 is a young Norwegian R1b subclade under the Nordic R-Z284 line — consistent with a deep Scandinavian paternal lineage.',
    path: ['R-M207', 'R-M269', 'R-Z284', 'R-BY67151'],
    migrationSteps: [
      ...Y_OUT_OF_AFRICA,
      {
        region: 'Eastern Europe → Baltic',
        period: 'c. 2500 – 500 BCE',
        note: 'R1b ancestors reach the Baltic and Scandinavian sphere with Bronze Age networks.',
      },
      {
        region: 'Western Norway / coastal Scandinavia',
        period: 'c. 500 CE – present',
        note: 'Terminal BY branch likely arose in medieval or early-modern Norway within an established Nordic R1b population.',
      },
    ],
  }),
  'I-M170': withEraGuide({
    region: 'Europe',
    era: 'Upper Paleolithic',
    description:
      'Haplogroup I is one of Europe’s indigenous Y-DNA lines — largely confined to the continent after the Ice Age.',
    path: ['I-M170'],
    migrationSteps: [
      ...Y_OUT_OF_AFRICA,
      {
        region: 'Balkans / glacial refugia',
        period: 'c. 30,000 – 15,000 BCE',
        note: 'I-lineages survive the Last Glacial Maximum in southeastern European refugia.',
      },
      {
        region: 'Central & Northern Europe',
        period: 'c. 12,000 – 2000 BCE',
        note: 'Post-glacial expansion repopulates Scandinavia and the North European Plain.',
      },
    ],
  }),
  'I-M253': withEraGuide({
    region: 'Scandinavia / Northern Europe',
    era: 'Neolithic–Bronze Age',
    description:
      'I1 (I-M253) is the classic Scandinavian/Germanic Y-DNA lineage — strongest in Norway, Sweden, and Denmark.',
    path: ['I-M170', 'I-M253'],
    migrationSteps: [
      ...Y_OUT_OF_AFRICA,
      {
        region: 'Balkans → Central Europe',
        period: 'c. 15,000 – 4000 BCE',
        note: 'I1 ancestors spread north as forests return after the Ice Age.',
      },
      {
        region: 'Scandinavia',
        period: 'c. 2000 BCE – 1100 CE',
        note: 'I1 becomes dominant in Nordic populations and spreads with Viking-era mobility.',
      },
    ],
  }),
  'I-M6155': withEraGuide({
    region: 'Scandinavia',
    era: 'Iron Age / Viking Age',
    description:
      'I-M6155 is a younger I1 subclade frequent in Norwegian and broader Scandinavian pedigrees.',
    path: ['I-M170', 'I-M253', 'I-M6155'],
    migrationSteps: [
      ...Y_OUT_OF_AFRICA,
      {
        region: 'Northern Europe',
        period: 'c. 4000 BCE – 500 CE',
        note: 'I1 lineages established across Scandinavia before the Iron Age.',
      },
      {
        region: 'Norway / western Scandinavia',
        period: 'c. 500 – 1200 CE',
        note: 'Terminal M6155 branch within the Viking-age I1 population.',
      },
    ],
  }),
  'N-M231': withEraGuide({
    region: 'Northern Eurasia',
    era: 'Neolithic',
    description:
      'Haplogroup N is characteristic of Finnic, Uralic, and Siberian paternal lines — common in eastern Finland and Karelia.',
    path: ['N-M231'],
    migrationSteps: [
      ...Y_OUT_OF_AFRICA,
      {
        region: 'East Asia / Siberia',
        period: 'c. 20,000 – 5000 BCE',
        note: 'N spreads across northern Asia along taiga and tundra corridors.',
      },
      {
        region: 'Baltic Finnic sphere',
        period: 'c. 2000 BCE – present',
        note: 'Uralic-speaking populations carry N into Finland, Estonia, and adjacent regions.',
      },
    ],
  }),
};

const MT_OUT_OF_AFRICA: MigrationStep[] = [
  {
    region: 'East Africa',
    period: 'c. 150,000 – 70,000 BCE',
    note: 'Mitochondrial L lines originate in Africa; all non-African mtDNA descends from a small founder pool.',
  },
  {
    region: 'Near East',
    period: 'c. 60,000 – 45,000 BCE',
    note: 'Macro-haplogroups M and N arise near the exit from Africa; European lines derive from N.',
  },
];

const MT_ROUTES: Record<string, RouteEntry> = {
  U: withEraGuide({
    region: 'Europe',
    era: 'Upper Paleolithic',
    description:
      'Haplogroup U was the dominant European mtDNA lineage among Ice Age hunter-gatherers — especially U5 in the north.',
    path: ['N', 'R', 'U'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Near East → Balkans',
        period: 'c. 40,000 – 25,000 BCE',
        note: 'U expands with Gravettian and later hunter-gatherer cultures across Europe.',
      },
    ],
  }),
  U5: withEraGuide({
    region: 'Northern & Western Europe',
    era: 'Upper Paleolithic',
    description:
      'U5 is the classic European hunter-gatherer mtDNA lineage — especially U5b in Scandinavia, Britain, and the Atlantic fringe.',
    path: ['N', 'R', 'U', 'U5'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Southern European refugia',
        period: 'c. 25,000 – 15,000 BCE',
        note: 'U5 survives the Last Glacial Maximum in Iberian and Balkan refugia.',
      },
      {
        region: 'Scandinavia & North Atlantic',
        period: 'c. 11,000 BCE – present',
        note: 'Post-glacial recolonization brings U5b lines into Norway, Britain, and the Baltic.',
      },
    ],
  }),
  U5b: withEraGuide({
    region: 'Scandinavia / Atlantic Europe',
    era: 'Mesolithic',
    description:
      'U5b is strongly associated with Mesolithic foragers of western and northern Europe — fishing and coastal subsistence.',
    path: ['N', 'R', 'U', 'U5', 'U5b'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Franco-Cantabrian refugium (Iberia / S. France)',
        period: 'c. 20,000 – 12,000 BCE',
        note: 'U5b ancestors endure the Ice Age in Atlantic refugia.',
      },
      {
        region: 'Norway, British Isles, Baltic coast',
        period: 'c. 10,000 – 3000 BCE',
        note: 'Maglemosian and related forager cultures spread U5b along northern coasts.',
      },
    ],
  }),
  U5b1b1a: withEraGuide({
    region: 'Scandinavia / British Isles',
    era: 'Mesolithic–Neolithic',
    description:
      'U5b1b1a is a northern European sub-branch of U5b — found in Norway, Sweden, Britain, and among Saami-related lines.',
    path: ['N', 'R', 'U', 'U5', 'U5b', 'U5b1', 'U5b1b', 'U5b1b1a'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Atlantic & North Sea coast',
        period: 'c. 10,000 – 4000 BCE',
        note: 'Mesolithic coastal foragers carry U5b into Scandinavia before farming arrives.',
      },
      {
        region: 'Norway / western Scandinavia',
        period: 'c. 4000 BCE – present',
        note: 'U5b1b1a persists through Neolithic admixture — still common in modern Nordic populations.',
      },
    ],
  }),
  U1: withEraGuide({
    region: 'Near East / Eastern Europe',
    era: 'Late Paleolithic',
    description:
      'U1 is more eastern than U5 — frequent in the Near East, Caucasus, and parts of eastern Europe.',
    path: ['N', 'R', 'U', 'U1'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Levant / Caucasus',
        period: 'c. 30,000 – 15,000 BCE',
        note: 'U1 diversifies in western Asia before spreading northwest.',
      },
      {
        region: 'Eastern & Northern Europe',
        period: 'c. 10,000 BCE – present',
        note: 'U1a branches reach the Baltic and Nordic regions in smaller frequencies than U5.',
      },
    ],
  }),
  U1a1a2: withEraGuide({
    region: 'Northern / Eastern Europe',
    era: 'Holocene',
    description:
      'U1a1a2 appears across Baltic, Nordic, and eastern European populations — a younger U1 branch.',
    path: ['N', 'R', 'U', 'U1', 'U1a', 'U1a1a', 'U1a1a2'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Eastern Europe / Steppe fringe',
        period: 'c. 8000 – 2000 BCE',
        note: 'U1a lineages spread with Holocene exchange networks.',
      },
      {
        region: 'Baltic & Scandinavia',
        period: 'c. 2000 BCE – present',
        note: 'Terminal U1a1a2 branch in modern northern European gene pools.',
      },
    ],
  }),
  H: withEraGuide({
    region: 'Western Europe',
    era: 'Mesolithic–Neolithic',
    description:
      'H is today’s most common European mtDNA haplogroup — expanded strongly with early farming and later migrations.',
    path: ['N', 'R', 'H'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Near East (Fertile Crescent)',
        period: 'c. 20,000 – 8000 BCE',
        note: 'H originates in western Asia before the Neolithic farming spread.',
      },
      {
        region: 'Atlantic & Central Europe',
        period: 'c. 6000 – 2000 BCE',
        note: 'Neolithic farmers and subsequent migrations make H dominant across Europe.',
      },
    ],
  }),
  J: withEraGuide({
    region: 'Near East / Mediterranean / Europe',
    era: 'Neolithic',
    description:
      'Haplogroup J arose in western Asia and spread with early farming cultures into the Mediterranean and Europe.',
    path: ['N', 'JT', 'J'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Levant / Anatolia',
        period: 'c. 25,000 – 8000 BCE',
        note: 'JT and J diversify in the Near East before Neolithic expansions.',
      },
      {
        region: 'Mediterranean & southeastern Europe',
        period: 'c. 7000 – 2000 BCE',
        note: 'J lineages enter Europe with farming and later Bronze Age exchange.',
      },
    ],
  }),
  J1: withEraGuide({
    region: 'Mediterranean / Europe',
    era: 'Neolithic–Bronze Age',
    description:
      'J1 is a major European branch of J — common from Iberia to the Balkans and present at lower frequency in northern Europe.',
    path: ['N', 'JT', 'J', 'J1'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Near East → Aegean / Adriatic',
        period: 'c. 7000 – 3000 BCE',
        note: 'J1 spreads with Neolithic maritime and overland routes into southern Europe.',
      },
      {
        region: 'Central & Northern Europe',
        period: 'c. 2000 BCE – present',
        note: 'Later migrations and admixture carry J1-derived lines into Baltic and Nordic gene pools.',
      },
    ],
  }),
  J1c: withEraGuide({
    region: 'Europe',
    era: 'Neolithic–Bronze Age',
    description:
      'J1c is one of the most frequent J branches in Europe — found from the Atlantic fringe to Scandinavia.',
    path: ['N', 'JT', 'J', 'J1', 'J1c'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Southeastern Europe / Balkans',
        period: 'c. 6000 – 2500 BCE',
        note: 'J1c expands with early European farmers and later metal-age networks.',
      },
      {
        region: 'Western, central, and northern Europe',
        period: 'c. 2000 BCE – present',
        note: 'J1c subclades appear across the continent, including low–moderate frequency in Nordic populations.',
      },
    ],
  }),
  J1c2: withEraGuide({
    region: 'Europe',
    era: 'Bronze Age',
    description:
      'J1c2 is a widespread European J1c branch — present from southern Europe to the British Isles and Scandinavia.',
    path: ['N', 'JT', 'J', 'J1', 'J1c', 'J1c2'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Central / Western Europe',
        period: 'c. 2500 – 500 BCE',
        note: 'J1c2 diversifies during Bronze Age population mixing across the continent.',
      },
      {
        region: 'Northern Europe & Atlantic fringe',
        period: 'c. 500 BCE – present',
        note: 'Younger J1c2 subclades reach Nordic and British populations through medieval and modern gene flow.',
      },
    ],
  }),
  J1c2a: withEraGuide({
    region: 'Europe / Scandinavia',
    era: 'Holocene',
    description:
      'J1c2a is a younger European maternal line under J1c2 — reported in Norway, Britain, and broader European datasets.',
    path: ['N', 'JT', 'J', 'J1', 'J1c', 'J1c2', 'J1c2a'],
    migrationSteps: [
      ...MT_OUT_OF_AFRICA,
      {
        region: 'Western & Central Europe',
        period: 'c. 2000 BCE – 500 CE',
        note: 'J1c2 ancestors established across Europe before the formation of terminal J1c2a branches.',
      },
      {
        region: 'Scandinavia & North Atlantic',
        period: 'c. 500 CE – present',
        note: 'J1c2a appears in modern Nordic and British mtDNA pools — consistent with continental maternal ancestry.',
      },
    ],
  }),
};

const MITOTREE_ALIASES: Record<string, string> = {
  U1a1a2a1: 'U1a1a2',
  J1c2a8a: 'J1c2a',
};

const normalizeMitotreeKey = (value: string): string => {
  const base = value.split('+')[0].trim();
  return MITOTREE_ALIASES[base] || base;
};

/** Match exact key or longest known prefix (U5b1b1a → U5b1b1a → U5b → U5 → U). */
const findLongestPrefix = (haplogroup: string, table: Record<string, RouteEntry>): RouteEntry | null => {
  if (table[haplogroup]) return table[haplogroup];
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const candidate of keys) {
    if (haplogroup.startsWith(candidate)) return table[candidate];
  }
  return null;
};

const eraGuideFor = (era: string): string =>
  ERA_GUIDES[era] ||
  `${era} — see geological/archaeological period labels for the human-history timeframe.`;

const buildRoute = (
  haplogroup: string,
  line: HaplogroupLine,
  entry: RouteEntry,
  options?: { terminalPath?: string[]; descriptionSuffix?: string; inferred?: boolean }
): HaplogroupRouteInfo => ({
  haplogroup,
  line,
  region: entry.region,
  era: entry.era,
  eraGuide: eraGuideFor(entry.era),
  description: options?.descriptionSuffix
    ? `${entry.description} ${options.descriptionSuffix}`
    : entry.description,
  path: options?.terminalPath || entry.path,
  migrationSteps: entry.migrationSteps,
  inferred: options?.inferred,
});

/** Generic Y-DNA fallback for unknown R- or I- terminals. */
const fallbackYRoute = (haplogroup: string): HaplogroupRouteInfo | null => {
  if (haplogroup.startsWith('R-')) {
    const entry = findLongestPrefix(haplogroup, Y_ROUTES) || Y_ROUTES['R-M269'];
    if (!entry) return null;
    return buildRoute(haplogroup, 'Y-DNA', entry, {
      terminalPath: [...entry.path.filter((s) => s !== haplogroup), haplogroup],
      descriptionSuffix: `Terminal subclade ${haplogroup} — phylogeny inferred from nearest known parent in the reference.`,
      inferred: true,
    });
  }
  if (haplogroup.startsWith('I-')) {
    const entry = findLongestPrefix(haplogroup, Y_ROUTES) || Y_ROUTES['I-M170'];
    if (!entry) return null;
    return buildRoute(haplogroup, 'Y-DNA', entry, {
      terminalPath: [...entry.path.filter((s) => s !== haplogroup), haplogroup],
      descriptionSuffix: `Terminal subclade ${haplogroup} — phylogeny inferred from nearest known parent in the reference.`,
      inferred: true,
    });
  }
  return null;
};

/** Generic mtDNA fallback when terminal is not in the table but a parent clade is. */
const fallbackMtRoute = (haplogroup: string, line: HaplogroupLine): HaplogroupRouteInfo | null => {
  const key = line === 'Mitotree' ? normalizeMitotreeKey(haplogroup) : haplogroup;
  const entry = findLongestPrefix(key, MT_ROUTES);
  if (!entry || entry.path[entry.path.length - 1] === key) return null;
  const parent = entry.path[entry.path.length - 1];
  return buildRoute(haplogroup, line === 'Mitotree' ? 'Mitotree' : 'mtDNA', entry, {
    terminalPath: [...entry.path.filter((s) => s !== key), haplogroup],
    descriptionSuffix: `Terminal haplogroup ${haplogroup} — migration context inferred from nearest known parent (${parent}) in the reference dataset.`,
    inferred: true,
  });
};

export const lookupHaplogroupRoute = (
  haplogroup: string | undefined,
  line: HaplogroupLine
): HaplogroupRouteInfo | null => {
  if (!haplogroup?.trim()) return null;
  const trimmed = haplogroup.trim();

  if (line === 'Y-DNA') {
    const entry = findLongestPrefix(trimmed, Y_ROUTES);
    if (entry) {
      const path =
        entry.path[entry.path.length - 1] === trimmed
          ? entry.path
          : [...entry.path.filter((s) => s !== trimmed), trimmed];
      return buildRoute(trimmed, 'Y-DNA', entry, { terminalPath: path });
    }
    return fallbackYRoute(trimmed);
  }

  if (line === 'Mitotree') {
    const mtKey = normalizeMitotreeKey(trimmed);
    const entry = findLongestPrefix(mtKey, MT_ROUTES);
    if (!entry) return fallbackMtRoute(trimmed, 'Mitotree');
    return buildRoute(trimmed, 'Mitotree', entry, {
      terminalPath: [...entry.path, trimmed],
      descriptionSuffix: `Mitotree terminal haplotype: ${trimmed}.`,
    });
  }

  const entry = findLongestPrefix(trimmed, MT_ROUTES);
  if (!entry) return fallbackMtRoute(trimmed, 'mtDNA');
  const path =
    entry.path[entry.path.length - 1] === trimmed
      ? entry.path
      : [...entry.path.filter((s) => s !== trimmed), trimmed];
  return buildRoute(trimmed, 'mtDNA', entry, { terminalPath: path });
};

const maternalBasesMatch = (mtDna: string, mitotree: string): boolean => {
  const mtBase = mtDna.trim();
  const mitoBase = normalizeMitotreeKey(mitotree);
  return mtBase === mitoBase || mtBase.startsWith(mitoBase) || mitoBase.startsWith(mtBase);
};

/** One maternal card: mtDNA and Mitotree describe the same line (Mitotree adds terminal SNPs). */
const collectMaternalRoute = (
  mtDnaHaplogroup?: string,
  mitotree?: string
): HaplogroupRouteInfo | HaplogroupRouteInfo[] | null => {
  const mtTrim = mtDnaHaplogroup?.trim() || '';
  const mitoTrim = mitotree?.trim() || '';

  if (!mtTrim && !mitoTrim) return null;

  if (mtTrim && mitoTrim) {
    if (!maternalBasesMatch(mtTrim, mitoTrim)) {
      const mt = lookupHaplogroupRoute(mtTrim, 'mtDNA');
      const mito = lookupHaplogroupRoute(mitoTrim, 'Mitotree');
      return [mt, mito].filter((r): r is HaplogroupRouteInfo => r !== null);
    }

    const mitoBase = normalizeMitotreeKey(mitoTrim);
    const lookupKey = mtTrim.length >= mitoBase.length ? mtTrim : mitoBase;
    const route = lookupHaplogroupRoute(lookupKey, 'mtDNA');
    if (!route) return lookupHaplogroupRoute(mitoTrim, 'Mitotree');

    const showMitotree = mitoTrim !== mtTrim;
    return {
      ...route,
      line: 'mtDNA',
      haplogroup: mtTrim,
      mitotreeTerminal: showMitotree ? mitoTrim : undefined,
      description: showMitotree
        ? `${route.description} Mitotree terminal: ${mitoTrim}.`
        : route.description,
      path:
        showMitotree && !route.path.includes(mitoTrim)
          ? [...route.path.filter((node) => node !== mitoTrim), mitoTrim]
          : route.path,
    };
  }

  if (mtTrim) return lookupHaplogroupRoute(mtTrim, 'mtDNA');

  const mitoOnly = lookupHaplogroupRoute(mitoTrim, 'Mitotree');
  return mitoOnly ? { ...mitoOnly, line: 'mtDNA', haplogroup: normalizeMitotreeKey(mitoTrim) } : null;
};

export const collectHaplogroupRoutes = (test: {
  yHaplogroup?: string;
  mtDnaHaplogroup?: string;
  mitotree?: string;
}): HaplogroupRouteInfo[] => {
  const routes: HaplogroupRouteInfo[] = [];
  const y = lookupHaplogroupRoute(test.yHaplogroup, 'Y-DNA');
  if (y) routes.push(y);

  const maternal = collectMaternalRoute(test.mtDnaHaplogroup, test.mitotree);
  if (Array.isArray(maternal)) routes.push(...maternal);
  else if (maternal) routes.push(maternal);

  return routes;
};

export interface UnresolvedHaplogroup {
  line: HaplogroupLine;
  haplogroup: string;
}

const maternalRouteResolved = (
  mtDnaHaplogroup?: string,
  mitotree?: string
): boolean => {
  const maternal = collectMaternalRoute(mtDnaHaplogroup, mitotree);
  if (!maternal) return false;
  return Array.isArray(maternal) ? maternal.length > 0 : true;
};

/** Haplogroup values entered on the test but with no migration card in the reference dataset. */
export const collectUnresolvedHaplogroups = (test: {
  yHaplogroup?: string;
  mtDnaHaplogroup?: string;
  mitotree?: string;
}): UnresolvedHaplogroup[] => {
  const unresolved: UnresolvedHaplogroup[] = [];
  const y = test.yHaplogroup?.trim();
  if (y && !lookupHaplogroupRoute(y, 'Y-DNA')) {
    unresolved.push({ line: 'Y-DNA', haplogroup: y });
  }

  const mt = test.mtDnaHaplogroup?.trim();
  const mito = test.mitotree?.trim();
  if (mt || mito) {
    if (!maternalRouteResolved(mt, mito)) {
      if (mt) unresolved.push({ line: 'mtDNA', haplogroup: mt });
      if (mito && (!mt || !maternalBasesMatch(mt, mito))) {
        unresolved.push({ line: 'Mitotree', haplogroup: mito });
      }
    }
  }

  return unresolved;
};

export const analyzeHaplogroupCoverage = (test: {
  yHaplogroup?: string;
  mtDnaHaplogroup?: string;
  mitotree?: string;
}) => ({
  routes: collectHaplogroupRoutes(test),
  unresolved: collectUnresolvedHaplogroups(test),
});
