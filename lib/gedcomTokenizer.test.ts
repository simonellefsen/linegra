import { describe, it, expect } from 'vitest';
import { tokenizeGedcom, gedcomMajorVersion } from './gedcomTokenizer';

describe('tokenizeGedcom', () => {
  it('parses level, xref, tag, and value', () => {
    const { lines } = tokenizeGedcom('0 @I1@ INDI\n1 NAME John /Smith/');
    expect(lines[0]).toMatchObject({ level: 0, xref: '@I1@', tag: 'INDI', value: '' });
    expect(lines[1]).toMatchObject({ level: 1, xref: undefined, tag: 'NAME', value: 'John /Smith/' });
  });

  it('strips a leading UTF-8 BOM', () => {
    const { lines } = tokenizeGedcom('﻿0 HEAD');
    expect(lines[0]).toMatchObject({ level: 0, tag: 'HEAD' });
  });

  it('merges CONT (newline) and CONC (no separator) into the parent value', () => {
    const text = [
      '0 @I1@ INDI',
      '1 NOTE First line',
      '2 CONC  continues here',
      '2 CONT Second line',
    ].join('\n');
    const note = tokenizeGedcom(text).lines.find((l) => l.tag === 'NOTE');
    expect(note?.value).toBe('First line continues here\nSecond line');
    // the continuation pseudo-structures are folded away
    expect(tokenizeGedcom(text).lines.some((l) => l.tag === 'CONC' || l.tag === 'CONT')).toBe(false);
  });

  it('keeps pointer payloads intact but un-escapes @@ in text', () => {
    const { lines } = tokenizeGedcom('1 FAMC @F1@\n1 NOTE email is a@@b.com');
    expect(lines.find((l) => l.tag === 'FAMC')?.value).toBe('@F1@');
    expect(lines.find((l) => l.tag === 'NOTE')?.value).toBe('email is a@b.com');
  });

  it('handles extension tags and CRLF line endings', () => {
    const { lines } = tokenizeGedcom('0 @I1@ INDI\r\n1 _LIVING Y\r\n');
    expect(lines.find((l) => l.tag === '_LIVING')).toMatchObject({ value: 'Y' });
  });

  it('detects HEAD.GEDC.VERS', () => {
    expect(tokenizeGedcom('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 TRLR').version).toBe('5.5.1');
    expect(tokenizeGedcom('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 TRLR').version).toBe('7.0');
    // a VERS that is not under GEDC (e.g. under SOUR) must not be mistaken for the gedcom version
    expect(tokenizeGedcom('0 HEAD\n1 SOUR X\n2 VERS 9.9\n1 GEDC\n2 VERS 7.0').version).toBe('7.0');
  });
});

describe('gedcomMajorVersion', () => {
  it('extracts the major version number', () => {
    expect(gedcomMajorVersion('5.5.1')).toBe(5);
    expect(gedcomMajorVersion('7.0')).toBe(7);
    expect(gedcomMajorVersion(null)).toBeNull();
  });
});
