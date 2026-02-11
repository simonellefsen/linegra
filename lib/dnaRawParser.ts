import { DNARawDataRowPreview, DNARawDataSummary } from '../types';

interface ParsedFtdnaAutosomalCsv {
  summary: DNARawDataSummary;
  preview: DNARawDataRowPreview[];
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

