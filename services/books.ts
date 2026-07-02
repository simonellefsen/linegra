// AI Family Books: orchestration (plan → AI narratives) + Supabase persistence.
//
// Kept separate from the 92k `services/archive.ts` for navigability. The pure planning lives in
// `lib/bookComposer.ts`; the AI composition (with deterministic fallbacks) in `services/ai.ts`.
// This module wires them together, reports per-chapter progress, and reads/writes `family_books`
// via the security-definer RPCs + PostgREST (RLS-gated).

import { Person, BookChapter, BookGenerationOptions, BookStatistics, BookStatus, BookLanguage, FamilyBook, PersonBiography } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { BookPlan, personBiographySignature, shouldReuseBiography } from '../lib/bookComposer';
import { DEFAULT_BOOK_LANGUAGE } from '../lib/bookI18n';
import { composeFamilyOverview, composePersonBiography, deterministicFamilyOverview } from './ai';

// The local super-admin's id is a synthetic string (e.g. "admin-admin"), not a UUID. The RPC's
// `payload_actor_id uuid` rejects non-UUID values, so mirror `normalizeActor` in services/archive.ts:
// pass the id only when it is a real UUID, otherwise null. (audit_logs.actor_id is text and still
// records the name.)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeActorId = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);

export interface ComposeBookInput {
  plan: BookPlan;
  tree: { name?: string } | null | undefined;
  people: Person[];
  options: BookGenerationOptions;
  treeId: string;
  actor: { id?: string | null; name?: string | null };
  /** Re-run every person chapter even if its stored biography is still current. */
  forceRegenerate?: boolean;
}

/** What a compose run reused vs (re)generated — surfaced so the UI can show the AI saving. */
export interface ComposeBookResult {
  chapters: BookChapter[];
  reusedCount: number;
  generatedCount: number;
}

/**
 * Strip residual markdown the model occasionally ignores instructions not to emit
 * (bold `**`, ATX headings `#`, and leading list markers) so the book renders as plain prose.
 */
