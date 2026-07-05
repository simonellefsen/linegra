import { useEffect, useState } from 'react';
import { ensureTrees } from '../services/archive';
import { parsePublicRouteFromLocation } from '../lib/publicRoutes';
import type { FamilyTree as FamilyTreeType } from '../types';

export const useAppTreeBootstrap = (supabaseActive: boolean) => {
  const [trees, setTrees] = useState<FamilyTreeType[]>([]);
  const [activeTree, setActiveTree] = useState<FamilyTreeType | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseActive) {
      setTrees([]);
      setActiveTree(null);
      setConfigError(
        'Supabase credentials are missing. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (formerly SUPABASE_ANON_KEY) in your .env.local before running Linegra.'
      );
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const dbTrees = await ensureTrees();
        const ordered = [...dbTrees].sort((a, b) => a.name.localeCompare(b.name));
        setTrees(ordered);
        if (ordered.length) {
          let selected = ordered[0];
          if (typeof window !== 'undefined') {
            const route = parsePublicRouteFromLocation(window.location);
            const treeIdFromUrl =
              route.kind === 'tree' || route.kind === 'person'
                ? route.treeId
                : new URL(window.location.href).searchParams.get('tree');
            const matchedTree = treeIdFromUrl ? ordered.find((tree) => tree.id === treeIdFromUrl) : null;
            if (matchedTree) {
              selected = matchedTree;
            }
          }
          setActiveTree(selected);
        } else {
          setActiveTree(null);
        }
        setConfigError(null);
      } catch (err) {
        console.error('Failed to load tree list', err);
        const message = err instanceof Error ? err.message : 'Failed to load data from Supabase.';
        setConfigError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabaseActive]);

  return {
    trees,
    setTrees,
    activeTree,
    setActiveTree,
    loading,
    configError,
    setConfigError,
  };
};
