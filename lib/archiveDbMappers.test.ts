import { describe, expect, it } from 'vitest';
import {
  mapDbCollaborator,
  mapDbRelationship,
  mapDbTree,
  normalizePlace,
} from './archiveDbMappers';

describe('mapDbRelationship', () => {
  it('maps snake_case rows and lifts date/place from metadata', () => {
    const relationship = mapDbRelationship({
      id: 'rel-1',
      tree_id: 'tree-1',
      person_id: 'p1',
      related_id: 'p2',
      type: 'spouse',
      status: 'married',
      confidence: 'certain',
      sort_order: 2,
      notes: 'note',
      metadata: { date_text: '1850', place_text: 'Oslo' },
    });

    expect(relationship).toMatchObject({
      id: 'rel-1',
      treeId: 'tree-1',
      personId: 'p1',
      relatedId: 'p2',
      type: 'spouse',
      date: '1850',
      place: 'Oslo',
      order: 2,
    });
  });

  it('omits empty metadata object', () => {
    const relationship = mapDbRelationship({
      id: 'rel-2',
      tree_id: 'tree-1',
      person_id: 'p1',
      related_id: 'p2',
      type: 'parent',
      metadata: null,
    });
    expect(relationship.metadata).toBeUndefined();
  });
});

describe('mapDbTree', () => {
  it('maps proband defaults from metadata', () => {
    const tree = mapDbTree({
      id: 'tree-1',
      name: 'Jensen',
      slug: 'jensen',
      description: 'desc',
      owner_id: 'owner-1',
      is_public: true,
      theme_color: '#000',
      metadata: { defaultProbandId: 'p1', defaultProbandLabel: 'Proband' },
      created_at: '2026-01-01',
      updated_at: '2026-02-01',
    });

    expect(tree).toMatchObject({
      id: 'tree-1',
      name: 'Jensen',
      slug: 'jensen',
      isPublic: true,
      defaultProbandId: 'p1',
      defaultProbandLabel: 'Proband',
      lastModified: '2026-02-01',
    });
  });
});

describe('mapDbCollaborator', () => {
  it('accepts snake_case and camelCase row shapes', () => {
    const collaborator = mapDbCollaborator({
      id: 'c1',
      tree_id: 'tree-1',
      profile_id: 'profile-1',
      invitation_email: 'a@b.com',
      role: 'editor',
      status: 'invited',
      display_name: 'Ada',
      email: 'a@b.com',
      invited_at: '2026-01-01',
      responded_at: null,
    });

    expect(collaborator).toMatchObject({
      id: 'c1',
      treeId: 'tree-1',
      profileId: 'profile-1',
      invitationEmail: 'a@b.com',
      role: 'editor',
      status: 'invited',
    });
  });
});

describe('normalizePlace', () => {
  it('returns string places and structured fullText', () => {
    expect(normalizePlace('Oslo')).toBe('Oslo');
    expect(normalizePlace({ fullText: 'Bergen, Norway' })).toBe('Bergen, Norway');
    expect(normalizePlace(undefined)).toBeNull();
  });
});