const cleanNarrative = (text: string): string =>
  text
    .replace(/^\s*#{1,6}\s+/gm, '') // ATX headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/__(.+?)__/g, '$1') // bold (underscore form)
    .replace(/^\s*[-*+]\s+/gm, '') // leading bullet markers
    .trim();

/** Preserves input order while bounding how many AI calls run at once. */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

/**
 * Fill each chapter's `narrative`: the overview via `composeFamilyOverview`, person chapters via
 * `composePersonBiography` (which folds in historical context). Concurrency-capped (3) so a large
 * book generates reasonably fast without hammering OpenRouter; progress is reported per chapter as
 * it completes. A failure on any single chapter degrades to its deterministic text, never aborting
 * the whole book.
 */
export const composeBook = async (
  input: ComposeBookInput,
  onProgress?: (done: number, total: number) => void
): Promise<ComposeBookResult> => {
  const { plan, tree, people, options, treeId, actor, forceRegenerate } = input;
  const peopleById = new Map<string, Person>(people.map((p) => [p.id, p]));
  const total = plan.chapters.length;
  let done = 0;
  let reusedCount = 0;
  let generatedCount = 0;

  // Forward tree + actor attribution to the AI composers so each call is metered to this tree
  // (roadmap N). `options` itself is unchanged for everything else (signatures, persistence).
  const genOptions: BookGenerationOptions = {
    ...options,
    treeId,
    actorId: actor?.id ?? undefined,
  };

  // Pull the stored biographies once so unchanged people can be reused without an AI call.
  let storedByPerson = new Map<string, PersonBiography>();
  try {
    const stored = await listPersonBiographies(treeId, options.language);
    storedByPerson = new Map(stored.map((b) => [b.personId, b]));
  } catch (error) {
    console.error('Could not load stored biographies (will regenerate all):', error);
  }

  const chapters = await mapWithConcurrency(plan.chapters, 3, async (chapter): Promise<BookChapter> => {
    if (chapter.kind === 'overview') {
      // Family-level chapter — depends on the whole tree, so always (re)composed; cheap (1 chapter).
      let narrative: string;
      try {
        narrative = await composeFamilyOverview(tree, plan.statistics, genOptions);
      } catch (error) {
        console.error('Family overview chapter failed:', error);
        narrative = deterministicFamilyOverview(tree, plan.statistics, options.language);
      }
      done += 1;
      onProgress?.(done, total);
      return { ...chapter, narrative: cleanNarrative(narrative) };
    }

    const person = chapter.personId ? peopleById.get(chapter.personId) : undefined;
    if (!person) {
      done += 1;
      onProgress?.(done, total);
      return { ...chapter, narrative: `Records for ${chapter.title} are unavailable in this archive.` };
    }

    const facts = chapter.facts ?? {};
    const signature = personBiographySignature(person, facts, options);
    const stored = storedByPerson.get(person.id);

    // Reuse the stored biography when it's still valid: a manual (human-edited) biography is
    // always reused and never auto-regenerated (see wiki/decisions/ai-narrative-editing-and-grounding.md);
    // an AI biography is reused when its signature still matches the current facts.
    if (stored && shouldReuseBiography(stored, signature, forceRegenerate)) {
      reusedCount += 1;
      done += 1;
      onProgress?.(done, total);
      return { ...chapter, narrative: cleanNarrative(stored.narrative) };
    }

    // Otherwise (re)generate this one chapter and persist it back to the person's Story.
    let narrative: string;
    try {
      narrative = await composePersonBiography(person, facts, genOptions);
    } catch (error) {
      console.error(`Biography failed for ${chapter.title}:`, error);
      narrative = `${chapter.title}: biography could not be generated.`;
    }
    const cleaned = cleanNarrative(narrative);
    generatedCount += 1;
    try {
      await upsertPersonBiography({
        personId: person.id,
        language: options.language,
        narrative: cleaned,
        signature,
        style: options.style,
        length: options.length,
        actor,
      });
    } catch (error) {
      console.error(`Could not persist biography for ${chapter.title}:`, error);
    }
    done += 1;
    onProgress?.(done, total);
    return { ...chapter, narrative: cleaned };
  });

  return { chapters, reusedCount, generatedCount };
};

const mapBookRow = (row: Record<string, unknown>): FamilyBook => ({
  id: String(row.id),
  treeId: String(row.tree_id),
  title: String(row.title ?? 'Untitled book'),
  subtitle: (row.subtitle as string | null) ?? null,
  status: row.status === 'complete' ? 'complete' : 'draft',
  isPublic: Boolean(row.is_public),
  options: (row.options as BookGenerationOptions) ?? { scope: 'all', style: 'narrative', length: 'medium', language: DEFAULT_BOOK_LANGUAGE },
  chapters: Array.isArray(row.chapters) ? (row.chapters as BookChapter[]) : [],
  statistics: (row.statistics as BookStatistics) ?? { personCount: 0, topSurnames: [], topPlaces: [], topOccupations: [] },
  createdById: (row.created_by_id as string | null) ?? null,
  createdByName: (row.created_by_name as string | null) ?? null,
  createdAt: String(row.created_at ?? new Date().toISOString()),
  updatedAt: String(row.updated_at ?? new Date().toISOString()),
});

export interface SaveFamilyBookInput {
  bookId?: string | null;
  treeId: string;
  title: string;
  subtitle?: string | null;
  status: BookStatus;
  options: BookGenerationOptions;
  chapters: BookChapter[];
  statistics: BookStatistics;
  isPublic?: boolean;
  actor: { id?: string | null; name?: string | null };
}

/** Insert or update a family book; returns the persisted book id. */
export const saveFamilyBook = async (input: SaveFamilyBookInput): Promise<string> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_upsert_family_book', {
    target_tree_id: input.treeId,
    payload_book_id: input.bookId ?? null,
    payload_title: input.title,
    payload_subtitle: input.subtitle ?? null,
    payload_status: input.status,
    payload_is_public: input.isPublic ?? false,
    payload_options: input.options,
    payload_chapters: input.chapters,
    payload_statistics: input.statistics,
    payload_actor_id: safeActorId(input.actor.id),
    payload_actor_name: input.actor.name ?? 'System',
  });
  if (error) {
    throw new Error(error.message);
  }
  if (typeof data === 'string' && data) return data;
  if (Array.isArray(data) && typeof data[0] === 'string') return data[0] as string;
  throw new Error('Family book was not saved: unexpected response.');
};

