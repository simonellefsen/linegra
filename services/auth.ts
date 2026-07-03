import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { TreeAccessRole, User, UserRole } from '../types';

const avatarUrlFor = (user: SupabaseUser, displayName: string) =>
  (user.user_metadata?.avatar_url as string | undefined) ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0f172a&color=fff`;

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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
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

export const getMyTreeRole = async (treeId: string): Promise<TreeAccessRole> => {
  const { data, error } = await supabase.rpc('get_my_tree_role', { target_tree_id: treeId });
  if (error) throw new Error(error.message);
  const role = data as string | null;
  if (role === 'owner' || role === 'editor') return role;
  return null;
};

export const canWriteTreeRole = (role: TreeAccessRole, isSuperAdmin = false) =>
  isSuperAdmin || role === 'owner' || role === 'editor';

export const subscribeToAuthChanges = (
  onChange: (user: User | null) => void
) =>
  supabase.auth.onAuthStateChange((_event, session) => {
    void (async () => {
      try {
        const mapped = await resolveSessionUser(session);
        onChange(mapped);
      } catch (err) {
        console.error('Failed to resolve auth session', err);
        onChange(null);
      }
    })();
  });

export const getInitialSessionUser = async (): Promise<User | null> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return resolveSessionUser(data.session);
};
