import {
  DNARawDataRowPreview,
  DNARawDataSummary,
  DNASharedSegmentRowPreview,
  DNASharedSegmentSummary,
} from '../types';

interface ParsedAutosomalCsv {
  summary: DNARawDataSummary;
  preview: DNARawDataRowPreview[];
}

interface ParsedSharedSegmentsCsv {
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

const estimateRelationshipFromSharedCm = (sharedCm: number): string => {
  if (sharedCm >= 3400) return 'Parent/Child or Full Sibling';
  if (sharedCm >= 2200) return '1st degree cluster';
  if (sharedCm >= 1300) return '2nd degree cluster';
  if (sharedCm >= 680) return '1st cousin cluster';
  if (sharedCm >= 250) return '2nd cousin cluster';
  if (sharedCm >= 90) return '3rd cousin cluster';
  if (sharedCm >= 40) return '4th cousin cluster';
  return 'Distant cousin cluster';
};

/** Pull the two tester names from common shared-segment export filenames. */
export const extractComparisonNamesFromFileName = (fileName: string): [string, string] | null => {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  const patterns = [
    /segments?\s+of\s+(.+?)\s+and\s+(.+?)$/i,
    /\bof\s+(.+?)\s+and\s+(.+?)$/i,
    /^(.+?)\s+and\s+(.+?)\s+shared/i,
    /^(.+?)\s+&\s+(.+?)$/i,
  ];
  for (const pattern of patterns) {
    const match = base.match(pattern);
    if (match?.[1] && match?.[2]) {
      return [match[1].trim(), match[2].trim()];
    }
  }
  return null;
};

const namesLookSimilar = (left: string, right: string) => {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

const applyFileNameComparisonNames = (
  fileName: string,
  personName: string,
  matchName: string,
  isFtdnaComparison: boolean
): { personName: string; matchName: string } => {
  const fromFile = extractComparisonNamesFromFileName(fileName);
  if (!fromFile) {
    return { personName, matchName };
  }
  const [firstName, secondName] = fromFile;
  let nextPersonName = personName;
  let nextMatchName = matchName;

  if (!nextPersonName || nextPersonName === 'Unknown') {
    if (isFtdnaComparison && nextMatchName && nextMatchName !== 'Unknown') {
      nextPersonName = namesLookSimilar(nextMatchName, secondName) ? firstName : secondName;
    } else {
      nextPersonName = firstName;
    }
  }
  if (!nextMatchName || nextMatchName === 'Unknown') {
    nextMatchName = secondName;
  }
  return { personName: nextPersonName, matchName: nextMatchName };
};

export const parseAutosomalCsv = (
  csvText: string,
  fileName: string
): ParsedAutosomalCsv => {
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
      source: 'AUTOSOMAL_CSV',
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

export const parseSharedSegmentsCsv = (
  csvText: string,
  fileName: string
): ParsedSharedSegmentsCsv => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error('The file is empty.');
  }

  const header = parseCsvLine(lines[0]).map((value) => value.toUpperCase());
  const myHeritageHeader = [
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
  const ftdnaHeader = [
    'MATCH NAME',
    'CHROMOSOME',
    'START LOCATION',
    'END LOCATION',
    'CENTIMORGANS',
    'MATCHING SNPS'
  ];
  const hasMyHeritageHeader = myHeritageHeader.every((column, idx) => header[idx] === column);
  const hasFtdnaHeader = ftdnaHeader.every((column, idx) => header[idx] === column);
  if (!hasMyHeritageHeader && !hasFtdnaHeader) {
    throw new Error(
      'Unsupported shared-segments CSV format. Expected MyHeritage or FTDNA segment comparison header.'
    );
  }
  const isFtdnaComparison = hasFtdnaHeader && !hasMyHeritageHeader;

  let personName = '';
  let matchName = '';
  let segmentCount = 0;
  let totalCentimorgans = 0;
  let largestSegmentCentimorgans = 0;
  let totalSnps = 0;
  const preview: DNASharedSegmentRowPreview[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const personNameCell = isFtdnaComparison ? '' : values[0] || '';
    const matchNameCell = isFtdnaComparison ? values[0] || '' : values[1] || '';
    const chromosome = isFtdnaComparison ? values[1] || '' : values[2] || '';
    const startLocation = isFtdnaComparison ? values[2] || '' : values[3] || '';
    const endLocation = isFtdnaComparison ? values[3] || '' : values[4] || '';
    const startRsid = isFtdnaComparison ? '' : values[5] || '';
    const endRsid = isFtdnaComparison ? '' : values[6] || '';
    const centimorgansCell = isFtdnaComparison ? values[4] || '' : values[7] || '';
    const snpsCell = isFtdnaComparison ? values[5] || '' : values[8] || '';
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

  const resolvedNames = applyFileNameComparisonNames(fileName, personName, matchName, isFtdnaComparison);
  personName = resolvedNames.personName;
  matchName = resolvedNames.matchName;

  return {
    summary: {
      source: 'SHARED_AUTOSOMAL_SEGMENTS_CSV',
      importFormat: isFtdnaComparison ? 'FTDNA_COMPARISON_SEGMENTS' : 'MYHERITAGE_SHARED_SEGMENTS',
      fileName,
      personName: personName || 'Unknown',
      matchName: matchName || 'Unknown',
      segmentCount,
      totalCentimorgans: Number(totalCentimorgans.toFixed(1)),
      largestSegmentCentimorgans: Number(largestSegmentCentimorgans.toFixed(1)),
      totalSnps,
      estimatedRelationship: estimateRelationshipFromSharedCm(totalCentimorgans),
      importedAt: new Date().toISOString(),
    },
    preview,
  };
};

// Backward-compatible aliases for older imports.
export const parseFtdnaAutosomalCsv = parseAutosomalCsv;
export const parseFtdnaSharedSegmentsCsv = parseSharedSegmentsCsv;
