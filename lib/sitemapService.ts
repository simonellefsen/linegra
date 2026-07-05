// Roadmap U3 — load public sitemap entries and map to canonical URLs.

import {
  buildPersonUrl,
  buildPublicBookUrl,
  buildTreeUrl,
  buildTreesDirectoryUrl,
  getPublicSiteOrigin,
} from './publicRoutes';
import { listPublicTreesDirectory } from './publicRouteResolve';
import { createServerSupabase } from './supabaseServer';
import type { SitemapUrlEntry } from './sitemapXml';
import { buildTreeSitemapChunkPath, extractId8, shouldUseSitemapIndex } from './sitemapXml';

type CoreRow = {
  kind: string;
  tree_id: string | null;
  book_id: string | null;
  updated_at: string | null;
};

type PersonRow = {
  person_id: string;
  updated_at: string | null;
};

type TreeCountRow = {
  tree_id: string;
  person_count: number;
  updated_at: string | null;
};

export interface SitemapBuildResult {
  mode: 'flat' | 'index';
  flatEntries?: SitemapUrlEntry[];
  indexEntries?: SitemapUrlEntry[];
  treeCounts: Array<{ treeId: string; personCount: number; updatedAt: string | null }>;
}

const mapCoreRows = (
  rows: CoreRow[],
  slugByTreeId: Map<string, string | null>,
  origin: string
): SitemapUrlEntry[] => {
  const entries: SitemapUrlEntry[] = [
    { loc: origin },
    { loc: buildTreesDirectoryUrl(origin) },
  ];
  for (const row of rows) {
    if (row.kind === 'tree' && row.tree_id) {
      entries.push({
        loc: buildTreeUrl({ id: row.tree_id, slug: slugByTreeId.get(row.tree_id) ?? null }, origin),
        lastmod: row.updated_at,
      });
    }
    if (row.kind === 'book' && row.book_id) {
      entries.push({
        loc: buildPublicBookUrl(row.book_id, origin),
        lastmod: row.updated_at,
      });
    }
  }
  return entries;
};

export const loadSitemapTreeCounts = async (): Promise<
  Array<{ treeId: string; personCount: number; updatedAt: string | null }>
> => {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('list_public_sitemap_tree_counts');
  if (error) throw new Error(error.message);
  return ((data ?? []) as TreeCountRow[]).map((row) => ({
    treeId: String(row.tree_id),
    personCount: Number(row.person_count ?? 0),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  }));
};

export const buildSitemap = async (originInput?: string): Promise<SitemapBuildResult> => {
  const origin = getPublicSiteOrigin(originInput);
  const supabase = createServerSupabase();
  const [directory, treeCounts, coreResult] = await Promise.all([
    listPublicTreesDirectory(),
    loadSitemapTreeCounts(),
    supabase.rpc('list_public_sitemap_core_entries'),
  ]);
  if (coreResult.error) throw new Error(coreResult.error.message);

  const slugByTreeId = new Map(directory.map((tree) => [tree.treeId, tree.slug]));
  const coreEntries = mapCoreRows((coreResult.data ?? []) as CoreRow[], slugByTreeId, origin);

  if (!shouldUseSitemapIndex(treeCounts, coreEntries.length)) {
    const { data, error } = await supabase.rpc('list_public_sitemap_entries', { entry_limit: 50000 });
    if (error) throw new Error(error.message);
    const flatEntries: SitemapUrlEntry[] = [
      { loc: origin },
      { loc: buildTreesDirectoryUrl(origin) },
    ];
    for (const row of (data ?? []) as Array<CoreRow & { person_id?: string | null }>) {
      if (row.kind === 'tree' && row.tree_id) {
        flatEntries.push({
          loc: buildTreeUrl({ id: row.tree_id, slug: slugByTreeId.get(row.tree_id) ?? null }, origin),
          lastmod: row.updated_at,
        });
      }
      if (row.kind === 'person' && row.tree_id && row.person_id) {
        flatEntries.push({
          loc: buildPersonUrl(
            { id: row.tree_id, slug: slugByTreeId.get(row.tree_id) ?? null },
            row.person_id,
            origin
          ),
          lastmod: row.updated_at,
        });
      }
      if (row.kind === 'book' && row.book_id) {
        flatEntries.push({
          loc: buildPublicBookUrl(row.book_id, origin),
          lastmod: row.updated_at,
        });
      }
    }
    return { mode: 'flat', flatEntries, treeCounts };
  }

  const indexEntries: SitemapUrlEntry[] = [
    { loc: `${origin}/sitemap-core.xml`, lastmod: new Date().toISOString() },
    ...treeCounts
      .filter((tree) => tree.personCount > 0)
      .map((tree) => ({
        loc: `${origin}${buildTreeSitemapChunkPath(tree.treeId)}`,
        lastmod: tree.updatedAt,
      })),
  ];

  return { mode: 'index', indexEntries, treeCounts };
};

export const buildSitemapCoreChunk = async (originInput?: string): Promise<SitemapUrlEntry[]> => {
  const origin = getPublicSiteOrigin(originInput);
  const supabase = createServerSupabase();
  const [directory, coreResult] = await Promise.all([
    listPublicTreesDirectory(),
    supabase.rpc('list_public_sitemap_core_entries'),
  ]);
  if (coreResult.error) throw new Error(coreResult.error.message);
  const slugByTreeId = new Map(directory.map((tree) => [tree.treeId, tree.slug]));
  return mapCoreRows((coreResult.data ?? []) as CoreRow[], slugByTreeId, origin);
};

export const buildSitemapTreeChunk = async (
  treeId8: string,
  originInput?: string
): Promise<SitemapUrlEntry[] | null> => {
  const origin = getPublicSiteOrigin(originInput);
  const supabase = createServerSupabase();
  const { data: treeId, error: resolveError } = await supabase.rpc('resolve_public_tree_id', {
    segment: treeId8,
  });
  if (resolveError) throw new Error(resolveError.message);
  if (typeof treeId !== 'string' || !treeId) return null;

  const [directory, personsResult] = await Promise.all([
    listPublicTreesDirectory(),
    supabase.rpc('list_public_sitemap_persons_for_tree', { target_tree_id: treeId }),
  ]);
  if (personsResult.error) throw new Error(personsResult.error.message);

  const slug = directory.find((tree) => tree.treeId === treeId)?.slug ?? null;
  return ((personsResult.data ?? []) as PersonRow[]).map((row) => ({
    loc: buildPersonUrl({ id: treeId, slug }, row.person_id, origin),
    lastmod: row.updated_at,
  }));
};

export const parseSitemapChunkName = (chunk: string): { kind: 'core' } | { kind: 'tree'; id8: string } | null => {
  if (chunk === 'core') return { kind: 'core' };
  const treeMatch = chunk.match(/^tree-([0-9a-f]{8})$/i);
  if (treeMatch?.[1]) return { kind: 'tree', id8: treeMatch[1].toLowerCase() };
  return null;
};

export const treeChunkName = (treeId: string): string => `tree-${extractId8(treeId)}`;
