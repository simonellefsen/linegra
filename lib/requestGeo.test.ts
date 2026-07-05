import { describe, expect, it } from 'vitest';
import { decodeGeoField, extractRequestGeo, formatGeoLocation, formatGeoRegion } from './requestGeo';

describe('requestGeo', () => {
  it('reads Vercel geo headers', () => {
    const request = new Request('https://linegra.example/tree/abc', {
      headers: {
        'x-vercel-ip-country': 'no',
        'x-vercel-ip-country-region': '03',
        'x-vercel-ip-city': 'Oslo',
      },
    });
    expect(extractRequestGeo(request)).toEqual({
      countryCode: 'NO',
      region: undefined,
      city: 'Oslo',
    });
  });

  it('falls back to Cloudflare headers', () => {
    const request = new Request('https://linegra.example/tree/abc', {
      headers: {
        'cf-ipcountry': 'US',
        'cf-region': 'CA',
        'cf-ipcity': 'San Francisco',
      },
    });
    expect(extractRequestGeo(request)).toEqual({
      countryCode: 'US',
      region: 'CA',
      city: 'San Francisco',
    });
  });

  it('returns empty geo when headers are missing', () => {
    const request = new Request('https://linegra.example/');
    expect(extractRequestGeo(request)).toEqual({});
  });

  it('decodes URL-encoded Vercel city names', () => {
    const request = new Request('https://linegra.example/tree/abc', {
      headers: {
        'x-vercel-ip-country': 'US',
        'x-vercel-ip-country-region': 'CA',
        'x-vercel-ip-city': 'Los%20Angeles',
      },
    });
    expect(extractRequestGeo(request)).toEqual({
      countryCode: 'US',
      region: 'CA',
      city: 'Los Angeles',
    });
  });

  it('maps Danish numeric subdivision codes to region names', () => {
    const request = new Request('https://linegra.example/tree/abc', {
      headers: {
        'x-vercel-ip-country': 'DK',
        'x-vercel-ip-country-region': '84',
        'x-vercel-ip-city': 'Copenhagen',
      },
    });
    expect(extractRequestGeo(request)).toEqual({
      countryCode: 'DK',
      region: 'Capital Region',
      city: 'Copenhagen',
    });
  });

  it('drops unmapped numeric-only region codes', () => {
    expect(formatGeoRegion('ZZ', '84')).toBeUndefined();
  });

  it('formats stored location strings for display', () => {
    expect(decodeGeoField('Los%20Angeles')).toBe('Los Angeles');
    expect(formatGeoLocation('DK', 'Copenhagen', '84')).toBe('Copenhagen, Capital Region');
  });
});
