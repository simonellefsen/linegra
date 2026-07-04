import { describe, expect, it } from 'vitest';
import { extractRequestGeo } from './requestGeo';

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
      region: '03',
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
});
