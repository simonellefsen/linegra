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

const normalizeGeoField = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
};

/** Read country/region/city from platform geo headers when present. */
export const extractRequestGeo = (request: Request): RequestGeo => ({
  countryCode:
    normalizeCountryCode(request.headers.get('x-vercel-ip-country')) ??
    normalizeCountryCode(request.headers.get('cf-ipcountry')),
  region:
    normalizeGeoField(request.headers.get('x-vercel-ip-country-region')) ??
    normalizeGeoField(request.headers.get('cf-region')),
  city:
    normalizeGeoField(request.headers.get('x-vercel-ip-city')) ??
    normalizeGeoField(request.headers.get('cf-ipcity')),
});
