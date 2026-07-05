import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { FamilyLayoutAudit, FamilyLayoutState } from '../../types';
import { normalizeActor, recordAuditLogs, type ImportActor } from './shared';
import { syncUnionParentLinksFromLayout } from './familyLinks';

export const persistFamilyLayout = async (
  personId: string,
  treeId: string,
  layout: FamilyLayoutState,
  actor?: ImportActor | null,
  existingMetadata?: Record<string, unknown>
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const metadata = { ...(existingMetadata || {}), familyLayout: layout };
  await syncUnionParentLinksFromLayout({
    treeId,
    focusPersonId: personId,
    layout,
    actor,
  });
  const { data, error } = await supabase
    .from('persons')
    .update({ metadata })
    .eq('id', personId)
    .select('metadata')
    .single();
  if (error) throw new Error(error.message);

  const normalizedActor = normalizeActor(actor);
  await recordAuditLogs([
    {
      tree_id: treeId,
      actor_id: normalizedActor.id,
      actor_name: normalizedActor.name,
      action: 'family_layout_update',
      entity_type: 'person',
      entity_id: personId,
      details: { layout }
    }
  ]);

  return (data?.metadata as Record<string, unknown>) || metadata;
};


export const fetchFamilyLayoutAudits = async (treeId: string, limit = 10, offset = 0): Promise<{ audits: FamilyLayoutAudit[]; total: number }> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('id, tree_id, actor_id, actor_name, created_at, details')
      .eq('tree_id', treeId)
      .eq('action', 'family_layout_update')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tree_id', treeId)
      .eq('action', 'family_layout_update')
  ]);
  if (error) throw new Error(error.message);
  const audits = (data || []).map((row: any) => ({
    id: row.id,
    treeId: row.tree_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
    layout: (row.details?.layout || {}) as FamilyLayoutState
  }));
  return { audits, total: count || 0 };
};