
export type SourceType = 
  | 'Book' 
  | 'Church Record' 
  | 'Probate Register' 
  | 'Website' 
  | 'Census' 
  | 'Vital Record' 
  | 'Military Record' 
  | 'Unknown';

export interface Source {
  id: string;
  externalId?: string;
  title: string;
  type: SourceType;
  url?: string;
  repository?: string;
  citationDate?: string;
  page?: string;
  reliability?: 1 | 2 | 3;
  actualText?: string;
  notes?: string;
  event?: string;
  abbreviation?: string;
  callNumber?: string;
}

export type MediaCategory = 'Portrait' | 'Family' | 'Location' | 'Document' | 'Event' | 'Other';
export type MediaType = 'image' | 'audio' | 'video' | 'document';
export type MediaSource = 'local' | 'remote';

export interface MediaItem {
  id: string;
  url: string; 
  type: MediaType;
  source: MediaSource;
  category: MediaCategory;
  caption: string;
  date?: string;
  description?: string;
  linkedPersonIds: string[]; 
  linkedEventLabel?: string;
}

export type DNATestType = 'Autosomal' | 'Shared Autosomal' | 'Y-DNA' | 'mtDNA' | 'X-DNA' | 'Other';
export type DNAVendor = 'FamilyTreeDNA' | 'AncestryDNA' | '23andMe' | 'MyHeritage' | 'LivingDNA' | 'Other';

export interface DNARawDataSummary {
  source: 'FTDNA_AUTOSOMAL_CSV';
  fileName: string;
  markersTotal: number;
  calledMarkers: number;
  noCallMarkers: number;
  chromosomeCount: number;
  importedAt: string;
}

export interface DNARawDataRowPreview {
  rsid: string;
  chromosome: string;
  position: string;
  result: string;
}

export interface DNASharedSegmentSummary {
  source: 'FTDNA_SHARED_AUTOSOMAL_SEGMENTS_CSV';
  fileName: string;
  personName: string;
  matchName: string;
  segmentCount: number;
  totalCentimorgans: number;
  largestSegmentCentimorgans: number;
  totalSnps: number;
  importedAt: string;
}

export interface DNASharedSegmentRowPreview {
  chromosome: string;
  startLocation: number;
  endLocation: number;
  startRsid: string;
  endRsid: string;
  centimorgans: number;
  snps: number;
}

export interface DNATest {
  id: string;
  type: DNATestType;
  testNumber?: string;
  vendor: DNAVendor;
  testDate?: string;
  matchDate?: string;
  isPrivate: boolean;
  haplogroup?: string;
  isConfirmed?: boolean;
  hvr1?: string;
  hvr2?: string;
  extraMutations?: string;
  codingRegion?: string;
  mostDistantAncestorId?: string;
  notes?: string;
  rawDataSummary?: DNARawDataSummary;
  rawDataPreview?: DNARawDataRowPreview[];
  sharedMatchName?: string;
  sharedMatchPersonId?: string;
  sharedSegmentSummary?: DNASharedSegmentSummary;
  sharedSegmentsPreview?: DNASharedSegmentRowPreview[];
  sharedPathPersonIds?: string[];
  sharedPathRelationshipIds?: string[];
}

export interface DNAAutosomalCandidate {
  personId: string;
  name: string;
  birthYear?: string | null;
  deathYear?: string | null;
  autosomalTestCount: number;
}

export interface DNASharedMatchRecord {
  id: string;
  ownerPersonId: string;
  ownerPersonName: string;
  counterpartPersonId: string;
  counterpartPersonName: string;
  sharedCM: number | null;
  segments: number | null;
  longestSegment: number | null;
  confidence: 'High' | 'Medium' | 'Low' | null;
  predictionLabel: string;
  pathFound: boolean;
  pathFitsPrediction: boolean;
  pathPersonIds: string[];
  pathRelationshipIds: string[];
  fileName?: string;
  importedAt?: string;
  testId?: string;
}

export interface DnaLineageResolution {
  matchId: string;
  counterpartPersonId: string;
  pathFound: boolean;
  pathFitsPrediction: boolean;
  pathPersonIds: string[];
  pathRelationshipIds: string[];
  pathLabel: string;
  predictionLabel: string;
}