export const listFamilyBooks = async (treeId: string): Promise<FamilyBook[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('family_books')
    .select('*')
    .eq('tree_id', treeId)
    .order('updated_at', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data as Record<string, unknown>[]) || []).map(mapBookRow);
};

export const getFamilyBook = async (bookId: string): Promise<FamilyBook | null> => {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('family_books')
    .select('*')
    .eq('id', bookId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data ? mapBookRow(data as Record<string, unknown>) : null;
};

export const deleteFamilyBook = async (
  bookId: string,
  actor: { id?: string | null; name?: string | null }
): Promise<void> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { error } = await supabase.rpc('admin_delete_family_book', {
    target_book_id: bookId,
    payload_actor_id: safeActorId(actor.id),
    payload_actor_name: actor.name ?? 'System',
  });
  if (error) {
    throw new Error(error.message);
  }
};

// ---- Per-person biographies (the store the book is compiled from) --------------------------------

const mapBiographyRow = (row: Record<string, unknown>): PersonBiography => ({
  personId: String(row.person_id),
  language: (row.language as BookLanguage) || 'da',
  narrative: typeof row.narrative === 'string' ? row.narrative : '',
  signature: typeof row.signature === 'string' ? row.signature : '',
  style: (row.style as string | null) ?? null,
  length: (row.length as string | null) ?? null,
  isManual: Boolean(row.is_manual),
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
});

/** All stored biographies for a tree (optionally one language) — used to reuse unchanged chapters. */
export const listPersonBiographies = async (
  treeId: string,
  language?: BookLanguage
): Promise<PersonBiography[]> => {
  if (!isSupabaseConfigured()) return [];
  let query = supabase.from('person_biographies').select('*').eq('tree_id', treeId);
  if (language) query = query.eq('language', language);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) || []).map(mapBiographyRow);
};

/** Every stored biography for one person (all languages) — for the profile Story tab. */
export const listBiographiesForPerson = async (personId: string): Promise<PersonBiography[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('person_biographies')
    .select('*')
    .eq('person_id', personId);
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) || []).map(mapBiographyRow);
};

/** One person's stored biography in a language (for the profile Story tab). */
export const getPersonBiography = async (
  personId: string,
  language: BookLanguage
): Promise<PersonBiography | null> => {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('person_biographies')
    .select('*')
    .eq('person_id', personId)
    .eq('language', language)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBiographyRow(data as Record<string, unknown>) : null;
};

export interface UpsertPersonBiographyInput {
  personId: string;
  language: BookLanguage;
  narrative: string;
  signature: string;
  style?: string | null;
  length?: string | null;
  isManual?: boolean;
  actor: { id?: string | null; name?: string | null };
}

/** Insert/update a person's biography for a language (keyed by person + language). */
export const upsertPersonBiography = async (input: UpsertPersonBiographyInput): Promise<string> => {
  if (!isSupabaseConfigured()) throw new Error('Supabase credentials are missing.');
  const { data, error } = await supabase.rpc('admin_upsert_person_biography', {
    target_person_id: input.personId,
    payload_language: input.language,
    payload_narrative: input.narrative,
    payload_signature: input.signature,
    payload_style: input.style ?? null,
    payload_length: input.length ?? null,
    payload_is_manual: input.isManual ?? false,
    payload_actor_id: safeActorId(input.actor.id),
    payload_actor_name: input.actor.name ?? 'System',
  });
  if (error) throw new Error(error.message);
  if (typeof data === 'string' && data) return data;
  if (Array.isArray(data) && typeof data[0] === 'string') return data[0] as string;
  throw new Error('Biography was not saved: unexpected response.');
};
