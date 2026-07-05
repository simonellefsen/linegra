import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearAuthCallbackFromUrl,
  getInitialSessionUser,
  isAuthCallbackUrl,
  listMyPendingCollaboratorInvites,
  signOut,
  subscribeToAuthChanges,
} from '../services/auth';
import type { User } from '../types';

type UseAppAuthOptions = {
  onLogout?: () => void;
};

export const useAppAuth = (options: UseAppAuthOptions = {}) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const emailCallbackPending = useRef(false);

  const showEmailConfirmedNotice = useCallback((user: User) => {
    setAuthSuccessMessage(`Email confirmed — welcome, ${user.name}! You are signed in.`);
    clearAuthCallbackFromUrl();
  }, []);

  useEffect(() => {
    let cancelled = false;
    emailCallbackPending.current = isAuthCallbackUrl();
    void (async () => {
      try {
        const user = await getInitialSessionUser();
        if (!cancelled) {
          setCurrentUser(user);
          if (user && emailCallbackPending.current) {
            emailCallbackPending.current = false;
            showEmailConfirmedNotice(user);
          }
        }
      } catch (err) {
        console.error('Failed to restore auth session', err);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    const { data } = subscribeToAuthChanges((user) => {
      setCurrentUser(user);
      if (user && emailCallbackPending.current) {
        emailCallbackPending.current = false;
        showEmailConfirmedNotice(user);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [showEmailConfirmedNotice]);

  useEffect(() => {
    if (!authSuccessMessage) return;
    const timer = window.setTimeout(() => setAuthSuccessMessage(null), 10000);
    return () => window.clearTimeout(timer);
  }, [authSuccessMessage]);

  const refreshPendingInvites = useCallback(async () => {
    if (!currentUser) {
      setPendingInviteCount(0);
      return;
    }
    try {
      const invites = await listMyPendingCollaboratorInvites();
      setPendingInviteCount(invites.length);
    } catch (err) {
      console.error('Failed to load pending collaborator invites', err);
      setPendingInviteCount(0);
    }
  }, [currentUser]);

  useEffect(() => {
    void refreshPendingInvites();
  }, [refreshPendingInvites]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out failed', err);
    }
    setCurrentUser(null);
    setPendingInviteCount(0);
    options.onLogout?.();
  }, [options]);

  return {
    showAuthModal,
    setShowAuthModal,
    currentUser,
    setCurrentUser,
    authReady,
    authSuccessMessage,
    setAuthSuccessMessage,
    pendingInviteCount,
    setPendingInviteCount,
    refreshPendingInvites,
    handleLogout,
    showEmailConfirmedNotice,
  };
};
