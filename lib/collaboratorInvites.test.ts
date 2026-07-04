import { describe, expect, it } from 'vitest';
import { mapPendingCollaboratorInvite } from './collaboratorInvites';

describe('collaboratorInvites', () => {
  it('maps RPC rows into PendingCollaboratorInvite', () => {
    const invite = mapPendingCollaboratorInvite({
      id: 'c1',
      tree_id: 't1',
      tree_name: 'Hass-Jensen',
      role: 'editor',
      invitation_email: 'editor@example.com',
      invited_at: '2026-07-04T10:00:00Z',
      owner_display_name: 'Simon',
    });
    expect(invite.treeName).toBe('Hass-Jensen');
    expect(invite.ownerDisplayName).toBe('Simon');
    expect(invite.role).toBe('editor');
  });
});
