import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import type { PendingCollaboratorInvite } from '../../types';
import { acceptPendingCollaboratorInvites, listMyPendingCollaboratorInvites } from '../../services/auth';

interface CollaboratorInvitesPanelProps {
  onAccepted?: (acceptedCount: number) => void;
}

const CollaboratorInvitesPanel: React.FC<CollaboratorInvitesPanelProps> = ({ onAccepted }) => {
  const [invites, setInvites] = useState<PendingCollaboratorInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvites(await listMyPendingCollaboratorInvites());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invitations.');
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAcceptAll = async () => {
    setAccepting(true);
    setError(null);
    setStatusMessage(null);
    try {
      const accepted = await acceptPendingCollaboratorInvites();
      await refresh();
      if (accepted > 0) {
        setStatusMessage(
          accepted === 1
            ? 'Accepted 1 tree invitation.'
            : `Accepted ${accepted} tree invitations.`
        );
        onAccepted?.(accepted);
      } else if (invites.length > 0) {
        setStatusMessage('No pending invitations matched your account email.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitations.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="border border-slate-200 bg-white rounded-[28px] shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Collaboration</p>
            <h3 className="text-lg font-serif font-bold text-slate-900">Tree invitations</h3>
          </div>
        </div>
        {invites.length > 0 && (
          <button
            type="button"
            onClick={() => void handleAcceptAll()}
            disabled={accepting}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-[0.2em] disabled:opacity-50"
          >
            {accepting ? 'Accepting…' : 'Accept all'}
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        <p className="text-sm text-slate-500">
          Invitations are matched to your account email. Accepting grants editor access so you can curate
          the shared tree.
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading invitations…
          </div>
        )}
        {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
        {statusMessage && (
          <p className="text-sm font-bold text-emerald-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {statusMessage}
          </p>
        )}
        {!loading && invites.length === 0 && !error && (
          <p className="text-sm text-slate-500">No pending invitations right now.</p>
        )}
        {invites.length > 0 && (
          <ul className="space-y-3">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3"
              >
                <p className="font-bold text-slate-900 truncate">{invite.treeName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {invite.ownerDisplayName ? `Invited by ${invite.ownerDisplayName}` : 'Editor invite'}
                  {invite.invitedAt ? ` · ${new Date(invite.invitedAt).toLocaleDateString()}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CollaboratorInvitesPanel;
