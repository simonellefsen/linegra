
import React, { useState, useMemo, useEffect } from 'react';
import { isSupabaseConfigured } from './lib/supabase';
import { MOCK_PEOPLE, MOCK_RELATIONSHIPS, MOCK_TREES } from './mockData';
import { ensureTrees, loadArchiveData, importGedcomToSupabase } from './services/archive';
import { Person, User, TreeLayoutType, FamilyTree as FamilyTreeType, Relationship } from './types';
import FamilyTree from './components/FamilyTree';
import PersonProfile from './components/PersonProfile';
import AuthModal from './components/AuthModal';
import ImportExport from './components/ImportExport';
import TreeLandingPage from './components/TreeLandingPage';
import { 
  GitBranch, 
  Search, 
  ChevronDown, 
  Home, 
  Database,
  User as UserIcon,
  Loader2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const App: React.FC = () => {
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'tree' | 'records' | 'settings' | 'profile'>('home');
  const [layoutType] = useState<TreeLayoutType>('pedigree');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [supabaseActive] = useState(isSupabaseConfigured());

  // Tree State
  const [trees, setTrees] = useState<FamilyTreeType[]>(MOCK_TREES);
  const [activeTree, setActiveTree] = useState<FamilyTreeType>(MOCK_TREES[0]);
  const [allPeople, setAllPeople] = useState<Person[]>(MOCK_PEOPLE);
  const [allRelationships, setAllRelationships] = useState<Relationship[]>(MOCK_RELATIONSHIPS);

  const [showTreeSelector, setShowTreeSelector] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);

  useEffect(() => {
    const hydrateLocal = () => {
      setCurrentUser(null);
      setTrees(MOCK_TREES);
      setActiveTree(MOCK_TREES[0]);
      setAllPeople(MOCK_PEOPLE);
      setAllRelationships(MOCK_RELATIONSHIPS);
      setLoading(false);
    };

    if (!supabaseActive) {
      hydrateLocal();
      return;
    }

    (async () => {
      try {
        const dbTrees = await ensureTrees();
        setTrees(dbTrees);
        const selected = dbTrees[0];
        setActiveTree(selected);
        const archive = await loadArchiveData(selected.id);
        setAllPeople(archive.people.length ? archive.people : MOCK_PEOPLE);
        setAllRelationships(archive.relationships.length ? archive.relationships : MOCK_RELATIONSHIPS);
      } catch (err) {
        console.error('Failed to load archive data', err);
        hydrateLocal();
      } finally {
        setLoading(false);
      }
    })();
  }, [supabaseActive]);

  const treePeople = useMemo(() => {
    return allPeople.filter(p => p.treeId === activeTree.id || p.treeId === 'imported');
  }, [allPeople, activeTree.id]);

  const treeRelationships = useMemo(() => {
    return allRelationships.filter(r => r.treeId === activeTree.id || r.treeId === 'imported');
  }, [allRelationships, activeTree.id]);

  const filteredPeople = useMemo(() => {
    if (supabaseActive) {
      return treePeople;
    }
    return treePeople.filter(p => 
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [treePeople, searchQuery, supabaseActive]);

  const filteredRelationships = useMemo(() => {
    const visibleIds = new Set(filteredPeople.map(p => p.id));
    return treeRelationships.filter(rel => visibleIds.has(rel.personId) && visibleIds.has(rel.relatedId));
  }, [treeRelationships, filteredPeople]);

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

  const selectTree = (tree: FamilyTreeType) => {
    setActiveTree(tree);
    setShowTreeSelector(false);
    setActiveTab('home');
    if (isSupabaseConfigured()) {
      loadArchiveData(tree.id, searchQuery).then((archive) => {
        setAllPeople(archive.people);
        setAllRelationships(archive.relationships);
      }).catch((err) => {
        console.error('Failed to load tree data', err);
      });
    }
  };

  const isRealTreeId = supabaseActive && activeTree?.id && activeTree.id.includes('-');

  useEffect(() => {
    if (!isRealTreeId) return;
    let cancelled = false;
    if (!searchQuery.trim()) {
      setIsSearching(false);
    } else {
      setIsSearching(true);
    }
    const timer = setTimeout(() => {
      loadArchiveData(activeTree.id, searchQuery)
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
  }, [isRealTreeId, activeTree?.id, searchQuery]);

  const handleImport = async (data: { people: Person[]; relationships: Relationship[] }) => {
    if (isSupabaseConfigured()) {
      try {
        await importGedcomToSupabase(activeTree.id, data, currentUser?.id);
        const archive = await loadArchiveData(activeTree.id);
        setAllPeople(archive.people);
        setAllRelationships(archive.relationships);
        setActiveTab('tree');
        return;
      } catch (err) {
        console.error('Failed to import GEDCOM to Supabase', err);
      }
    }
    const importedPeople = data.people.map(p => ({ ...p, treeId: 'imported' }));
    const importedRels = data.relationships.map(r => ({ ...r, treeId: 'imported' }));
    setAllPeople(prev => [...prev, ...importedPeople]);
    setAllRelationships(prev => [...prev, ...importedRels]);
    setActiveTab('tree');
  };

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

  const primaryNavItems: Array<{ id: 'home' | 'tree' | 'records'; icon: LucideIcon; label: string }> = [
    { id: 'home', icon: Home, label: 'Portal Home' },
    { id: 'tree', icon: GitBranch, label: 'Interactive Tree' },
    { id: 'records', icon: Database, label: 'Historical Archive' }
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
                <span className="hidden lg:block font-black text-[10px] uppercase tracking-widest truncate text-slate-700">{activeTree.name}</span>
              </div>
              <ChevronDown className={`hidden lg:block w-4 h-4 text-slate-400 transition-transform duration-300 ${showTreeSelector ? 'rotate-180' : ''}`} />
            </button>
            
            {showTreeSelector && (
              <div className="absolute top-full left-0 w-full mt-3 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] z-50 py-3 animate-in fade-in slide-in-from-top-4 duration-300">
                {trees.map(t => (
                  <button key={t.id} onClick={() => selectTree(t)} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                    <div className={`w-2.5 h-2.5 rounded-full ${t.id === activeTree.id ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-200'}`}></div>
                    <span className="text-sm font-bold text-slate-700">{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 px-5 space-y-2">
          {primaryNavItems.map((item) => (
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
                placeholder={`Query the ${activeTree.name}...`} 
                className="w-full pl-12 pr-6 py-3.5 bg-slate-100/50 border-transparent rounded-[20px] outline-none text-[13px] font-medium transition-all focus:bg-white focus:ring-4 focus:ring-slate-900/5"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {isSearching && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            {currentUser ? (
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-black text-slate-900 leading-none">{currentUser.name}</p>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1.5">{currentUser.isAdmin ? 'Super Administrator' : 'Researcher'}</p>
                </div>
                <img src={currentUser.avatarUrl} className="w-12 h-12 rounded-full border-4 border-white shadow-xl" alt="Avatar" />
                <button onClick={handleLogout} className="px-5 py-2 rounded-[14px] border border-slate-300 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">
                  Log Out
                </button>
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
            {activeTab === 'home' && (
              <TreeLandingPage tree={activeTree} people={treePeople} onPersonSelect={handlePersonSelect} isAdmin={currentUser?.isAdmin || false} />
            )}
            {activeTab === 'tree' && (
              <div className="space-y-10 animate-in fade-in duration-700">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-3xl font-serif font-bold text-slate-900">Kinship Map</h2>
                </div>
                <FamilyTree people={filteredPeople} relationships={filteredRelationships} onPersonSelect={handlePersonSelect} layout={layoutType} />
              </div>
            )}
            {activeTab === 'records' && (
              <div className="space-y-10 max-w-6xl mx-auto py-4">
                <ImportExport people={treePeople} relationships={treeRelationships} onImport={handleImport} />
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
            />
          )}
        </div>
      </main>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLogin={handleAdminLogin} />
    </div>
  );
};

export default App;