export interface DNAMatchInfo {
  sharedCM: number;
  segments: number;
  longestSegment?: number;
  commonAncestorId?: string;
  matchUrl?: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export type NoteType = 'Generic' | 'To-do' | 'Research Note' | 'Discrepancy';

export interface Note {
  id: string;
  text: string;
  type: NoteType;
  event?: string; 
  date?: string;
  isPrivate?: boolean;
}

export interface StructuredPlace {
  fullText: string;
  placeName?: string; 
  street?: string;
  houseNumber?: string;
  floor?: string;
  apartment?: string;
  city?: string; 
  county?: string; 
  state?: string; 
  country?: string;
  zip?: string;
  historicalName?: string; 
  lat?: number;
  lng?: number;
  notes?: string; 
}

export interface PersonEvent {
  id: string;
  type: string; 
  date?: string;
  place?: string | StructuredPlace;
  description?: string; 
  employer?: string; 
}

export type DeathCauseCategory = 
  | 'Natural' 
  | 'Disease' 
  | 'Accident' 
  | 'Suicide' 
  | 'Homicide' 
  | 'Military' 
  | 'Legal Execution' 
  | 'Other' 
  | 'Unknown';

export type AlternateNameType = 'Birth Name' | 'Nickname' | 'Alias' | 'Married Name' | 'Anglicized Name' | 'Legal Name Change' | 'Also Known As' | 'Religious Name';

export interface AlternateName {
  type: AlternateNameType;
  firstName: string;
  lastName: string;
  notes?: string;
}

export type RelationshipType = 'marriage' | 'partner' | 'bio_father' | 'bio_mother' | 'adoptive_father' | 'adoptive_mother' | 'child' | 'step_parent' | 'guardian';
export type RelationshipStatus = 'current' | 'divorced' | 'separated' | 'widowed';

export type RelationshipConfidence = 
  | 'Confirmed'    // Direct evidence + DNA
  | 'Probable'     // Strong indirect evidence
  | 'Assumed'      // Working hypothesis
  | 'Speculative'  // Tentative theory
  | 'Unknown';

export interface Relationship {
  id: string;
  treeId: string;
  type: RelationshipType;
  personId: string;
  relatedId: string;
  date?: string;
  place?: string | StructuredPlace;
  notes?: string;
  status?: RelationshipStatus;
  order?: number;
  confidence?: RelationshipConfidence;
  sourceEvidenceIds?: string[]; // IDs of sources proving this link
  metadata?: Record<string, unknown>;
}

export interface Person {
  id: string;
  treeId: string;
  addedByUserId?: string;
  isLiving?: boolean;
  isPrivate?: boolean;
  firstName: string;
  lastName: string;
  title?: string;
  maidenName?: string;
  birthDate?: string;
  birthPlace?: string | StructuredPlace;
  deathDate?: string;
  deathPlace?: string | StructuredPlace;
  burialDate?: string;
  burialPlace?: string | StructuredPlace;
  deathCause?: string;
  deathCauseCategory?: DeathCauseCategory;
  residenceAtDeath?: string | StructuredPlace;
  gender: 'M' | 'F' | 'O';
  bio?: string;
  photoUrl?: string;
  occupations?: string[];
  generation?: number;
  updatedAt: string;
  userRole?: string;
  alternateNames?: AlternateName[]; 
  notes?: Note[];
  sources?: Source[];
  mediaIds?: string[]; 
  events?: PersonEvent[];
  dnaTests?: DNATest[];
  isDNAMatch?: boolean;
  dnaMatchInfo?: DNAMatchInfo;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
  detailsLoaded?: boolean;
}

export interface FamilyLayoutState {
  assignments: Record<string, string | null>;
  manualOrders: Record<string, string[]>;
  removedSpouseIds: string[];
  removedChildIds: string[];
  removedParentIds: string[];
}

export interface FamilyLayoutAudit {
  id: string;
  treeId: string;
  actorId?: string | null;
  actorName: string;
  createdAt: string;
  layout: FamilyLayoutState;
}

export interface FamilyTree {
  id: string;
  name: string;
  description?: string | null;
  ownerId?: string | null;
  isPublic: boolean;
  themeColor?: string | null;
  metadata?: Record<string, any>;
  defaultProbandId?: string | null;
  defaultProbandLabel?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastModified?: string;
}

export interface FamilyTreeSummary extends FamilyTree {
  personCount: number;
  relationshipCount: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
}

export type TreeLayoutType = 'pedigree' | 'fan' | 'descendant';
export interface Citation {
  id: string;
  sourceId: string;
  personId?: string;
  personEventId?: string;
  eventLabel?: string;
  noteId?: string;
  label?: string;
  page?: string;
  dataDate?: string;
  dataText?: string;
  quality?: string;
  extra?: Record<string, unknown>;
}
