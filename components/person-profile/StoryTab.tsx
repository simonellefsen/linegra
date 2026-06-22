import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, Pencil, Check, X } from 'lucide-react';
import { Person, Relationship, BookLanguage, PersonBiography, BookGenerationOptions } from '../../types';
import { listBiographiesForPerson, upsertPersonBiography } from '../../services/books';
import { composePersonBiography } from '../../services/ai';
import { buildChapterFacts, buildRelationshipMaps, personBiographySignature, groundingSummary } from '../../lib/bookComposer';
import { BOOK_LANGUAGES, DEFAULT_BOOK_LANGUAGE } from '../../lib/bookI18n';

interface StoryTabProps {
  person: Person;
  /** Relationships + connected people loaded by PersonProfile (for building biography facts). */
  relationships: Relationship[];
  connectedPeople: Person[];
  canEdit: boolean;
  actor: { id?: string | null; name?: string | null };
}

// A bio is "out of date" when the person was edited after the bio was written. The authoritative
// staleness check (a content signature) runs when a book is composed; on the profile we use this
// cheaper hint so the reader knows a refresh is available.
const isStale = (bio: PersonBiography, person: Person): boolean =>
  !!bio.updatedAt && !!person.updatedAt && new Date(person.updatedAt) > new Date(bio.updatedAt);

const PLACEHOLDER = 'Ancestral biography text has not yet been transcribed into the digital archive.';

const StoryTab: React.FC<StoryTabProps> = ({ person, relationships, connectedPeople, canEdit, actor }) => {
  const [bios, setBios] = useState<Record<string, PersonBiography>>({});
  const [language, setLanguage] = useState<BookLanguage>(DEFAULT_BOOK_LANGUAGE);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditing(false);
    setDraft('');
    listBiographiesForPerson(person.id)
      .then((rows) => {
        if (cancelled) return;
        const byLang: Record<string, PersonBiography> = {};
        rows.forEach((b) => { byLang[b.language] = b; });
        setBios(byLang);
        // Prefer a language that actually has a story.
        if (rows.length && !rows.some((b) => b.language === DEFAULT_BOOK_LANGUAGE)) {
          setLanguage(rows[0].language);
        }
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load story.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [person.id]);

  const facts = useMemo(() => {
    const people = [person, ...connectedPeople.filter((p) => p.id !== person.id)];
    return buildChapterFacts(person, people, buildRelationshipMaps(relationships));
  }, [person, connectedPeople, relationships]);

  // Declared before the callbacks below so the closures can read them (and list them in deps).
  const current = bios[language];
  const fallbackBio = person.bio;

  const handleGenerate = useCallback(async () => {
    if (!canEdit) return;
    // Per decisions/ai-narrative-editing-and-grounding.md: never silently overwrite a human-edited
    // (curated) biography — make AI rewrite an explicit "replace draft" action.
    if (current?.isManual) {
      const ok = window.confirm(
        'This biography has been curated by hand. Generating will replace it with an AI draft. Continue?'
      );
      if (!ok) return;
    }
    setGenerating(true);
    setError(null);
    const options: BookGenerationOptions = { scope: 'all', style: 'narrative', length: 'medium', language };
    try {
      const narrative = await composePersonBiography(person, facts, options);
      const signature = personBiographySignature(person, facts, options);
      await upsertPersonBiography({
        personId: person.id,
        language,
        narrative,
        signature,
        style: options.style,
        length: options.length,
        actor,
      });
      setBios((prev) => ({
        ...prev,
        [language]: { personId: person.id, language, narrative, signature, isManual: false, updatedAt: new Date().toISOString() },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the story.');
    } finally {
      setGenerating(false);
    }
  }, [canEdit, person, facts, language, actor, current]);

  const startEdit = useCallback(() => {
    setDraft(current?.narrative || fallbackBio || '');
    setError(null);
    setEditing(true);
  }, [current, fallbackBio]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft('');
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      // A manual edit is no longer fact-anchored, so clear the signature; is_manual=true makes the
      // book composer reuse it verbatim instead of regenerating (shouldReuseBiography).
      await upsertPersonBiography({
        personId: person.id,
        language,
        narrative: draft,
        signature: '',
        isManual: true,
        actor,
      });
      setBios((prev) => ({
        ...prev,
        [language]: {
          personId: person.id,
          language,
          narrative: draft,
          signature: '',
          isManual: true,
          updatedAt: new Date().toISOString(),
        },
      }));
      setEditing(false);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the story.');
    } finally {
      setSaving(false);
    }
  }, [canEdit, person.id, language, draft, actor]);

  const stale = current ? isStale(current, person) : false;
  const availableLangs = BOOK_LANGUAGES.filter((l) => bios[l.value] || l.value === language);
  const hasStory = !!current?.narrative || !!fallbackBio;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Narrative Archive</p>
          {hasStory && current?.narrative && (
            <span
              className={`text-[8px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full ${
                current.isManual ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
              }`}
              title={current.isManual ? 'Curated by a human editor' : 'AI-generated draft'}
            >
              {current.isManual ? 'Curated' : 'AI draft'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!editing && availableLangs.length > 1 && (
            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {availableLangs.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLanguage(l.value)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition ${
                    language === l.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title={l.native}
                >
                  {l.value}
                </button>
              ))}
            </div>
          )}
          {!editing && canEdit && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {current ? 'AI Rewrite' : 'AI Generate'}
            </button>
          )}
          {!editing && canEdit && (
            <button
              onClick={startEdit}
              className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 hover:text-slate-800"
            >
              <Pencil className="w-3.5 h-3.5" />
              {hasStory ? 'Edit' : 'Write'}
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}

      {!editing && stale && (
        <p className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" />
          This story predates recent changes to the profile{canEdit ? ' — edit it or use AI Rewrite to refresh it.' : '.'}
        </p>
      )}

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          autoFocus
          placeholder="Write the biography…"
          className="w-full min-h-[320px] resize-y rounded-[40px] border border-slate-200 bg-white p-8 font-serif text-lg leading-relaxed text-slate-800 shadow-sm outline-none focus:border-slate-400 disabled:opacity-60"
        />
      ) : (
        <div className="prose prose-slate prose-lg max-w-none text-slate-700 leading-relaxed font-serif whitespace-pre-wrap first-letter:text-6xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:text-slate-900 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
          {loading
            ? 'Loading story…'
            : current?.narrative
              || fallbackBio
              || PLACEHOLDER}
        </div>
      )}

      {/* Evidence basis for AI-drafted stories, so documented fact is distinguishable from
          narrative interpolation (decisions/ai-narrative-editing-and-grounding.md, M11). Curated
          (human-edited) bios are owned by the curator, so they don't carry this footer. */}
      {!editing && current?.narrative && !current?.isManual && groundingSummary(facts) ? (
        <p className="px-8 pb-2 text-[11px] italic text-slate-400">{groundingSummary(facts)}</p>
      ) : null}
    </div>
  );
};

export default StoryTab;
