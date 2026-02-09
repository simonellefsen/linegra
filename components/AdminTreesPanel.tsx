import React, { useMemo, useState } from 'react';
import { FamilyTreeSummary, Person } from '../types';
import { Users, GitBranch, Trash2, Inbox, Loader2, Database, AlertTriangle, Settings, Eye, EyeOff } from 'lucide-react';

interface AdminTreesPanelProps {
  trees: FamilyTreeSummary[];
  onCreate: (payload: { name: string; description?: string; ownerName?: string; ownerEmail?: string }) => Promise<void>;
  onDelete: (treeId: string) => Promise<void>;
  onUpdateSettings: (treeId: string, payload: { isPublic: boolean; probandId: string | null }) => Promise<void>;
  onSearchPersons?: (treeId: string, query: string) => Promise<Person[]>;
  creating?: boolean;
  deletingTreeId?: string | null;
  updatingTreeId?: string | null;
  loading?: boolean;
}

const AdminTreesPanel: React.FC<AdminTreesPanelProps> = ({
  trees,
  onCreate,
  onDelete,
  onUpdateSettings,
  onSearchPersons,
  creating = false,
  deletingTreeId = null,
  updatingTreeId = null,
  loading = false
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingTreeId, setEditingTreeId] = useState<string | null>(null);
  const [editVisibility, setEditVisibility] = useState(true);
  const [editProbandId, setEditProbandId] = useState<string | null>(null);
  const [editProbandLabel, setEditProbandLabel] = useState('');
  const [probandSearchTerm, setProbandSearchTerm] = useState('');
  const [probandResults, setProbandResults] = useState<Person[]>([]);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [searchingProband, setSearchingProband] = useState(false);

  const sortedTrees = useMemo(() => {
    return [...trees].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [trees]);

  const confirmTarget = sortedTrees.find((t) => t.id === pendingDeleteId);
  const disableDelete = sortedTrees.length <= 1;

  const extractYear = (value?: string | null) => {
    if (!value) return null;
    const match = value.match(/(\d{4})/);
    return match ? match[1] : null;
  };

  const formatProbandDisplay = (tree: FamilyTreeSummary) =>
    tree.defaultProbandLabel ||
    tree.metadata?.defaultProbandLabel ||
    tree.metadata?.defaultProbandName ||
    tree.defaultProbandId ||
    null;

  const formatCandidateLabel = (candidate: Person) => {
    const name = `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() || candidate.id;
    const birthYear = extractYear(candidate.birthDate);
    const deathYear = extractYear(candidate.deathDate);
    const vital =
      birthYear || deathYear
        ? ` (${birthYear ? `b. ${birthYear}` : ''}${birthYear && deathYear ? ' – ' : ''}${
            deathYear ? `d. ${deathYear}` : ''
          })`
        : '';
    return `${name}${vital}`;
  };

  const beginEditSettings = (tree: FamilyTreeSummary) => {
    setEditingTreeId(tree.id);
    setEditVisibility(tree.isPublic);
    const initialLabel = formatProbandDisplay(tree) || '';
    setEditProbandId(tree.defaultProbandId ?? null);
    setEditProbandLabel(initialLabel);
    setProbandSearchTerm('');
    setProbandResults([]);
    setSettingsError(null);
  };

  const handleCancelEdit = () => {
    setEditingTreeId(null);
    setSettingsError(null);
    setProbandResults([]);
  };

  const handleSearchProband = async (treeId: string) => {
    if (!onSearchPersons) return;
    const term = probandSearchTerm.trim();
    if (!term) {
      setProbandResults([]);
      return;
    }
    setSearchingProband(true);
    setSettingsError(null);
    try {
      const results = await onSearchPersons(treeId, term);
      setProbandResults(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to search individuals.';
      setSettingsError(message);
    } finally {
      setSearchingProband(false);
    }
  };

  const handleSelectProband = (candidate: Person) => {
    setEditProbandId(candidate.id);
    const label = formatCandidateLabel(candidate);
    setEditProbandLabel(label);
    setProbandResults([]);
  };

  const handleSaveSettings = async (treeId: string) => {
    setSettingsError(null);
    try {
      await onUpdateSettings(treeId, {
        isPublic: editVisibility,
        probandId: editProbandId,
        probandLabel: editProbandLabel || null,
      });
      handleCancelEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update tree settings.';
      setSettingsError(message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setStatusMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Tree name is required.');
      return;
    }
    if (trees.some((tree) => tree.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setFormError('A family tree with this name already exists.');
      return;
    }
    try {
      await onCreate({
        name: trimmedName,
        description: description.trim() || undefined,
        ownerName: ownerName.trim() || undefined,
        ownerEmail: ownerEmail.trim() || undefined
      });
      setStatusMessage('Tree created successfully.');
      setName('');
      setDescription('');
      setOwnerName('');
      setOwnerEmail('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create tree.';
      setFormError(message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await onDelete(pendingDeleteId);
      setPendingDeleteId(null);
    } catch (err) {
      console.error('Failed to delete tree', err);
      setFormError(err instanceof Error ? err.message : 'Failed to delete tree.');
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Administrator Panel</p>
            <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">Create New Family Tree</h3>
          </div>
          {statusMessage && (
            <span className="text-emerald-600 text-xs font-bold uppercase tracking-widest">{statusMessage}</span>
          )}
        </div>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tree Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/5 outline-none"
              placeholder="e.g. Linegra Heritage"
              disabled={creating}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Owner Name</label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/5 outline-none"
              placeholder="Lead Researcher"
              disabled={creating}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/5 outline-none min-h-[90px]"
              placeholder="Brief summary of the archive's focus"
              disabled={creating}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Owner Email</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/5 outline-none"
              placeholder="owner@example.com"
              disabled={creating}
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className={`px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                creating ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
              disabled={creating}
            >
              {creating ? 'Creating…' : 'Save Tree'}
            </button>
            {formError && <p className="text-rose-600 text-xs font-bold mt-3">{formError}</p>}
          </div>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Existing Trees</p>
            <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">Manage Lineage Archives</h3>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />}
        </div>

        {sortedTrees.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 text-slate-400 gap-3">
            <Inbox className="w-10 h-10" />
            <p className="text-sm font-semibold">No family trees found</p>
            <p className="text-xs text-slate-500 max-w-xs">
              Create your first archive above to begin importing GEDCOM data and building kinship maps.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedTrees.map((tree) => (
              <div
                key={tree.id}
                className="border border-slate-200 rounded-3xl p-6 flex flex-col gap-4 hover:shadow-lg transition-all bg-white/80"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Family Archive</p>
                    <h4 className="text-xl font-serif font-bold text-slate-900">{tree.name}</h4>
                    <p className="text-sm text-slate-500 mt-1">{tree.description || 'No description provided.'}</p>
                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.3em] mt-3">
                      Updated {tree.updatedAt ? new Date(tree.updatedAt).toLocaleDateString() : 'Recently'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => beginEditSettings(tree)}
                      className="px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <Settings className="w-4 h-4" />
                      Edit Settings
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(tree.id)}
                      className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 ${
                        disableDelete || deletingTreeId === tree.id
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                      }`}
                      disabled={disableDelete || deletingTreeId === tree.id}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 flex items-center gap-3">
                    <Users className="w-5 h-5 text-slate-500" />
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Individuals</p>
                      <p className="text-lg font-black text-slate-900">{tree.personCount}</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 flex items-center gap-3">
                    <GitBranch className="w-5 h-5 text-slate-500" />
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Family Links</p>
                      <p className="text-lg font-black text-slate-900">{tree.relationshipCount}</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 flex items-center gap-3">
                    {tree.isPublic ? <Eye className="w-5 h-5 text-slate-500" /> : <EyeOff className="w-5 h-5 text-slate-500" />}
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Visibility</p>
                      <p className="text-lg font-black text-slate-900">
                        {tree.isPublic ? 'Public' : 'Private'}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 flex items-center gap-3">
                    <Database className="w-5 h-5 text-slate-500" />
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Default Proband</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatProbandDisplay(tree) || 'Not selected'}
                      </p>
                    </div>
                  </div>
                </div>
                {editingTreeId === tree.id && (
                  <div className="border border-slate-200 rounded-2xl p-5 space-y-5 bg-slate-50/60">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-black uppercase tracking-[0.3em] text-slate-500">Tree Settings</h5>
                      <button
                        onClick={handleCancelEdit}
                        className="text-xs text-slate-500 hover:text-slate-700 font-bold"
                      >
                        Close
                      </button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Visibility</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditVisibility(true)}
                          className={`flex-1 px-4 py-2 rounded-2xl border text-xs font-black uppercase tracking-[0.2em] ${
                            editVisibility ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          Public
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditVisibility(false)}
                          className={`flex-1 px-4 py-2 rounded-2xl border text-xs font-black uppercase tracking-[0.2em] ${
                            !editVisibility ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          Private
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Default Proband</label>
                      <div className="text-sm text-slate-600">
                        {editProbandId ? (
                          <span>
                            Selected: <strong>{editProbandLabel || editProbandId}</strong>
                          </span>
                        ) : (
                          <span className="italic text-slate-400">No proband selected</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={probandSearchTerm}
                          onChange={(e) => setProbandSearchTerm(e.target.value)}
                          className="flex-1 px-4 py-2 rounded-2xl border border-slate-200 bg-white focus:ring-2 focus:ring-slate-900/10 outline-none text-sm"
                          placeholder="Search by name…"
                        />
                        <button
                          type="button"
                          onClick={() => handleSearchProband(tree.id)}
                          className="px-4 py-2 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-[0.2em]"
                          disabled={!onSearchPersons}
                        >
                          {searchingProband ? 'Searching…' : 'Search'}
                        </button>
                        {editProbandId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditProbandId(null);
                              setEditProbandLabel('');
                            }}
                            className="px-4 py-2 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-[0.2em]"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {probandResults.length > 0 && (
                        <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-white max-h-48 overflow-y-auto">
                          {probandResults.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => handleSelectProband(candidate)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
                            >
                              <p className="font-semibold text-slate-800">
                                {candidate.firstName} {candidate.lastName}
                              </p>
                              <p className="text-xs text-slate-500">
                                {candidate.birthDate ? `b. ${candidate.birthDate}` : 'Birth unknown'} • {candidate.id}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {settingsError && <p className="text-rose-500 text-xs font-bold">{settingsError}</p>}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleSaveSettings(tree.id)}
                        className={`px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em] ${
                          updatingTreeId === tree.id ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                        disabled={updatingTreeId === tree.id}
                      >
                        {updatingTreeId === tree.id ? 'Saving…' : 'Save Settings'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-6 py-2 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-[0.2em] text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl max-w-lg w-full p-8 space-y-6">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em]">Confirm Deletion</p>
                <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">{confirmTarget.name}</h3>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              This will permanently remove <span className="font-bold">{confirmTarget.personCount}</span> individuals and{' '}
              <span className="font-bold">{confirmTarget.relationshipCount}</span> family links from this archive. This action
              cannot be undone.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 text-sm font-bold uppercase tracking-widest hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-6 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black uppercase tracking-[0.2em] hover:bg-rose-700 transition-all disabled:opacity-60"
                disabled={deletingTreeId === confirmTarget.id}
              >
                {deletingTreeId === confirmTarget.id ? 'Deleting…' : 'Delete Tree'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTreesPanel;
