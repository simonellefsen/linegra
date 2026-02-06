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
