<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1pWfS3iW2IEOX4MJO3XMvFjAs7UmzdLXV

## Run Locally

**Prerequisites:**  Node.js
  
> AI integration now uses OpenRouter. See `docs/AI_SETUP.md` for required `OPENROUTER_API_KEY` instructions before running locally or on CI.


1. Install dependencies:
   `npm install`
2. Create `.env.local` with `OPENROUTER_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` values (see `docs/AI_SETUP.md` + `docs/SUPABASE_SETUP.md`)
3. Run the app:
   `npm run dev`

## Super Administrator Login

Linegra currently ships with a single local super administrator account. Use the header
**Login** button and enter the bootstrap credentials:

| Username | Password |
|----------|----------|
| `linegra` | `linegra` |

On the first successful login you must immediately set a new username and password;
this prompt cannot be skipped and ensures the archive is secured before edits occur.
Updated credentials are stored in the browser/Electron `localStorage`, so if you clear
storage or move to a new machine you will need to repeat the bootstrap process. Multi‑user
registration is not yet available—only this super administrator can add, edit, or delete
archival data in the current release.
