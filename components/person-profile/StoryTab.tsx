import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { Person, Relationship, BookLanguage, PersonBiography, BookGenerationOptions } from '../../types';
import { listBiographiesForPerson, upsertPersonBiography } from '../../services/books';
import { composePersonBiography } from '../../services/ai';
import { buildChapterFacts, buildRelationshipMaps, personBiographySignature } from '../../lib/bookComposer';
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

const StoryTab: React.FC<StoryTabProps> = ({ person, relationships, connectedPeople, canEdit, actor }) => {
  const [bios, setBios] = useState<Record<string, PersonBiography>>({});
  const [language, setLanguage] = useState<BookLanguage>(DEFAULT_BOOK_LANGUAGE);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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

  const handleGenerate = useCallback(async () => {
    if (!canEdit) return;
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
  }, [canEdit, person, facts, language, actor]);

  const current = bios[language];
  const fallbackBio = person.bio;
  const stale = current ? isStale(current, person) : false;
  const availableLangs = BOOK_LANGUAGES.filter((l) => bios[l.value] || l.value === language);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Narrative Archive</p>
        <div className="flex items-center gap-2">
          {availableLangs.length > 1 && (
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
          {canEdit && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {current ? 'AI Rewrite' : 'AI Generate'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}

      {stale && (
        <p className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" />
          This story predates recent changes to the profile{canEdit ? ' — use AI Rewrite to refresh it.' : '.'}
        </p>
      )}

      <div className="prose prose-slate prose-lg max-w-none text-slate-700 leading-relaxed font-serif whitespace-pre-wrap first-letter:text-6xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:text-slate-900 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        {loading
          ? 'Loading story…'
          : current?.narrative
            || fallbackBio
            || 'Ancestral biography text has not yet been transcribed into the digital archive.'}
      </div>
    </div>
  );
};

export default StoryTab;
