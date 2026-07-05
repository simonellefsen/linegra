import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { fetchPersonDetails, resolvePublicPersonIdClient, resolvePublicTreeIdClient } from '../services/archive';
import {
  buildPersonUrl,
  buildTreeUrl,
  canonicalizeLegacyPublicUrl,
  parsePublicRouteFromLocation,
} from '../lib/publicRoutes';
import type { FamilyTree as FamilyTreeType, Person } from '../types';

type AppTab = 'home' | 'tree' | 'records' | 'settings' | 'profile';

type UseAppPublicRoutesParams = {
  pendingPersonId: string | null;
  setPendingPersonId: (id: string | null) => void;
  trees: FamilyTreeType[];
  activeTreeId: string | null;
  activeTab: AppTab;
  selectedPerson: Person | null;
  treePeople: Person[];
  setActiveTree: (tree: FamilyTreeType | null) => void;
  setSelectedPerson: Dispatch<SetStateAction<Person | null>>;
  setPedigreeFocusId: (id: string | null) => void;
  setTreeViewReady: (ready: boolean) => void;
  handleEnsurePersonDetails: (personId: string) => Promise<Person | null>;
};

export const useAppPublicRoutes = ({
  pendingPersonId,
  setPendingPersonId,
  trees,
  activeTreeId,
  activeTab,
  selectedPerson,
  treePeople,
  setActiveTree,
  setSelectedPerson,
  setPedigreeFocusId,
  setTreeViewReady,
  handleEnsurePersonDetails,
}: UseAppPublicRoutesParams) => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canonical = canonicalizeLegacyPublicUrl();
    if (canonical) {
      window.history.replaceState({}, '', canonical);
    }
    const route = parsePublicRouteFromLocation(window.location);
    if (route.kind === 'person' && route.personId) {
      setPendingPersonId(route.personId);
      return;
    }
    if (route.kind === 'person' && route.personIdPrefix) {
      let cancelled = false;
      void (async () => {
        try {
          const treeId =
            route.treeId ??
            (route.treeSlug ? await resolvePublicTreeIdClient(route.treeSlug) : null) ??
            null;
          if (!treeId || cancelled) return;
          const personId = await resolvePublicPersonIdClient(treeId, route.personIdPrefix!);
          if (!personId || cancelled) return;
          setPendingPersonId(personId);
        } catch (err) {
          console.error('Failed to resolve public person route', err);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (route.kind === 'tree' && route.treeSlug && !route.treeId) {
      const tree = trees.find((entry) => entry.slug === route.treeSlug);
      if (tree) setActiveTree(tree);
    }
    const personId = new URL(window.location.href).searchParams.get('person');
    if (personId) {
      setPendingPersonId(personId);
    }
  }, [trees, setActiveTree, setPendingPersonId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (parsePublicRouteFromLocation(window.location).kind === 'book') return;
    if (activeTab === 'records' || activeTab === 'profile') return;
    const selectedPersonId = selectedPerson?.id ?? null;
    if (selectedPersonId && activeTreeId) {
      const activeTreeRef = trees.find((tree) => tree.id === activeTreeId);
      window.history.replaceState(
        {},
        '',
        buildPersonUrl(
          { id: activeTreeId, slug: activeTreeRef?.slug },
          {
            id: selectedPersonId,
            firstName: selectedPerson?.firstName,
            lastName: selectedPerson?.lastName,
            birthDate: selectedPerson?.birthDate,
          }
        )
      );
      return;
    }
    if (activeTreeId) {
      const activeTreeRef = trees.find((tree) => tree.id === activeTreeId);
      window.history.replaceState({}, '', buildTreeUrl({ id: activeTreeId, slug: activeTreeRef?.slug }));
    }
  }, [activeTreeId, selectedPerson?.id, selectedPerson, activeTab, trees]);

  useEffect(() => {
    if (!pendingPersonId) return;
    if (!trees.length) return;
    const match = treePeople.find((p) => p.id === pendingPersonId);
    if (match) {
      setSelectedPerson(match);
      setPedigreeFocusId(match.id);
      if (!match.detailsLoaded) {
        void handleEnsurePersonDetails(match.id);
      } else {
        setPendingPersonId(null);
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const person = await fetchPersonDetails(pendingPersonId);
        if (cancelled) return;
        setSelectedPerson(person);
        setPedigreeFocusId(person.id);
        setTreeViewReady(true);
        if (person.treeId && person.treeId !== activeTreeId) {
          const targetTree = trees.find((tree) => tree.id === person.treeId);
          if (targetTree) {
            setActiveTree(targetTree);
          }
        }
        setPendingPersonId(null);
      } catch (err) {
        console.error('Failed to load person from URL', err);
        setPendingPersonId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    pendingPersonId,
    treePeople,
    handleEnsurePersonDetails,
    activeTreeId,
    trees,
    setActiveTree,
    setPedigreeFocusId,
    setSelectedPerson,
    setTreeViewReady,
    setPendingPersonId,
  ]);
};
