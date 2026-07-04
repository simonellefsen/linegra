import React from 'react';
import { LogOut } from 'lucide-react';
import type { User } from '../../types';
import CollaboratorInvitesPanel from './CollaboratorInvitesPanel';

interface ResearcherProfilePageProps {
  user: User;
  onSignOut: () => void;
  onInvitesAccepted?: (acceptedCount: number) => void;
}

const ResearcherProfilePage: React.FC<ResearcherProfilePageProps> = ({
  user,
  onSignOut,
  onInvitesAccepted,
}) => (
  <div className="max-w-3xl mx-auto py-6 space-y-8 animate-in fade-in duration-500">
    <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6">
      <img
        src={user.avatarUrl}
        alt=""
        className="w-20 h-20 rounded-[24px] object-cover bg-slate-100"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Signed in</p>
        <h2 className="text-3xl font-serif font-bold text-slate-900 truncate">{user.name}</h2>
        <p className="text-sm text-slate-500 mt-1">{user.email}</p>
        {user.isSuperAdmin && (
          <p className="mt-2 inline-flex text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
            Superadmin
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-[0.2em] text-slate-600 hover:bg-slate-50"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>

    <CollaboratorInvitesPanel onAccepted={onInvitesAccepted} />
  </div>
);

export default ResearcherProfilePage;
