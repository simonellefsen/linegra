import { useEffect } from 'react';
import type { Person, Relationship } from '../../types';
import { resolveTreeNavTarget } from '../../lib/treeNavigation';

interface UseTreeKeyboardNavOptions {
  enabled: boolean;
  focusId?: string;
  peopleById: Map<string, Person>;
  relationships: Relationship[];
  onFocusChange: (personId: string) => void;
  onHome?: () => void;
  onSearchFocus?: () => void;
}

export const useTreeKeyboardNav = ({
  enabled,
  focusId,
  peopleById,
  relationships,
  onFocusChange,
  onHome,
  onSearchFocus,
}: UseTreeKeyboardNavOptions) => {
  useEffect(() => {
    if (!enabled || !focusId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === '/' && onSearchFocus) {
        event.preventDefault();
        onSearchFocus();
        return;
      }

      if (event.key === 'Home' && onHome) {
        event.preventDefault();
        onHome();
        return;
      }

      let direction: 'parent' | 'child' | 'sibling-prev' | 'sibling-next' | null = null;
      if (event.key === 'ArrowUp') direction = 'parent';
      if (event.key === 'ArrowDown') direction = 'child';
      if (event.key === 'ArrowLeft') direction = 'sibling-prev';
      if (event.key === 'ArrowRight') direction = 'sibling-next';
      if (!direction) return;

      const nextId = resolveTreeNavTarget(focusId, direction, relationships, peopleById);
      if (!nextId || nextId === focusId) return;
      event.preventDefault();
      onFocusChange(nextId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, focusId, peopleById, relationships, onFocusChange, onHome, onSearchFocus]);
};
