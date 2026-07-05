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

## Proposed URL scheme v2 — slugs, indexes, families (roadmap U16, proposed 2026-07-05)

**Why change:** UUID-only paths are opaque to both search engines and LLM agents. A crawler
ranking `/tree/9f2c…/person/4a1b…` gets zero keyword signal; an agent reading a link list of 12
UUID hrefs must fetch every one to learn who they point at. Semantic slugs let an agent pick
"the child born 1832" from anchor text + URL alone, cut token cost, and make URL patterns
*guessable/constructible*. **Timing:** the UUID canonical URLs shipped 2026-07-04 — almost nothing
is indexed yet, so redirect debt is near zero *this week* and grows from here.

**Principles** (Stack Overflow pattern): the short-id is **authoritative**, the slug is
**cosmetic** — resolve by id, and any wrong/stale/renamed slug gets a 301 to the current
canonical. Renames never break links and no slug-history table is needed.

| Resource | v2 path | Example |
|----------|---------|---------|
| Tree directory | `/trees` | lists all public trees as anchors |
| Tree landing | `/tree/{tree-slug}` | `/tree/hass-jensen` |
| Person index (paginated) | `/tree/{tree-slug}/people?page=N` | `…/people?page=3` |
| Surname index | `/tree/{tree-slug}/surnames` → `/surnames/{name}` | `…/surnames/hansdatter` |
| Person | `/tree/{tree-slug}/person/{given}-{surname}-{birthyear}-{id8}` | `…/person/anna-hansdatter-1832-4a1b9c2e` |
| Family / union | `/tree/{tree-slug}/family/{id8}` | spouses + marriage facts + children |
| Book | `/book/{book-slug}-{id8}` | `…/book/hass-jensen-chronicle-7be2a90f` |
| Alternates | append `.md` / `.json` | `…-4a1b9c2e.md` (alias for `?format=`) |

- `{id8}` = first 8 hex chars of the UUID; on the rare per-tree collision, extend to 12.
- Slug generation: lowercase, Danish transliteration (`æ→ae`, `ø→oe`, `å→aa`), strip diacritics,
  hyphens; birthyear omitted when unknown. `family_trees.slug` unique; person slugs are derived
  at render time (only id8 resolves — no `persons.slug` column needed unless we want stable
  slugs after name edits in the *sitemap*, in which case persist at import).
- **Compat:** UUID paths stay parseable forever and 301 to the v2 canonical; sitemap +
  `<link rel="canonical">` + JSON-LD switch to v2. Legacy `?tree=&person=` redirect chain
  collapses to a single hop.
- **Migration surface** (small, thanks to centralization): `publicRoutes.ts` builders/parsers,
  `middleware.ts` regexes, the two edge handlers, sitemap, and a `resolve_tree_slug` +
  id8-prefix person lookup RPC. SPA `App.tsx` route parsing accepts both forms.
- Surname index pages give crawlers keyword-rich intermediate pages (the classic
  genealogy-site pattern) and give agents a filter cheaper than paging 2,148 people.

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
