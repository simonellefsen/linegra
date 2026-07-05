import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export const resolvePublicTreeIdClient = async (segment: string): Promise<string | null> => {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.rpc('resolve_public_tree_id', { segment });
  if (error) throw new Error(error.message);
  return typeof data === 'string' ? data : null;
};

export const resolvePublicPersonIdClient = async (
  treeId: string,
  idPrefix: string
): Promise<string | null> => {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.rpc('resolve_public_person_id', {
    target_tree_id: treeId,
    id_prefix: idPrefix,
  });
  if (error) throw new Error(error.message);
  return typeof data === 'string' ? data : null;
};
