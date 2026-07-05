// Geo hints from edge/CDN request headers (Vercel, Cloudflare). No IP storage.

export interface RequestGeo {
  countryCode?: string;
  region?: string;
  city?: string;
}

const normalizeCountryCode = (value: string | null | undefined): string | undefined => {
  const code = value?.trim().toUpperCase();
  if (!code || code === 'XX' || code.length !== 2) return undefined;
  return code;
};

/** Vercel URI-encodes city names (e.g. Los%20Angeles). */
export const decodeGeoField = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return decodeURIComponent(trimmed).slice(0, 120);
  } catch {
    return trimmed.slice(0, 120);
  }
};

// ISO 3166-2 numeric subdivision codes Vercel sends without the country prefix.
const NUMERIC_SUBDIVISION_LABELS: Record<string, Record<string, string>> = {
  DK: {
    '81': 'North Denmark',
    '82': 'Central Denmark',
    '83': 'South Denmark',
    '84': 'Capital Region',
    '85': 'Zealand',
  },
};

/** Drop or expand numeric-only region codes for display and ingestion. */
export const formatGeoRegion = (
  countryCode: string | null | undefined,
  region: string | null | undefined
): string | undefined => {
  const decoded = decodeGeoField(region);
  if (!decoded) return undefined;
  if (/^[A-Za-z]/.test(decoded)) return decoded;
  if (/^\d+$/.test(decoded)) {
    const country = countryCode?.trim().toUpperCase();
    if (country && NUMERIC_SUBDIVISION_LABELS[country]?.[decoded]) {
      return NUMERIC_SUBDIVISION_LABELS[country][decoded];
    }
    return undefined;
  }
  return decoded;
};

const normalizeGeoRegion = (
  countryCode: string | undefined,
  region: string | null | undefined
): string | undefined => formatGeoRegion(countryCode, region);

/** Read country/region/city from platform geo headers when present. */
export const extractRequestGeo = (request: Request): RequestGeo => {
  const countryCode =
    normalizeCountryCode(request.headers.get('x-vercel-ip-country')) ??
    normalizeCountryCode(request.headers.get('cf-ipcountry'));
  return {
    countryCode,
    region:
      normalizeGeoRegion(
        countryCode,
        request.headers.get('x-vercel-ip-country-region') ?? request.headers.get('cf-region')
      ),
    city:
      decodeGeoField(request.headers.get('x-vercel-ip-city')) ??
      decodeGeoField(request.headers.get('cf-ipcity')),
  };
};

/** Format city + region for visitor location columns (handles legacy encoded rows). */
export const formatGeoLocation = (
  countryCode: string | null | undefined,
  city: string | null | undefined,
  region: string | null | undefined
): string => {
  const parts = [decodeGeoField(city), formatGeoRegion(countryCode, region)].filter(Boolean);
  return parts.join(', ');
};
