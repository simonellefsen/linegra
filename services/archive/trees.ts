import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mapDbTree } from '../../lib/archiveDbMappers';
import { normalizeActor, type ImportActor } from './shared';
import { FamilyTree as FamilyTreeType, FamilyTreeSummary, TreeAccessRole } from '../../types';

export const ensureTrees = async (): Promise<FamilyTreeType[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  }
  const { data, error } = await supabase.rpc('admin_list_trees_with_counts');
  if (error) throw new Error(error.message);
  if (!data?.length) {
    return [];
  }
  return data.map((row: any) => mapDbTree(row));
};

export const fetchTreeStatistics = async (treeId: string): Promise<SupabaseTreeStatistics> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('tree_statistics', { target_tree_id: treeId });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error('Statistics not available for this tree.');
  }
  const parsed = data as SupabaseTreeStatistics;
  if (!Array.isArray(parsed.centuryStats)) {
    parsed.centuryStats = [];
  }
  return parsed;
};

export const createFamilyTree = async (
  payload: { name: string; description?: string; ownerName?: string; ownerEmail?: string },
  actor?: ImportActor | null
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Cannot create tree.');
  }
  const metadata: Record<string, string> = {};
  if (payload.ownerName) metadata.owner_name = payload.ownerName;
  if (payload.ownerEmail) metadata.owner_email = payload.ownerEmail;
  const normalizedActor = normalizeActor(actor);
  const { data, error } = await supabase.rpc('admin_create_tree', {
    payload_name: payload.name,
    payload_description: payload.description || null,
    payload_metadata: metadata,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name,
  });
  if (error) throw new Error(error.message);
  return mapDbTree(data);
};

export const listFamilyTreesWithCounts = async (): Promise<FamilyTreeSummary[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_list_trees_with_counts');
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    ...mapDbTree(row),
    personCount: Number(row.person_count || 0),
    relationshipCount: Number(row.relationship_count || 0),
    myRole: (row.my_role as TreeAccessRole | 'owner' | null) ?? null,
  }));
};

export const deleteFamilyTreeRecord = async (treeId: string, actor?: ImportActor | null) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Cannot delete tree.');
  }
  const normalizedActor = normalizeActor(actor);
  const { error } = await supabase.rpc('admin_delete_tree', {
    target_tree_id: treeId,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name,
  });
  if (error) throw new Error(error.message);
};

export const updateTreeSettings = async (
  treeId: string,
  payload: {
    name?: string;
    isPublic?: boolean;
    probandId?: string | null;
    probandLabel?: string | null;
    description?: string;
    ownerName?: string;
    ownerEmail?: string;
  },
  actor?: ImportActor | null
): Promise<FamilyTreeType> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Cannot update tree.');
  }
  const normalizedActor = normalizeActor(actor);
  const { data, error } = await supabase.rpc('admin_update_tree_settings', {
    target_tree_id: treeId,
    payload_is_public: typeof payload.isPublic === 'boolean' ? payload.isPublic : null,
    payload_proband_id: payload.probandId ?? null,
    payload_proband_label: payload.probandLabel ?? null,
    payload_description: payload.description !== undefined ? payload.description : null,
    payload_owner_name: payload.ownerName !== undefined ? payload.ownerName : null,
    payload_owner_email: payload.ownerEmail !== undefined ? payload.ownerEmail : null,
    payload_name: payload.name !== undefined ? payload.name : null,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name,
  });
  if (error) throw new Error(error.message);
  return mapDbTree(data);
};

export const nukeSupabaseDatabase = async (confirmText = 'NUKE') => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const { error } = await supabase.rpc('admin_nuke_database', {
    confirm_text: confirmText,
  });
  if (error) throw new Error(error.message);
};

export interface SupabaseTreeStatistics {
  totalIndividuals: number;
  maleCount: number;
  femaleCount: number;
  unknownGenderCount: number;
  livingCount: number;
  deceasedCount: number;
  marriages: number;
  averageLifespan: number | null;
  averageAgeOver16: number | null;
  oldestPerson: {
    id: string;
    treeId: string;
    firstName: string;
    lastName: string;
    year?: number | null;
  } | null;
  mostChildren: {
    id: string;
    treeId: string;
    firstName: string;
    lastName: string;
    count?: number | null;
  } | null;
  mostMarriages: {
    id: string;
    treeId: string;
    firstName: string;
    lastName: string;
    count?: number | null;
  } | null;
  centuryStats: Array<{ label: string; startYear: number; people: number; averageAge: number | null }>;
}

export const claimTreeOwnership = async (treeId: string): Promise<FamilyTreeType> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const { data, error } = await supabase.rpc('admin_claim_tree_ownership', { target_tree_id: treeId });
  if (error) throw new Error(error.message);
  return mapDbTree(data);
};
