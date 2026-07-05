import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mapDbCollaborator } from '../../lib/archiveDbMappers';
import { TreeCollaborator } from '../../types';

export const listTreeCollaborators = async (treeId: string): Promise<TreeCollaborator[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('list_tree_collaborators', { target_tree_id: treeId });
  if (error) throw new Error(error.message);
  return (data || []).map(mapDbCollaborator);
};

export const inviteTreeCollaborator = async (
  treeId: string,
  email: string,
  role: 'editor' = 'editor'
): Promise<TreeCollaborator> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const { data, error } = await supabase.rpc('invite_tree_collaborator', {
    target_tree_id: treeId,
    payload_email: email,
    payload_role: role,
  });
  if (error) throw new Error(error.message);
  return mapDbCollaborator(data);
};

export const updateTreeCollaborator = async (
  collaboratorId: string,
  payload: { role?: 'editor'; status?: 'invited' | 'active' | 'revoked' }
): Promise<TreeCollaborator> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const { data, error } = await supabase.rpc('update_tree_collaborator', {
    target_collaborator_id: collaboratorId,
    payload_role: payload.role ?? null,
    payload_status: payload.status ?? null,
  });
  if (error) throw new Error(error.message);
  return mapDbCollaborator(data);
};

export const removeTreeCollaborator = async (collaboratorId: string): Promise<void> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const { error } = await supabase.rpc('remove_tree_collaborator', {
    target_collaborator_id: collaboratorId,
  });
  if (error) throw new Error(error.message);
};
