// Server-side resolution for slug/id8 public routes (U16).

import { isPublicUuid, parseBookIdPrefix } from './publicSlugs';
import { createServerSupabase } from './supabaseServer';

export const resolvePublicTreeId = async (segment: string): Promise<string | null> => {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('resolve_public_tree_id', { segment });
  if (error) throw new Error(error.message);
  return typeof data === 'string' ? data : null;
};

export const resolvePublicPersonId = async (
  treeId: string,
  idPrefix: string
): Promise<string | null> => {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('resolve_public_person_id', {
    target_tree_id: treeId,
    id_prefix: idPrefix,
  });
  if (error) throw new Error(error.message);
  return typeof data === 'string' ? data : null;
};

export const resolvePublicBookId = async (segment: string): Promise<string | null> => {
  if (isPublicUuid(segment)) return segment;
  const idPrefix = parseBookIdPrefix(segment);
  if (!idPrefix) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('resolve_public_book_id', { id_prefix: idPrefix });
  if (error) throw new Error(error.message);
  return typeof data === 'string' ? data : null;
};

export interface PublicTreeDirectoryEntry {
  treeId: string;
  name: string;
  slug: string | null;
  description: string | null;
  personCount: number;
  updatedAt: string | null;
}

export const listPublicTreesDirectory = async (): Promise<PublicTreeDirectoryEntry[]> => {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('list_public_trees_directory');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    treeId: String(row.tree_id),
    name: String(row.tree_name ?? 'Family tree'),
    slug: typeof row.tree_slug === 'string' ? row.tree_slug : null,
    description: typeof row.description === 'string' ? row.description : null,
    personCount: Number(row.person_count ?? 0),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  }));
};
