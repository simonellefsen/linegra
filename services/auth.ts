import type { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js';
import { mapPendingCollaboratorInvite } from '../lib/collaboratorInvites';
import { supabase } from '../lib/supabase';
import type { PendingCollaboratorInvite, TreeAccessRole, User, UserRole } from '../types';

const avatarUrlFor = (user: SupabaseUser, displayName: string) =>
  (user.user_metadata?.avatar_url as string | undefined) ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0f172a&color=fff`;

/** Where Supabase should send users after email confirmation (must be allow-listed in the project). */
export const getAuthRedirectUrl = (): string | undefined => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env as Record<string, string | undefined> : {};
  const configured = env.VITE_APP_URL ?? env.APP_URL;
  return configured ? configured.replace(/\/$/, '') + '/' : undefined;
};

/** True when the current URL is a Supabase email-confirmation (or recovery) callback. */
export const isAuthCallbackUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  const type = hashParams.get('type') ?? searchParams.get('type');
  const hasTokens =
    hashParams.has('access_token') ||
    searchParams.has('access_token') ||
    searchParams.has('code');
  return hasTokens && (type === 'signup' || type === 'email' || type === 'email_change' || type === 'recovery');
};

/** Strip auth tokens from the address bar after the client has consumed them. */
export const clearAuthCallbackFromUrl = (): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete('code');
  url.searchParams.delete('type');
  url.searchParams.delete('access_token');
  url.searchParams.delete('refresh_token');
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
};

export const mapProfileToUser = (
  authUser: SupabaseUser,
  profile?: { display_name?: string | null; full_name?: string | null; role?: string | null; avatar_url?: string | null } | null
): User => {
  const name =
    profile?.display_name ||
    profile?.full_name ||
    (authUser.user_metadata?.display_name as string | undefined) ||
    (authUser.user_metadata?.full_name as string | undefined) ||
    authUser.email?.split('@')[0] ||
    'Researcher';
  const role: UserRole = profile?.role === 'superadmin' ? 'superadmin' : 'researcher';
  return {
    id: authUser.id,
    name,
    email: authUser.email ?? '',
    avatarUrl: profile?.avatar_url ?? avatarUrlFor(authUser, name),
    isLoggedIn: true,
    role,
    isSuperAdmin: role === 'superadmin',
    isAdmin: role === 'superadmin',
  };
};

export const fetchCurrentProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, full_name, role, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

export const resolveSessionUser = async (session: Session | null): Promise<User | null> => {
  if (!session?.user) return null;
  const profile = await fetchCurrentProfile(session.user.id);
  return mapProfileToUser(session.user, profile);
};

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (data.session) {
    await acceptPendingCollaboratorInvites();
  }
  return data;
};

export const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
  const emailRedirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        display_name: displayName?.trim() || email.split('@')[0],
        full_name: displayName?.trim() || undefined,
      },
    },
  });
  if (error) throw new Error(error.message);
  if (data.session) {
    await acceptPendingCollaboratorInvites();
  }
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
};

export const acceptPendingCollaboratorInvites = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('accept_pending_collaborator_invites');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
};

export const listMyPendingCollaboratorInvites = async (): Promise<PendingCollaboratorInvite[]> => {
  const { data, error } = await supabase.rpc('list_my_pending_collaborator_invites');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPendingCollaboratorInvite(row as Record<string, unknown>));
};

const shouldAutoAcceptCollaboratorInvites = (event: AuthChangeEvent) =>
  event === 'SIGNED_IN' || event === 'INITIAL_SESSION';

export const getMyTreeRole = async (treeId: string): Promise<TreeAccessRole> => {
  const { data, error } = await supabase.rpc('get_my_tree_role', { target_tree_id: treeId });
  if (error) throw new Error(error.message);
  const role = data as string | null;
  if (role === 'owner' || role === 'editor') return role;
  return null;
};

export const canWriteTreeRole = (role: TreeAccessRole, isSuperAdmin = false) =>
  isSuperAdmin || role === 'owner' || role === 'editor';

export type AuthChangeHandler = (user: User | null, event: AuthChangeEvent) => void;

export const subscribeToAuthChanges = (onChange: AuthChangeHandler) =>
  supabase.auth.onAuthStateChange((event, session) => {
    void (async () => {
      try {
        if (session?.user && shouldAutoAcceptCollaboratorInvites(event)) {
          await acceptPendingCollaboratorInvites();
        }
        const mapped = await resolveSessionUser(session);
        onChange(mapped, event);
      } catch (err) {
        console.error('Failed to resolve auth session', err);
        onChange(null, event);
      }
    })();
  });

export const getInitialSessionUser = async (): Promise<User | null> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (data.session?.user) {
    await acceptPendingCollaboratorInvites();
  }
  return resolveSessionUser(data.session);
};
