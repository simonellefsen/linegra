import {
  DNARawDataRowPreview,
  DNARawDataSummary,
  DNASharedSegmentRowPreview,
  DNASharedSegmentSummary,
} from '../types';

interface ParsedFtdnaAutosomalCsv {
  summary: DNARawDataSummary;
  preview: DNARawDataRowPreview[];
}

interface ParsedFtdnaSharedSegmentsCsv {
  summary: DNASharedSegmentSummary;
  preview: DNASharedSegmentRowPreview[];
}

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, '').trim());
};

export const parseFtdnaAutosomalCsv = (
  csvText: string,
  fileName: string
): ParsedFtdnaAutosomalCsv => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error('The file is empty.');
  }

  const header = parseCsvLine(lines[0]).map((value) => value.toUpperCase());
  const expected = ['RSID', 'CHROMOSOME', 'POSITION', 'RESULT'];
  const hasExpectedHeader = expected.every((column, idx) => header[idx] === column);
  if (!hasExpectedHeader) {
    throw new Error('Unsupported CSV format. Expected header: RSID,CHROMOSOME,POSITION,RESULT.');
  }

  let markersTotal = 0;
  let calledMarkers = 0;
  let noCallMarkers = 0;
  const chromosomes = new Set<string>();
  const preview: DNARawDataRowPreview[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const [rsid = '', chromosome = '', position = '', result = ''] = parseCsvLine(lines[i]);
    if (!rsid && !chromosome && !position && !result) continue;
    markersTotal += 1;
    const normalizedResult = result.toUpperCase();
    if (!normalizedResult || normalizedResult === '--') {
      noCallMarkers += 1;
    } else {
      calledMarkers += 1;
    }
    if (chromosome) chromosomes.add(chromosome);
    if (preview.length < 25) {
      preview.push({ rsid, chromosome, position, result });
    }
  }

  return {
    summary: {
      source: 'FTDNA_AUTOSOMAL_CSV',
      fileName,
      markersTotal,
      calledMarkers,
      noCallMarkers,
      chromosomeCount: chromosomes.size,
      importedAt: new Date().toISOString(),
    },
    preview,
  };
};

export const parseFtdnaSharedSegmentsCsv = (
  csvText: string,
  fileName: string
): ParsedFtdnaSharedSegmentsCsv => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error('The file is empty.');
  }

  const header = parseCsvLine(lines[0]).map((value) => value.toUpperCase());
  const expected = [
    'NAME',
    'MATCH NAME',
    'CHROMOSOME',
    'START LOCATION',
    'END LOCATION',
    'START RSID',
    'END RSID',
    'CENTIMORGANS',
    'SNPS'
  ];
  const hasExpectedHeader = expected.every((column, idx) => header[idx] === column);
  if (!hasExpectedHeader) {
    throw new Error(
      'Unsupported shared-segments CSV format. Expected header: Name,Match Name,Chromosome,Start Location,End Location,Start RSID,End RSID,Centimorgans,SNPs.'
    );
  }

  let personName = '';
  let matchName = '';
  let segmentCount = 0;
  let totalCentimorgans = 0;
  let largestSegmentCentimorgans = 0;
  let totalSnps = 0;
  const preview: DNASharedSegmentRowPreview[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const [
      personNameCell = '',
      matchNameCell = '',
      chromosome = '',
      startLocation = '',
      endLocation = '',
      startRsid = '',
      endRsid = '',
      centimorgansCell = '',
      snpsCell = ''
    ] = parseCsvLine(lines[i]);
    if (!chromosome && !startLocation && !endLocation && !centimorgansCell && !snpsCell) continue;
    const centimorgans = Number(centimorgansCell);
    const snps = Number(snpsCell);
    if (!Number.isFinite(centimorgans) || !Number.isFinite(snps)) continue;
    segmentCount += 1;
    totalCentimorgans += centimorgans;
    totalSnps += snps;
    largestSegmentCentimorgans = Math.max(largestSegmentCentimorgans, centimorgans);
    if (!personName && personNameCell) personName = personNameCell;
    if (!matchName && matchNameCell) matchName = matchNameCell;

    if (preview.length < 25) {
      preview.push({
        chromosome,
        startLocation: Number(startLocation) || 0,
        endLocation: Number(endLocation) || 0,
        startRsid,
        endRsid,
        centimorgans,
        snps: Math.trunc(snps),
      });
    }
  }

  if (!segmentCount) {
    throw new Error('No shared DNA segments were found in the selected file.');
  }

  return {
    summary: {
      source: 'FTDNA_SHARED_AUTOSOMAL_SEGMENTS_CSV',
      fileName,
      personName: personName || 'Unknown',
      matchName: matchName || 'Unknown',
      segmentCount,
      totalCentimorgans: Number(totalCentimorgans.toFixed(1)),
      largestSegmentCentimorgans: Number(largestSegmentCentimorgans.toFixed(1)),
      totalSnps,
      importedAt: new Date().toISOString(),
    },
    preview,
  };
};
