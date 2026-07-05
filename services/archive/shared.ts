import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export const ARCHIVE_PAGE_SIZE = 1000;

export const randomId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ImportActor {
  id?: string | null;
  name?: string | null;
}

export const normalizeActor = (actor?: ImportActor | null) => {
  if (!actor) {
    return { id: null, name: 'System' };
  }
  const safeId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  return {
    id: safeId,
    name: actor.name ?? 'System',
  };
};

export const parseRpcJsonPage = (data: unknown): any[] => {
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const fetchArchiveRpcPages = async (
  rpcName: 'load_tree_archive_persons_page' | 'load_tree_archive_relationships_page',
  treeId: string,
  pageSize = ARCHIVE_PAGE_SIZE
): Promise<any[]> => {
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.rpc(rpcName, {
      target_tree_id: treeId,
      page_limit: pageSize,
      page_offset: offset,
    });
    if (error) throw new Error(error.message);
    const chunk = parseRpcJsonPage(data);
    if (!chunk.length) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
};

export const chunkedInsert = async <T>(table: string, rows: T[], chunkSize = 500) => {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(slice as any);
    if (error) throw new Error(error.message);
  }
};

export const recordAuditLogs = async (
  entries: Array<{
    tree_id: string;
    actor_id: string | null;
    actor_name: string;
    action: string;
    entity_type: string;
    entity_id: string;
    details?: Record<string, unknown>;
  }>
) => {
  if (!entries.length || !isSupabaseConfigured()) return;
  await chunkedInsert('audit_logs', entries);
};
