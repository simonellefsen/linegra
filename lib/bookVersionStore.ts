// Browser localStorage persistence for book version history (roadmap M4). Thin + guarded: the
// versioning LOGIC lives in lib/bookVersions.ts (pure, tested); this just loads/saves the history
// array per book. Best-effort — swallows quota/private-mode errors so the editor never breaks.
//
// This is intentionally client-side (per-browser) today: it needs no DB migration and works
// immediately. Cross-device + a server-side "published" snapshot for the M5 public viewer are the
// documented follow-up (a family_book_versions table + published_chapters column via migration).

import { BookVersion, MAX_BOOK_VERSIONS } from './bookVersions';

const key = (bookId: string) => `linegra:book-versions:${bookId}`;

const available = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const loadVersionHistory = (bookId: string): BookVersion[] => {
  if (!available()) return [];
  try {
    const raw = window.localStorage.getItem(key(bookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BookVersion[]) : [];
  } catch {
    return [];
  }
};

export const saveVersionHistory = (bookId: string, history: BookVersion[]): void => {
  if (!available()) return;
  try {
    window.localStorage.setItem(key(bookId), JSON.stringify(history.slice(0, MAX_BOOK_VERSIONS)));
  } catch {
    // quota exceeded / private mode — best-effort; the editor keeps working in-memory for this session.
  }
};
