
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from './lib/supabase';
import { ensureTrees, loadArchiveData, importGedcomToSupabase, createFamilyTree, listFamilyTreesWithCounts, deleteFamilyTreeRecord, nukeSupabaseDatabase, persistFamilyLayout, fetchFamilyLayoutAudits } from './services/archive';
import { Person, User, TreeLayoutType, FamilyTree as FamilyTreeType, Relationship, FamilyTreeSummary, FamilyLayoutState, FamilyLayoutAudit } from './types';
import FamilyTree from './components/FamilyTree';
import PersonProfile from './components/PersonProfile';
import AuthModal from './components/AuthModal';
import ImportExport from './components/ImportExport';
import TreeLandingPage from './components/TreeLandingPage';
import AdminTreesPanel from './components/AdminTreesPanel';
import { 
  GitBranch, 
  Search, 
  ChevronDown, 
  Home, 
  Database,
  User as UserIcon,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const App: React.FC = () => {
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'tree' | 'records' | 'settings' | 'profile'>('home');
  const [layoutType] = useState<TreeLayoutType>('pedigree');
  const [searchQuery, setSearchQuery] = useState('');
  
  const supabaseActive = isSupabaseConfigured();

  // Tree State
  const [trees, setTrees] = useState<FamilyTreeType[]>([]);
  const [activeTree, setActiveTree] = useState<FamilyTreeType | null>(null);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [allRelationships, setAllRelationships] = useState<Relationship[]>([]);

  const [showTreeSelector, setShowTreeSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);
  const [adminSection, setAdminSection] = useState<'database' | 'trees' | 'gedcom'>('gedcom');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [adminTrees, setAdminTrees] = useState<FamilyTreeSummary[]>([]);
  const [adminTreesLoading, setAdminTreesLoading] = useState(false);
  const [creatingTree, setCreatingTree] = useState(false);
  const [deletingTreeId, setDeletingTreeId] = useState<string | null>(null);
  const [showNukeModal, setShowNukeModal] = useState(false);
  const [nukeConfirmText, setNukeConfirmText] = useState('');
  const [nukeInProgress, setNukeInProgress] = useState(false);
  const [nukeError, setNukeError] = useState<string | null>(null);
  const [nukeSuccess, setNukeSuccess] = useState(false);
  const [layoutAudits, setLayoutAudits] = useState<FamilyLayoutAudit[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const activeTreeId = activeTree?.id ?? null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('LINEGRA_SUPERADMIN');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as User;
        setCurrentUser(parsed);
      } catch (err) {
        console.error('Failed to parse stored admin session', err);
        window.localStorage.removeItem('LINEGRA_SUPERADMIN');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentUser) {
      window.localStorage.setItem('LINEGRA_SUPERADMIN', JSON.stringify(currentUser));
    } else {
      window.localStorage.removeItem('LINEGRA_SUPERADMIN');
    }
  }, [currentUser]);

  useEffect(() => {
    if (!supabaseActive) {
      setTrees([]);
      setActiveTree(null);
      setAllPeople([]);
      setAllRelationships([]);
      setConfigError('Supabase credentials are missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in your .env.local before running Linegra.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const dbTrees = await ensureTrees();
        setTrees(dbTrees);
        if (dbTrees.length) {
          const selected = dbTrees[0];
          setActiveTree(selected);
          const archive = await loadArchiveData(selected.id);
          setAllPeople(archive.people);
          setAllRelationships(archive.relationships);
        } else {
          setActiveTree(null);
          setAllPeople([]);
          setAllRelationships([]);
        }
        setConfigError(null);
      } catch (err) {
        console.error('Failed to load archive data', err);
        const message = err instanceof Error ? err.message : 'Failed to load data from Supabase.';
        setConfigError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabaseActive]);

  const fetchAdminTreeStats = useCallback(async () => {
    if (!supabaseActive || !currentUser?.isAdmin) {
      setAdminTrees([]);
      return;
    }
    setAdminTreesLoading(true);
    try {
      const stats = await listFamilyTreesWithCounts();
      setAdminTrees(stats);
    } catch (err) {
      console.error('Failed to load tree summaries', err);
    } finally {
      setAdminTreesLoading(false);
    }
  }, [supabaseActive, currentUser?.isAdmin]);

  useEffect(() => {
    fetchAdminTreeStats();
  }, [fetchAdminTreeStats]);

  useEffect(() => {
    if (!supabaseActive || !currentUser?.isAdmin || !activeTreeId) {
      setLayoutAudits([]);
      return;
    }
    fetchFamilyLayoutAudits(activeTreeId, 5, auditOffset)
      .then(({ audits, total }) => {
        if (auditOffset === 0) {
          setLayoutAudits(audits);
        } else {
          setLayoutAudits((prev) => [...prev, ...audits]);
        }
        setAuditTotal(total);
      })
      .catch((err) => console.error('Failed to fetch layout audits', err));
  }, [supabaseActive, currentUser?.isAdmin, activeTreeId, auditOffset]);

  const hasMoreAudits = layoutAudits.length < auditTotal;
  const treePeople = useMemo(() => {
    if (!activeTreeId) return [];
    return allPeople.filter((p) => p.treeId === activeTreeId);
  }, [allPeople, activeTreeId]);

  const handlePersistFamilyLayout = useCallback(async (personId: string, layout: FamilyLayoutState) => {
    try {
      const targetPerson = treePeople.find(p => p.id === personId);
      if (!targetPerson) return;
      const updatedMetadata = await persistFamilyLayout(
        personId,
        targetPerson.treeId,
        layout,
        currentUser,
        targetPerson.metadata
      );
      setAllPeople((prev) => prev.map((person) => person.id === personId ? { ...person, metadata: updatedMetadata } : person));
    } catch (err) {
      console.error('Failed to persist family layout', err);
    }
  }, [treePeople, currentUser]);

  const treeRelationships = useMemo(() => {
    if (!activeTreeId) return [];
    return allRelationships.filter((r) => r.treeId === activeTreeId);
  }, [allRelationships, activeTreeId]);

  const filteredPeople = useMemo(() => {
    return treePeople;
  }, [treePeople]);

  const filteredRelationships = useMemo(() => {
    const visibleIds = new Set(filteredPeople.map(p => p.id));
    return treeRelationships.filter(rel => visibleIds.has(rel.personId) && visibleIds.has(rel.relatedId));
  }, [treeRelationships, filteredPeople]);

  const localTreeSummaries = useMemo<FamilyTreeSummary[]>(() => {
    return trees.map((tree) => {
      const personCount = allPeople.filter((p) => p.treeId === tree.id).length;
      const relationshipCount = allRelationships.filter((rel) => rel.treeId === tree.id).length;
      return {
        ...tree,
        personCount,
        relationshipCount
      };
    });
  }, [trees, allPeople, allRelationships]);

  const adminTreeData = adminTrees.length ? adminTrees : localTreeSummaries;

  const handlePersonSelect = (person: Person | null) => {
    setSelectedPerson(person);
    setPendingPersonId(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (person) {
        url.searchParams.set('person', person.id);
      } else {
        url.searchParams.delete('person');
      }
      window.history.replaceState({}, '', url);
    }
  };

  const handleAdminLogin = (username: string) => {
    const adminUser: User = {
      id: `admin-${username}`,
      name: username,
      email: `${username}@linegra.super`,
      isLoggedIn: true,
      isAdmin: true,
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=0f172a&color=fff`
    };
    setCurrentUser(adminUser);
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('LINEGRA_SUPERADMIN');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const personId = url.searchParams.get('person');
    if (personId) {
      setPendingPersonId(personId);
    }
  }, []);

  useEffect(() => {
    if (!pendingPersonId) return;
    const match = treePeople.find((p) => p.id === pendingPersonId);
    if (match) {
      setSelectedPerson(match);
      setPendingPersonId(null);
    }
  }, [pendingPersonId, treePeople]);

  const handleAdminCreateTree = useCallback(
    async (payload: { name: string; description?: string; ownerName?: string; ownerEmail?: string }) => {
      if (!supabaseActive) throw new Error('Link Supabase before creating trees.');
      setCreatingTree(true);
      try {
        const created = await createFamilyTree(payload, currentUser);
        const updatedTrees = await ensureTrees();
        setTrees(updatedTrees);
        const nextActive = updatedTrees.find((t) => t.id === created.id) || created;
        setActiveTree(nextActive);
        const archive = await loadArchiveData(nextActive.id);
        setAllPeople(archive.people);
        setAllRelationships(archive.relationships);
        await fetchAdminTreeStats();
      } catch (err) {
        console.error('Failed to create tree', err);
        throw err;
      } finally {
        setCreatingTree(false);
      }
    },
    [supabaseActive, currentUser, fetchAdminTreeStats]
  );

  const handleAdminDeleteTree = useCallback(
    async (treeId: string) => {
      if (!supabaseActive) throw new Error('Link Supabase before deleting trees.');
      setDeletingTreeId(treeId);
      try {
        await deleteFamilyTreeRecord(treeId, currentUser);
        const updatedTrees = await ensureTrees();
        if (!updatedTrees.length) {
          setTrees([]);
          setActiveTree(null);
          setAllPeople([]);
          setAllRelationships([]);
          await fetchAdminTreeStats();
          return;
        }
        setTrees(updatedTrees);
        let nextActive = activeTree ? updatedTrees.find((t) => t.id === activeTree.id) : updatedTrees[0];
        if (!nextActive) {
          nextActive = updatedTrees[0];
          setActiveTree(nextActive);
          const archive = await loadArchiveData(nextActive.id);
          setAllPeople(archive.people);
          setAllRelationships(archive.relationships);
        } else {
          setActiveTree(nextActive);
        }
        await fetchAdminTreeStats();
      } catch (err) {
        console.error('Failed to delete tree', err);
        throw err;
      } finally {
        setDeletingTreeId(null);
      }
    },
    [supabaseActive, currentUser, activeTree, fetchAdminTreeStats]
  );

  const handleNukeConfirm = useCallback(async () => {
    if (!supabaseActive) {
      setNukeError('Link a Supabase project before issuing a reset.');
      return;
    }
    if (nukeConfirmText !== 'NUKE') {
      setNukeError('Type "NUKE" to confirm.');
      return;
    }
    setNukeInProgress(true);
    setNukeError(null);
    try {
      await nukeSupabaseDatabase('NUKE');
      setShowNukeModal(false);
      setNukeConfirmText('');
      setNukeSuccess(true);
      setTrees([]);
      setActiveTree(null);
      setAllPeople([]);
      setAllRelationships([]);
      setLayoutAudits([]);
      setAuditOffset(0);
      setAuditTotal(0);
      await fetchAdminTreeStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset database.';
      setNukeError(message);
      setNukeSuccess(false);
    } finally {
      setNukeInProgress(false);
    }
  }, [supabaseActive, nukeConfirmText, fetchAdminTreeStats]);

  useEffect(() => {
    if (!showNukeModal) {
      setNukeConfirmText('');
      setNukeError(null);
    }
  }, [showNukeModal]);

  const selectTree = (tree: FamilyTreeType) => {
    setActiveTree(tree);
    setShowTreeSelector(false);
    setActiveTab('home');
    if (!supabaseActive) return;
      loadArchiveData(tree.id, searchQuery).then((archive) => {
        setAllPeople(archive.people);
        setAllRelationships(archive.relationships);
      }).catch((err) => {
        console.error('Failed to load tree data', err);
      });
  };

  const isRealTreeId = Boolean(supabaseActive && activeTreeId);

  useEffect(() => {
    if (!isRealTreeId || !activeTreeId) return;
    let cancelled = false;
    if (!searchQuery.trim()) {
      setIsSearching(false);
    } else {
      setIsSearching(true);
    }
    const timer = setTimeout(() => {
      loadArchiveData(activeTreeId, searchQuery)
        .then((archive) => {
          if (cancelled) return;
          setAllPeople(archive.people);
          setAllRelationships(archive.relationships);
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('Search failed', err);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearching(false);
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isRealTreeId, activeTreeId, searchQuery]);

  const handleImport = async (data: { people: Person[]; relationships: Relationship[] }) => {
    if (!supabaseActive || !activeTreeId) {
      console.error('Cannot import GEDCOM without an active Supabase-backed tree.');
      return;
    }
    try {
      await importGedcomToSupabase(activeTreeId, data, currentUser);
      const archive = await loadArchiveData(activeTreeId);
      setAllPeople(archive.people);
      setAllRelationships(archive.relationships);
      await fetchAdminTreeStats();
      setActiveTab('tree');
    } catch (err) {
      console.error('Failed to import GEDCOM to Supabase', err);
    }
  };

  if (!supabaseActive) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-center p-10 space-y-6">
        <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-900 text-white flex items-center justify-center shadow-2xl">
          <GitBranch className="w-8 h-8" />
        </div>
        <div className="space-y-3 max-w-xl">
          <h1 className="text-3xl font-serif font-bold text-slate-900">Supabase Configuration Required</h1>
          <p className="text-slate-600">
            Linegra no longer ships with mock archives. Add <code className="px-1 bg-slate-100 rounded">SUPABASE_URL</code> and <code className="px-1 bg-slate-100 rounded">SUPABASE_ANON_KEY</code>
            to your <code className="px-1 bg-slate-100 rounded">.env.local</code> (or Vercel project settings) and restart the app.
          </p>
          <p className="text-sm text-slate-500">
            See <code className="px-1 bg-slate-100 rounded">docs/SUPABASE_SETUP.md</code> for CLI linking and migration instructions.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-6">
          <Loader2 className="w-16 h-16 text-slate-900 animate-spin mx-auto opacity-20" />
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Accessing Central Archive</p>
        </div>
      </div>
    );
  }

  const primaryNavItems: Array<{ id: 'home' | 'tree' | 'records'; icon: LucideIcon; label: string; adminOnly?: boolean }> = [
    { id: 'home', icon: Home, label: 'Portal Home' },
    { id: 'tree', icon: GitBranch, label: 'Interactive Tree' },
    { id: 'records', icon: Database, label: 'Administrator', adminOnly: true }
  ];

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <nav className="w-20 lg:w-72 bg-white border-r border-slate-200 flex flex-col h-full shrink-0 transition-all duration-500 shadow-[20px_0_60px_rgba(0,0,0,0.02)]">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-slate-900 rounded-[20px] flex items-center justify-center text-white shadow-2xl shrink-0 group hover:rotate-12 transition-transform">
              <GitBranch className="w-7 h-7" />
            </div>
            <h1 className="hidden lg:block text-3xl font-serif font-bold tracking-tight">Linegra</h1>
          </div>

          <div className="relative mb-8">
            <button 
              onClick={() => setShowTreeSelector(!showTreeSelector)}
              className="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-[24px] hover:bg-slate-100 transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                <span className="hidden lg:block font-black text-[10px] uppercase tracking-widest truncate text-slate-700">
                  {activeTree?.name ?? 'No Tree Selected'}
                </span>
              </div>
              <ChevronDown className={`hidden lg:block w-4 h-4 text-slate-400 transition-transform duration-300 ${showTreeSelector ? 'rotate-180' : ''}`} />
            </button>
            
            {showTreeSelector && (
              <div className="absolute top-full left-0 w-full mt-3 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 py-3 animate-in fade-in slide-in-from-top-4 duration-300">
                {trees.length === 0 && (
                  <div className="px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-400 text-center">
                    No trees available
                  </div>
                )}
                {trees.map((t) => (
                  <button key={t.id} onClick={() => selectTree(t)} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                    <div className={`w-2.5 h-2.5 rounded-full ${t.id === activeTree?.id ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-200'}`}></div>
                    <span className="text-sm font-bold text-slate-700">{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 px-5 space-y-2">
          {primaryNavItems
            .filter(item => !item.adminOnly || currentUser?.isAdmin)
            .map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-5 px-6 py-4 rounded-[22px] transition-all duration-300 ${
                  activeTab === item.id ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20 translate-x-2' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <item.icon className="w-6 h-6 shrink-0" />
                <span className="hidden lg:block font-bold text-[13px] tracking-wide">{item.label}</span>
              </button>
            ))}
        </div>

        <div className="p-6 border-t border-slate-100 mt-auto">
           {currentUser && (
             <button onClick={() => setActiveTab('profile')} className="w-full flex items-center gap-5 px-6 py-4 rounded-[22px] text-slate-500 hover:bg-slate-100 transition-all">
               <UserIcon className="w-6 h-6 shrink-0" />
               <span className="hidden lg:block font-bold text-[13px] tracking-wide">Researcher Profile</span>
             </button>
           )}
        </div>
      </nav>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden relative">
        <header className="h-24 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl flex items-center justify-between px-10 sticky top-0 z-40">
          <div className="flex items-center gap-6 flex-1 max-w-2xl">
            <div className="relative w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
              <input 
                type="text" 
                placeholder={`Query the ${activeTree?.name ?? 'Linegra Archive'}...`} 
                className="w-full pl-12 pr-6 py-3.5 bg-slate-100/50 border-transparent rounded-[20px] outline-none text-[13px] font-medium transition-all focus:bg-white focus:ring-4 focus:ring-slate-900/5"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {isSearching && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-6 relative">
            {currentUser ? (
              <div className="flex items-center gap-4 relative">
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="flex items-center gap-3 focus:outline-none"
                >
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-black text-slate-900 leading-none">{currentUser.name}</p>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1.5">{currentUser.isAdmin ? 'Super Administrator' : 'Researcher'}</p>
                  </div>
                  <img src={currentUser.avatarUrl} className="w-12 h-12 rounded-full border-4 border-white shadow-xl cursor-pointer" alt="Avatar" />
                </button>
                {showUserMenu && (
                  <div className="absolute top-full right-0 mt-4 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-50">
                    <button
                      onClick={() => {
                        handleLogout();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 rounded-2xl transition-all"
                    >
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setShowAuthModal(true)} className="bg-slate-900 text-white px-8 py-3 rounded-[18px] font-black text-[12px] uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all hover:-translate-y-0.5 active:translate-y-0">
                Login
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 p-10 overflow-y-auto no-scrollbar scroll-smooth">
            {configError && (
              <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 mt-0.5" />
                <div className="text-left">
                  <p className="text-sm font-semibold">{configError}</p>
                  <p className="text-xs mt-1 text-amber-700">Review docs/SUPABASE_SETUP.md to verify environment variables and migrations.</p>
                </div>
              </div>
            )}
            {activeTab === 'home' && (
              activeTree ? (
                <TreeLandingPage
                  tree={activeTree}
                  people={treePeople}
                  onPersonSelect={handlePersonSelect}
                  isAdmin={currentUser?.isAdmin || false}
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-[32px] p-12 text-center space-y-4 shadow-sm">
                  <h2 className="text-3xl font-serif font-bold text-slate-900">No Family Trees Yet</h2>
                  <p className="text-slate-500 max-w-2xl mx-auto">
                    Create your first archive from the Administrator → Trees panel to begin importing GEDCOM data and visualizing your kinship map.
                  </p>
                  {currentUser?.isAdmin ? (
                    <button
                      onClick={() => setActiveTab('records')}
                      className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.3em]"
                    >
                      Open Administrator
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400 uppercase tracking-[0.3em]">
                      Ask an administrator to provision a tree.
                    </p>
                  )}
                </div>
              )
            )}
            {activeTab === 'tree' && (
              activeTree ? (
                <div className="space-y-10 animate-in fade-in duration-700">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-3xl font-serif font-bold text-slate-900">Kinship Map</h2>
                  </div>
                  <FamilyTree
                    people={filteredPeople}
                    relationships={filteredRelationships}
                    onPersonSelect={handlePersonSelect}
                    layout={layoutType}
                  />
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-[32px] p-12 text-center space-y-4 shadow-sm">
                  <h2 className="text-3xl font-serif font-bold text-slate-900">No Active Tree Selected</h2>
                  <p className="text-slate-500">
                    Choose or create a family tree from the sidebar before opening the kinship map.
                  </p>
                </div>
              )
            )}
            {activeTab === 'records' && currentUser?.isAdmin && (
              <div className="space-y-8 max-w-6xl mx-auto py-6">
                <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-4 flex items-center gap-3">
                  {(['database','trees','gedcom'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setAdminSection(tab)}
                      className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em] ${
                        adminSection === tab ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {tab === 'database' && 'Database'}
                      {tab === 'trees' && 'Trees'}
                      {tab === 'gedcom' && 'GEDCOM'}
                    </button>
                  ))}
                </div>
                {adminSection === 'database' && (
                  <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 text-slate-600 space-y-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Database Panel</p>
                        <h3 className="text-2xl font-serif font-bold text-slate-900 mb-2">Reset & Maintenance</h3>
                        <p className="text-sm text-slate-500 max-w-2xl">
                          Wipe every person, relationship, media record, and audit trail stored in Supabase. This is intended for
                          staging environments when you need to re-import large GEDCOM datasets from scratch. Production archives
                          should never run this action during active research sessions.
                        </p>
                      </div>
                      <div className="border border-rose-100 bg-rose-50/70 rounded-[28px] p-6 flex flex-col gap-4">
                        <div className="flex items-center gap-3 text-rose-600">
                          <AlertTriangle className="w-6 h-6" />
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.3em]">Destructive Operation</p>
                            <h4 className="text-lg font-serif font-bold text-slate-900">Nuke Supabase Database</h4>
                          </div>
                        </div>
                        <p className="text-sm text-rose-700">
                          This permanently removes all family trees, GEDCOM imports, media, notes, sources, audit logs, and places. A fresh
                          seed tree will need to be created afterward. The action cannot be undone.
                        </p>
                        <div className="flex flex-wrap gap-4">
                          <button
                            onClick={() => setShowNukeModal(true)}
                            className="px-6 py-3 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-[0.3em] hover:bg-rose-700 transition-all disabled:opacity-60"
                            disabled={!supabaseActive}
                          >
                            {supabaseActive ? 'Launch Nuke' : 'Link Supabase First'}
                          </button>
                          {nukeSuccess && (
                            <span className="text-emerald-600 text-xs font-bold uppercase tracking-[0.3em]">Database Reset</span>
                          )}
                        </div>
                      </div>
                    </div>

                        {supabaseActive && Array.isArray(layoutAudits) && layoutAudits.length > 0 && (
                      <div className="border border-slate-100 rounded-[28px] p-6 space-y-4 bg-slate-50/70">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Family Layout History</p>
                            <h4 className="text-lg font-serif font-bold text-slate-900">Recent Kinship Edits</h4>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {layoutAudits.map((audit) => {
                            const assignmentCount = Object.keys(audit.layout.assignments ?? {}).length;
                            const manualGroups = Object.values(audit.layout.manualOrders ?? {}) as string[][];
                            const manualCount = manualGroups.reduce((total, group) => total + group.length, 0);
                            return (
                              <div key={audit.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-bold text-slate-800">{audit.actorName}</p>
                                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                                    {new Date(audit.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500">
                                  {assignmentCount} child links, {manualCount} manual placements
                                </p>
                              </div>
                            );
                          })}
                        </div>
                        {hasMoreAudits && (
                          <button
                            onClick={() => setAuditOffset((prev) => prev + 5)}
                            className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 hover:underline"
                          >
                            View More
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {adminSection === 'trees' && (
                  <AdminTreesPanel
                    trees={adminTreeData}
                    onCreate={handleAdminCreateTree}
                    onDelete={handleAdminDeleteTree}
                    creating={creatingTree}
                    deletingTreeId={deletingTreeId}
                    loading={adminTreesLoading}
                  />
                )}
                {adminSection === 'gedcom' && (
                  <ImportExport 
                    people={treePeople} 
                    relationships={treeRelationships} 
                    onImport={handleImport} 
                    activeTreeName={activeTree?.name}
                    showGedcomSection
                  />
                )}
              </div>
            )}
          </div>

          {selectedPerson && (
            <PersonProfile 
              person={selectedPerson} 
              relationships={treeRelationships}
              currentUser={currentUser}
              allPeople={treePeople}
              onClose={() => handlePersonSelect(null)} 
              onNavigateToPerson={(next) => handlePersonSelect(next)}
              onPersistFamilyLayout={handlePersistFamilyLayout}
            />
          )}
        </div>
      </main>
      {showNukeModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl max-w-lg w-full p-8 space-y-6">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em]">Confirm Database Reset</p>
                <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">Type "NUKE" to proceed</h3>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              This action truncates every record in Supabase and cannot be undone. Only run this on staging projects when you
              need a clean slate for GEDCOM ingestion tests. Production archives should take a backup first.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Confirmation Text</label>
              <input
                value={nukeConfirmText}
                onChange={(e) => setNukeConfirmText(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900/5 outline-none uppercase tracking-[0.3em]"
                placeholder="NUKE"
                disabled={nukeInProgress}
              />
            </div>
            {nukeError && <p className="text-rose-600 text-xs font-bold">{nukeError}</p>}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowNukeModal(false)}
                className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 text-sm font-bold uppercase tracking-widest hover:bg-slate-100 transition-all"
                disabled={nukeInProgress}
              >
                Cancel
              </button>
              <button
                onClick={handleNukeConfirm}
                className="flex-1 px-6 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black uppercase tracking-[0.3em] hover:bg-rose-700 transition-all disabled:opacity-60"
                disabled={nukeInProgress}
              >
                {nukeInProgress ? 'Purging…' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLogin={handleAdminLogin} />
    </div>
  );
};

export default App;
