// Roadmap A — map pending tree collaborator invites for the signed-in researcher inbox.

import type { PendingCollaboratorInvite } from '../types';

export const mapPendingCollaboratorInvite = (row: Record<string, unknown>): PendingCollaboratorInvite => ({
  id: String(row.id),
  treeId: String(row.tree_id),
  treeName: typeof row.tree_name === 'string' && row.tree_name.trim() ? row.tree_name : 'Family tree',
  role: row.role === 'editor' ? 'editor' : 'editor',
  invitationEmail: String(row.invitation_email ?? ''),
  invitedAt: typeof row.invited_at === 'string' ? row.invited_at : undefined,
  ownerDisplayName:
    typeof row.owner_display_name === 'string' && row.owner_display_name.trim()
      ? row.owner_display_name
      : null,
});
