import {
  AlternateNameType,
  DeathCauseCategory,
  RelationshipConfidence,
  SourceType,
  NoteType,
  DNAVendor,
  DNATestType,
} from '../../types';

export const DEATH_CATEGORIES: DeathCauseCategory[] = [
  'Natural',
  'Disease',
  'Accident',
  'Suicide',
  'Homicide',
  'Military',
  'Legal Execution',
  'Other',
  'Unknown',
];

export const ALT_NAME_TYPES: AlternateNameType[] = [
  'Birth Name',
  'Nickname',
  'Alias',
  'Married Name',
  'Anglicized Name',
  'Legal Name Change',
  'Also Known As',
  'Religious Name',
];

export const EVENT_TYPES = [
  'Residence',
  'Immigration',
  'Emigration',
  'Education',
  'Military Service',
  'Occupation',
  'Baptism',
  'Christening',
  'Confirmation',
  'Naturalization',
  'Probate',
  'Will',
  'Retirement',
  'Burial',
  'Occupation Change',
  'Other',
];

export const CONFIDENCE_LEVELS: RelationshipConfidence[] = [
  'Confirmed',
  'Probable',
  'Assumed',
  'Speculative',
  'Unknown',
];

export const SOURCE_TYPES: SourceType[] = [
  'Book',
  'Article',
  'Newspaper',
  'Church Record',
  'Probate Register',
  'Website',
  'Census',
  'Vital Record',
  'Military Record',
  'Unknown',
];

export const NOTE_TYPES: NoteType[] = ['Generic', 'To-do', 'Research Note', 'Discrepancy'];

export const DNA_VENDORS: DNAVendor[] = ['FamilyTreeDNA', 'AncestryDNA', '23andMe', 'MyHeritage', 'LivingDNA', 'Other'];

export const DNA_TEST_TYPES: DNATestType[] = ['Autosomal', 'Shared Autosomal', 'Y-DNA', 'mtDNA', 'X-DNA', 'Other'];

export const PARENT_LINK_TYPES = ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian'];
