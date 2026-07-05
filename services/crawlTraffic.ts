import { isPublicUuid } from '../lib/publicSlugs';
import { mapCrawlCoverageStats, type CrawlCoverageStats } from '../lib/crawlCoverage';
import {
  collectCrawlTrafficResourceRefs,
  resolveCrawlTrafficResourceLabels,
  type CrawlTrafficHitRef,
  type CrawlTrafficResourceLabel,
} from '../lib/crawlTrafficResourceLabels';
import { mapCrawlTrafficStats, type CrawlTrafficStats } from '../lib/crawlTrafficStats';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type { CrawlTrafficStats } from '../lib/crawlTrafficStats';
export type { CrawlTrafficResourceLabel } from '../lib/crawlTrafficResourceLabels';
export type { CrawlCoverageStats } from '../lib/crawlCoverage';

export interface FetchAdminCrawlTrafficOptions {
  days?: number;
  agentFilter?: string | null;
  excludeViewerUserId?: string | null;
}

export interface AdminCrawlTrafficResult {
  stats: CrawlTrafficStats;
  resourceLabels: Record<string, CrawlTrafficResourceLabel>;
  coverage: CrawlCoverageStats;
}

const chunkIds = (ids: string[], size = 100): string[][] => {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
};

const loadPersonRows = async (personIds: string[]) => {
  const rows: Array<{
    id: string;
    tree_id: string;
    first_name: string | null;
    last_name: string | null;
    birth_date_text: string | null;
  }> = [];
  for (const batch of chunkIds(personIds)) {
    const { data, error } = await supabase
      .from('persons')
      .select('id, tree_id, first_name, last_name, birth_date_text')
      .in('id', batch);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
};

const loadTreeRows = async (treeIds: string[]) => {
  const rows: Array<{ id: string; name: string | null; slug: string | null }> = [];
  for (const batch of chunkIds(treeIds)) {
    const { data, error } = await supabase
      .from('family_trees')
      .select('id, name, slug')
      .in('id', batch);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
};

const loadBookRows = async (bookIds: string[]) => {
  const rows: Array<{ id: string; title: string | null; slug: string | null }> = [];
  for (const batch of chunkIds(bookIds)) {
    const { data, error } = await supabase
      .from('family_books')
      .select('id, title, slug')
      .in('id', batch);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
};

const loadFamilyRows = async (familyIds: string[]) => {
  const rows: Array<{
    id: string;
    tree_id: string;
    person_id: string;
    related_id: string;
    type: string;
  }> = [];
  for (const batch of chunkIds(familyIds)) {
    const { data, error } = await supabase
      .from('relationships')
      .select('id, tree_id, person_id, related_id, type')
      .in('id', batch)
      .in('type', ['marriage', 'partner']);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
};

const resolveResourceLabels = async (
  refs: CrawlTrafficHitRef[],
  origin?: string
): Promise<Record<string, CrawlTrafficResourceLabel>> => {
  const personIds = new Set<string>();
  const treeIds = new Set<string>();
  const bookIds = new Set<string>();
  const familyIds = new Set<string>();

  refs.forEach((ref) => {
    const id = ref.resourceId?.trim();
    if (!id || !isPublicUuid(id)) return;
    if (ref.route === 'person') personIds.add(id);
    else if (ref.route === 'tree') treeIds.add(id);
    else if (ref.route === 'book') bookIds.add(id);
    else if (ref.route === 'family') familyIds.add(id);
  });

  const personRows = personIds.size ? await loadPersonRows([...personIds]) : [];
  personRows.forEach((row) => treeIds.add(row.tree_id));

  const familyRows = familyIds.size ? await loadFamilyRows([...familyIds]) : [];
  const familySpouseIds = new Set<string>();
  familyRows.forEach((row) => {
    treeIds.add(row.tree_id);
    familySpouseIds.add(row.person_id);
    familySpouseIds.add(row.related_id);
  });

  const [treeRows, bookRows, spouseRows] = await Promise.all([
    treeIds.size ? loadTreeRows([...treeIds]) : Promise.resolve([]),
    bookIds.size ? loadBookRows([...bookIds]) : Promise.resolve([]),
    familySpouseIds.size ? loadPersonRows([...familySpouseIds]) : Promise.resolve([]),
  ]);

  const spouseNameById = new Map(
    spouseRows.map((row) => [
      row.id,
      [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
    ])
  );

  const families = new Map(
    familyRows.map((row) => [
      row.id,
      {
        treeId: row.tree_id,
        spouseNames: [spouseNameById.get(row.person_id), spouseNameById.get(row.related_id)].filter(
          (name): name is string => !!name
        ),
      },
    ])
  );

  return resolveCrawlTrafficResourceLabels(refs, {
    origin,
    persons: new Map(
      personRows.map((row) => [
        row.id,
        {
          treeId: row.tree_id,
          firstName: row.first_name,
          lastName: row.last_name,
          birthDate: row.birth_date_text,
        },
      ])
    ),
    trees: new Map(
      treeRows.map((row) => [row.id, { name: row.name?.trim() || 'Family tree', slug: row.slug }])
    ),
    books: new Map(
      bookRows.map((row) => [row.id, { title: row.title?.trim() || 'Family book', slug: row.slug }])
    ),
    families,
  });
};

export const fetchAdminCrawlTrafficStats = async (
  days = 30,
  options: FetchAdminCrawlTrafficOptions = {}
): Promise<AdminCrawlTrafficResult> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_get_crawl_traffic_stats', {
    payload_days: days,
    payload_agent_filter: options.agentFilter ?? null,
    payload_exclude_viewer_user_id: options.excludeViewerUserId ?? null,
  });
  if (error) throw new Error(error.message);

  const coveragePromise = supabase.rpc('admin_get_crawl_coverage_stats', {
    payload_days: days,
    payload_agent_filter: options.agentFilter ?? null,
  });

  const stats = mapCrawlTrafficStats(data);
  const refs = collectCrawlTrafficResourceRefs(stats);
  const [resourceLabels, coverageResult] = await Promise.all([
    refs.length
      ? resolveResourceLabels(refs, typeof window !== 'undefined' ? window.location.origin : undefined)
      : Promise.resolve({} as Record<string, CrawlTrafficResourceLabel>),
    coveragePromise,
  ]);

  if (coverageResult.error) throw new Error(coverageResult.error.message);

  return {
    stats,
    resourceLabels,
    coverage: mapCrawlCoverageStats(coverageResult.data),
  };
};
