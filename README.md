# AI Chat

A streaming AI chat interface — dark theme, Thai-language UI, markdown rendering,
image/file attachments, and a lightbox for viewing images full-size. Backed by a
Vercel serverless function that proxies [OpenRouter](https://openrouter.ai).

## ⚠️ Security note (read this first)

The original prototype this was built from had an OpenRouter API key hardcoded
directly in client-side JavaScript. That key was visible to anyone who viewed
the page source, and was exposed to me (Claude) while preparing this project.
**It has not been reused anywhere in this codebase.**

If that key is still active, **revoke it now** at
https://openrouter.ai/keys and generate a new one. Set the new key only as a
Vercel environment variable (`OPENROUTER_API_KEY`) — never paste it into any
file that gets committed to git or shipped to the browser.

This project's `api/chat.js` serverless function holds the key server-side;
the browser never sees it.

## Project structure

```
ai-chat-app/
├── public/
│   ├── index.html     # Frontend UI (static, no secrets)
│   └── styles.css      # All styling
├── api/
│   └── chat.js          # Serverless function — proxies OpenRouter, holds the key
├── .env.example          # Template for required env vars
├── .gitignore
├── vercel.json
├── package.json
└── README.md
```

## Local development

1. Install the Vercel CLI if you don't have it:
   ```bash
   npm install -g vercel
   ```
2. Copy the env template and add your real key:
   ```bash
   cp .env.example .env
   # then edit .env and paste your OpenRouter key
   ```
3. Run the dev server (this runs both the static site and the serverless function):
   ```bash
   vercel dev
   ```
4. Open the printed local URL (typically `http://localhost:3000`).

## Deploying to Vercel

1. Push this folder to a GitHub repository.
2. In the [Vercel dashboard](https://vercel.com/new), import that repo.
3. Before the first deploy (or right after, then redeploy), go to
   **Project Settings → Environment Variables** and add:
   - `OPENROUTER_API_KEY` = your real OpenRouter key
4. Deploy. No other configuration is needed — `vercel.json` already points
   Vercel at `public/` as the static root and registers `api/chat.js` as a function.

## Changing the model

The model is set in two places that should stay in sync:
- `public/index.html` → `const MODEL = '...'` (sent from the browser)
- `api/chat.js` → fallback default if no model is passed

Any model id supported by OpenRouter will work, including paid models — just
be aware of usage costs on your OpenRouter account.

## Notes

- Attachments (images, text/code files) are read in the browser and sent to
  the model as part of the request; nothing is uploaded to separate storage.
- The markdown renderer is a small custom parser (not a full markdown
  library) — it covers headings, bold/italic, inline code, fenced code
  blocks, and lists, which covers typical AI chat output.
- Responsive down to small mobile screens (see the media query at the bottom
  of `styles.css`).
