import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Shield, Trash2, UserPlus } from 'lucide-react';
import type { TreeCollaborator } from '../../types';
import {
  inviteTreeCollaborator,
  listTreeCollaborators,
  removeTreeCollaborator,
  updateTreeCollaborator,
} from '../../services/archive';

interface AdminCollaboratorsPanelProps {
  treeId: string;
  treeName: string;
  canManage: boolean;
}

const AdminCollaboratorsPanel: React.FC<AdminCollaboratorsPanelProps> = ({
  treeId,
  treeName,
  canManage,
}) => {
  const [collaborators, setCollaborators] = useState<TreeCollaborator[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTreeCollaborators(treeId);
      setCollaborators(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collaborators.');
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setInviting(true);
    setError(null);
    setStatusMessage(null);
    try {
      await inviteTreeCollaborator(treeId, inviteEmail.trim(), 'editor');
      setInviteEmail('');
      setStatusMessage(`Invitation sent to ${inviteEmail.trim()}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (collaborator: TreeCollaborator) => {
    if (!canManage || collaborator.role === 'owner') return;
    setError(null);
    try {
      await removeTreeCollaborator(collaborator.id);
      setStatusMessage(`Removed ${collaborator.email || collaborator.displayName || 'collaborator'}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove collaborator.');
    }
  };

  const handleReactivate = async (collaborator: TreeCollaborator) => {
    if (!canManage || collaborator.role === 'owner') return;
    setError(null);
    try {
      await updateTreeCollaborator(collaborator.id, { status: 'active' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update collaborator.');
    }
  };

  return (
    <div className="mt-6 border-t border-slate-100 pt-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">Collaborators</h4>
          <p className="text-xs text-slate-500">Editors invited to help curate {treeName}.</p>
        </div>
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>}
      {statusMessage && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">{statusMessage}</p>
      )}

      {canManage && (
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              required
              placeholder="editor@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="px-5 py-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Invite editor
          </button>
        </form>
      )}

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-6 flex items-center justify-center text-slate-400 gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading collaborators...
          </div>
        ) : collaborators.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No collaborators yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {collaborators.map((collaborator) => (
              <li key={collaborator.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {collaborator.displayName || collaborator.email || 'Pending invite'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {collaborator.email}
                    {collaborator.invitationEmail && !collaborator.profileId
                      ? ` · invited as ${collaborator.invitationEmail}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                    {collaborator.role}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full ${
                      collaborator.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : collaborator.status === 'invited'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {collaborator.status}
                  </span>
                  {canManage && collaborator.role !== 'owner' && (
                    <>
                      {collaborator.status !== 'active' && (
                        <button
                          type="button"
                          onClick={() => void handleReactivate(collaborator)}
                          className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600 hover:text-slate-900"
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleRevoke(collaborator)}
                        className="p-2 rounded-xl text-rose-600 hover:bg-rose-50"
                        aria-label="Remove collaborator"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminCollaboratorsPanel;
