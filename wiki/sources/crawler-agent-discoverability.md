# Crawler & agent discoverability (roadmap U)

Policy for public URLs, crawl indexes, and machine-readable alternates. Pairs with **M5**
(public books), **A** (auth + `is_public` trees), and privacy flags on `persons`.

## Canonical URL scheme (U2)

| Resource | Canonical path | Legacy (redirected) |
|----------|----------------|---------------------|
| Site home | `/` | — |
| Public tree | `/tree/{treeUuid}` | `/?tree={treeUuid}` |
| Public person | `/tree/{treeUuid}/person/{personUuid}` | `/?tree=…&person=…` |
| Shared book | `/book/{bookUuid}` | `?book={bookUuid}` |

Implementation: [../../lib/publicRoutes.ts](../../lib/publicRoutes.ts), client redirects in
[../../App.tsx](../../App.tsx), Vercel rewrites in [../../vercel.json](../../vercel.json).

## Privacy gates

A person or URL is **crawlable** only when:

1. The parent `family_trees.is_public = true`.
2. `persons.is_private` is false.
3. The person is **not living** per [../../lib/lifespan.ts](../../lib/lifespan.ts) `inferLivingStatus`
   (server HTML/JSON uses the same rule; SQL sitemap uses a conservative subset in
   `is_person_publicly_crawlable`).

Family books: `is_public` **and** `status = 'complete'`.

Living/restricted persons must **never** appear in `sitemap.xml`, `llms.txt`, or alternate formats.

## Crawler surfaces

| Surface | Path | Roadmap |
|---------|------|---------|
| `robots.txt` | `/robots.txt` | U3 |
| `sitemap.xml` | `/sitemap.xml` → `/api/sitemap.xml` | U3 |
| `llms.txt` | `/llms.txt` | U6 |
| Person JSON | `/api/public/person/{uuid}` | U8 |
| Person Markdown | `?format=md` or `Accept: text/markdown` | U7 |
| Person HTML shell | `?format=html` | U1, U4 |
| Tree index HTML | `/api/public/tree/{uuid}?format=html` | U5 |
| Bot middleware | `middleware.ts` rewrites crawlers on `/tree/*` | U1 |

Database RPCs: `supabase/migrations/20260704140000_public_crawl_discoverability.sql`
(`list_public_sitemap_entries`, `list_public_tree_crawl_persons`).

## Bot observability (U10)

Edge API routes log bot hits to `public_crawl_events` (migration
`20260704150000_public_crawl_traffic.sql`). Superadmins view aggregates in **Administrator → Traffic**.

## Deploy checklist

1. `supabase db push` — apply `20260704140000_public_crawl_discoverability.sql`.
2. Ensure Vercel env has `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (or anon key aliases).
3. Verify `https://{host}/sitemap.xml`, `/robots.txt`, `/llms.txt`, and a sample person API.

## Still open (roadmap U)

- Book HTML prerender for crawlers (person/tree shells shipped first).
- `sitemap-index` chunking for very large trees.
- Admin metrics dashboard for crawler hits — **Administrator → Traffic** (superadmin, 2026-07-04).
- `noai` / `noimageai` meta for restricted media.
