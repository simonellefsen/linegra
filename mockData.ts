
import { Person, Relationship, FamilyTree, MediaItem } from './types';

export const MOCK_TREES: FamilyTree[] = [
  {
    id: 't1',
    name: 'Linegra Family Archive',
    description: 'The primary ancestral line of the Linegra family originating in London.',
    lastModified: '2024-05-20',
    ownerId: 'u1',
    isPublic: true,
    themeColor: '#0f172a',
    createdAt: '2024-05-01T00:00:00Z',
    updatedAt: '2024-05-20T00:00:00Z',
    metadata: {}
  }
];

export const MOCK_MEDIA: MediaItem[] = [
  {
    id: 'm1',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&fit=crop',
    type: 'image',
    source: 'remote',
    category: 'Portrait',
    caption: 'Thomas Linegra in London',
    linkedPersonIds: ['p1'],
    date: '1970'
  },
  {
    id: 'm2',
    url: 'https://images.unsplash.com/photo-1444464666168-49d633b867ad?w=800&fit=crop',
    type: 'image',
    source: 'remote',
    category: 'Location',
    caption: 'Stepney Church Records, London',
    linkedPersonIds: ['p1', 'p6'],
    date: '1945'
  }
];

export const MOCK_PEOPLE: Person[] = [
  {
    id: 'p1',
    treeId: 't1',
    addedByUserId: 'u1',
    firstName: 'Thomas',
    lastName: 'Linegra',
    birthDate: '12 May 1945',
    birthPlace: 'London, UK',
    gender: 'M',
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    updatedAt: '2024-05-10T12:00:00Z',
    mediaIds: ['m1', 'm2'],
    bio: 'Thomas was born in post-war London during a time of immense rebuilding and social change. Growing up in the East End, he witnessed the transition from coal-fired hearths to the modern era of the 1960s.',
    sources: [
      {
        id: 's1',
        title: 'GRO Birth Index 1945',
        type: 'Vital Record',
        citationDate: '1945',
        event: 'Birth',
        reliability: 3,
        actualText: 'Thomas Linegra, born Q2 1945 in Stepney, London. Volume 1c, Page 224.'
      },
      {
        id: 's2',
        title: 'London Parish Register',
        type: 'Church Record',
        event: 'Birth',
        reliability: 2,
        actualText: 'Baptized at St. Marys on 15 June 1945. Parents William and Mary.'
      }
    ],
    notes: [
      {
        id: 'n1',
        type: 'Research Note',
        text: 'Confirm exact hospital location if possible; some records suggest a home birth in Stepney.',
        event: 'Birth',
        date: '2024-01-15'
      }
    ],
    dnaTests: [
      {
        id: 'dna1',
        type: 'mtDNA',
        vendor: 'FamilyTreeDNA',
        testNumber: '739695',
        testDate: '2017',
        isPrivate: false,
        haplogroup: 'H10a1',
        isConfirmed: true,
        notes: 'Primary mitochondrial line confirmed.'
      }
    ]
  },
  {
    id: 'p_steve',
    treeId: 't1',
    firstName: 'Steve',
    lastName: 'Johansson',
    birthDate: '15 Sep 1982',
    gender: 'M',
    updatedAt: '2024-05-20T10:00:00Z',
    isDNAMatch: true,
    dnaMatchInfo: {
      sharedCM: 145,
      segments: 8,
      longestSegment: 32,
      confidence: 'High',
      commonAncestorId: 'p6',
      matchUrl: '#'
    }
  },
  {
    id: 'p2',
    treeId: 't1',
    addedByUserId: 'u2',
    firstName: 'Eleanor',
    lastName: 'Linegra',
    maidenName: 'Bennett',
    birthDate: '22 Aug 1948',
    gender: 'F',
    photoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
    updatedAt: '2024-05-11T12:00:00Z'
  },
  {
    id: 'p6',
    treeId: 't1',
    addedByUserId: 'u1',
    firstName: 'William',
    lastName: 'Linegra',
    birthDate: '05 Jan 1910',
    deathDate: '15 Mar 1995',
    gender: 'M',
    photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop',
    updatedAt: '2024-04-01T12:00:00Z',
    sources: [
      {
        id: 's3',
        title: 'Death Certificate 1995',
        type: 'Vital Record',
        citationDate: '1995',
        event: 'Death',
        reliability: 3,
        actualText: 'William Linegra, aged 85, died of heart failure at home.'
      }
    ]
  }
];

export const MOCK_RELATIONSHIPS: Relationship[] = [
  { id: 'r1', treeId: 't1', type: 'marriage', personId: 'p1', relatedId: 'p2', date: '10 Jun 1970', status: 'current', order: 1, confidence: 'Confirmed' },
  { id: 'r2', treeId: 't1', type: 'bio_father', personId: 'p6', relatedId: 'p1', order: 1, confidence: 'Confirmed' },
  { id: 'r3', treeId: 't1', type: 'bio_father', personId: 'p6', relatedId: 'p_steve', order: 2, confidence: 'Probable' }
];
