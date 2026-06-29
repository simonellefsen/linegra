// GEDCOM NAME.TYPE <-> our AlternateNameType mapping — roadmap H/P1 (structured names).
//
// GEDCOM 7 `NAME.TYPE` enumerates: aka | birth | immigrant | maiden | married | name-changed |
// otherwise. Older files also use free-text (Nickname, Alias, …). The import parser historically
// hard-coded every alternate name to "Also Known As", dropping the TYPE; this module restores it.
// Pure (no I/O) so it is fully unit-testable.

import { AlternateNameType } from '../types';

/** Map a GEDCOM NAME.TYPE (any case, free-text tolerated) to our AlternateNameType. Unknown values
 *  fall back to "Also Known As". */
export const gedcomNameTypeToAlternate = (raw: string): AlternateNameType => {
  const key = (raw || '').trim().toLowerCase();
  switch (key) {
    case 'aka':
    case 'also known as':
    case 'otherwise':
      return 'Also Known As';
    case 'birth':
    case 'maiden':
      return 'Birth Name';
    case 'married':
      return 'Married Name';
    case 'immigrant':
    case 'anglicized':
    case 'anglicised':
      return 'Anglicized Name';
    case 'name-changed':
    case 'legal':
    case 'legal name':
      return 'Legal Name Change';
    case 'nickname':
    case 'nick':
      return 'Nickname';
    case 'alias':
      return 'Alias';
    case 'religious':
    case 'religious name':
      return 'Religious Name';
    default:
      return 'Also Known As';
  }
};

/** Inverse — emit a GEDCOM 7 NAME.TYPE keyword for an AlternateNameType. */
export const alternateTypeToGedcomNameType = (type: AlternateNameType): string => {
  switch (type) {
    case 'Birth Name':
      return 'birth';
    case 'Married Name':
      return 'married';
    case 'Anglicized Name':
      return 'immigrant';
    case 'Legal Name Change':
      return 'name-changed';
    case 'Nickname':
      return 'nickname';
    case 'Alias':
      return 'alias';
    case 'Religious Name':
      return 'religious';
    case 'Also Known As':
    default:
      return 'aka';
  }
};
