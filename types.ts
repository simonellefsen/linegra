
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

export type DNATestType = 'Autosomal' | 'Y-DNA' | 'mtDNA' | 'X-DNA' | 'Other';
export type DNAVendor = 'FamilyTreeDNA' | 'AncestryDNA' | '23andMe' | 'MyHeritage' | 'LivingDNA' | 'Other';

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
}

export interface Person {
  id: string;
  treeId: string;
  addedByUserId?: string;
  isLiving?: boolean;
  isPrivate?: boolean;
  firstName: string;
  lastName: string;
  maidenName?: string;
  birthDate?: string;
  birthPlace?: string | StructuredPlace;
  deathDate?: string;
  deathPlace?: string | StructuredPlace;
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
}

export interface FamilyTree {
  id: string;
  name: string;
  description: string;
  lastModified: string;
  ownerId: string;
  isPublic: boolean;
  themeColor?: string;
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
  extra?: Record<string, unknown>;
}
