import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Person } from '../types';

type UsePersonProfileSelectionParams = {
  canViewPrivate: boolean;
  handleEnsurePersonDetails: (personId: string) => Promise<Person | null>;
  setPedigreeFocusId: (id: string | null) => void;
  setPendingPersonId: (id: string | null) => void;
  setSelectedPerson: Dispatch<SetStateAction<Person | null>>;
  setAllPeople: Dispatch<SetStateAction<Person[]>>;
};

export const usePersonProfileSelection = ({
  canViewPrivate,
  handleEnsurePersonDetails,
  setPedigreeFocusId,
  setPendingPersonId,
  setSelectedPerson,
  setAllPeople,
}: UsePersonProfileSelectionParams) => {
  const handlePersonSelect = useCallback(
    (person: Person | null) => {
      if (person && person.isPrivate && !canViewPrivate) {
        return;
      }
      setSelectedPerson(person);
      setPendingPersonId(person ? person.id : null);
      if (person) {
        setPedigreeFocusId(person.id);
      }
      if (person && !person.detailsLoaded) {
        void handleEnsurePersonDetails(person.id);
      }
    },
    [canViewPrivate, handleEnsurePersonDetails, setPedigreeFocusId, setPendingPersonId, setSelectedPerson]
  );

  const handlePersonPatched = useCallback(
    (updated: Person) => {
      setSelectedPerson((prev) => (prev?.id === updated.id ? updated : prev));
      setAllPeople((prev) =>
        prev.length ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev
      );
    },
    [setAllPeople, setSelectedPerson]
  );

  return { handlePersonSelect, handlePersonPatched };
};
