import { describe, expect, it } from 'vitest';
import { buildPublicBookUrl, isBookId, parseBookRouteFromLocation } from './bookShare';

const BOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('bookShare', () => {
  it('validates book ids', () => {
    expect(isBookId(BOOK_ID)).toBe(true);
    expect(isBookId('not-a-uuid')).toBe(false);
  });

  it('parses /book/:id paths and ?book= query', () => {
    expect(parseBookRouteFromLocation({ pathname: `/book/${BOOK_ID}`, search: '' })).toBe(BOOK_ID);
    expect(parseBookRouteFromLocation({ pathname: '/', search: `?book=${BOOK_ID}` })).toBe(BOOK_ID);
    expect(parseBookRouteFromLocation({ pathname: '/tree', search: '' })).toBeNull();
  });

  it('builds share URLs', () => {
    expect(buildPublicBookUrl(BOOK_ID, 'https://linegra.example')).toBe(
      `https://linegra.example/book/${BOOK_ID}`
    );
  });
});
