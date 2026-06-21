import { describe, it, expect } from 'vitest';
import {
  parseAutosomalCsv,
  parseSharedSegmentsCsv,
  parseFtdnaAutosomalCsv,
  parseFtdnaSharedSegmentsCsv,
} from './dnaRawParser';

describe('parseAutosomalCsv', () => {
  const header = 'RSID,CHROMOSOME,POSITION,RESULT';

  it('counts markers, no-calls, and distinct chromosomes', () => {
    const csv = [
      header,
      'rs1,1,1000,AA',
      'rs2,1,2000,--', // no-call sentinel
      'rs3,2,3000,', // empty result => no-call
      'rs4,X,4000,GG',
    ].join('\n');

    const { summary, preview } = parseAutosomalCsv(csv, 'test.csv');

    expect(summary.source).toBe('AUTOSOMAL_CSV');
    expect(summary.fileName).toBe('test.csv');
    expect(summary.markersTotal).toBe(4);
    expect(summary.calledMarkers).toBe(2);
    expect(summary.noCallMarkers).toBe(2);
    expect(summary.chromosomeCount).toBe(3); // 1, 2, X
    expect(preview).toHaveLength(4);
    expect(typeof summary.importedAt).toBe('string');
  });

  it('throws on an empty file', () => {
    expect(() => parseAutosomalCsv('', 'empty.csv')).toThrow(/empty/i);
  });

  it('throws on an unsupported header', () => {
    expect(() => parseAutosomalCsv('A,B,C,D\nx,y,z,w', 'bad.csv')).toThrow(/Unsupported CSV format/i);
  });

  it('is exposed under the FTDNA autosomal alias', () => {
    expect(parseFtdnaAutosomalCsv).toBe(parseAutosomalCsv);
  });
});

describe('parseSharedSegmentsCsv', () => {
  const myHeritageHeader =
    'NAME,MATCH NAME,CHROMOSOME,START LOCATION,END LOCATION,START RSID,END RSID,CENTIMORGANS,SNPS';
  const ftdnaHeader = 'MATCH NAME,CHROMOSOME,START LOCATION,END LOCATION,CENTIMORGANS,MATCHING SNPS';

  it('parses the MyHeritage format and aggregates cM', () => {
    const csv = [
      myHeritageHeader,
      'Pernille Gamby,Lis Stær,1,1000,5000,rs1,rs2,400,1200',
      'Pernille Gamby,Lis Stær,2,2000,6000,rs3,rs4,300,900',
    ].join('\n');

    const { summary } = parseSharedSegmentsCsv(csv, 'mh.csv');

    expect(summary.importFormat).toBe('MYHERITAGE_SHARED_SEGMENTS');
    expect(summary.personName).toBe('Pernille Gamby');
    expect(summary.matchName).toBe('Lis Stær');
    expect(summary.segmentCount).toBe(2);
    expect(summary.totalCentimorgans).toBe(700);
    expect(summary.largestSegmentCentimorgans).toBe(400);
    expect(summary.totalSnps).toBe(2100);
    // 700 cM lands in the 1st-cousin cluster bucket
    expect(summary.estimatedRelationship).toBe('1st cousin cluster');
  });

  it('parses the FTDNA comparison format (match name in first column)', () => {
    const csv = [ftdnaHeader, 'James Franklin,3,1000,9000,250,2000'].join('\n');

    const { summary } = parseSharedSegmentsCsv(csv, 'ftdna.csv');

    expect(summary.importFormat).toBe('FTDNA_COMPARISON_SEGMENTS');
    expect(summary.matchName).toBe('James Franklin');
    expect(summary.personName).toBe('Unknown'); // FTDNA has no person-name column
    expect(summary.segmentCount).toBe(1);
    expect(summary.totalCentimorgans).toBe(250);
  });

  it('skips rows with non-numeric cM/SNP values', () => {
    const csv = [
      ftdnaHeader,
      'James Franklin,3,1000,9000,250,2000',
      'Noise,bad,bad,bad,notanumber,alsobad', // dropped
    ].join('\n');

    const { summary } = parseSharedSegmentsCsv(csv, 'ftdna.csv');
    expect(summary.segmentCount).toBe(1);
  });

  it('handles quoted fields containing commas', () => {
    const csv = [
      myHeritageHeader,
      '"Smith, John","Doe, Jane",1,100,200,rs1,rs2,50,500',
    ].join('\n');

    const { summary } = parseSharedSegmentsCsv(csv, 'quoted.csv');
    expect(summary.personName).toBe('Smith, John');
    expect(summary.matchName).toBe('Doe, Jane');
    expect(summary.totalCentimorgans).toBe(50);
  });

  it('throws on an unsupported header', () => {
    expect(() => parseSharedSegmentsCsv('A,B,C\n1,2,3', 'bad.csv')).toThrow(/Unsupported shared-segments/i);
  });

  it('throws when the file has a valid header but no segments', () => {
    expect(() => parseSharedSegmentsCsv(ftdnaHeader, 'headeronly.csv')).toThrow(/No shared DNA segments/i);
  });

  it('is exposed under the FTDNA shared-segments alias', () => {
    expect(parseFtdnaSharedSegmentsCsv).toBe(parseSharedSegmentsCsv);
  });
});
