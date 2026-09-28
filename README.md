# AI Chat

A streaming, multi-provider AI chat — dark theme, Thai-language UI, markdown rendering,
image/file attachments. Pick any model from any configured provider in the app.
Backed by two Vercel serverless functions; provider API keys never reach the browser.

## ⚠️ Security note (read this first)

The original prototype had an OpenRouter API key hardcoded in client-side JavaScript.
**If that key is still active, revoke it now** at https://openrouter.ai/keys and create a
new one. Keys belong only in Vercel environment variables — never in a committed file.
`.gitignore` already excludes `.env`.

## Project structure

```
├── public/
│   ├── index.html      # UI (static, no secrets): chat, model picker, attachments
│   └── styles.css
├── api/
│   ├── chat.js         # POST — streams a reply from the chosen model
│   └── models.js       # GET  — lists every model of every configured provider (CDN-cached)
├── lib/providers.js    # Provider registry (one OpenAI-compatible code path for all)
├── .env.example        # Every environment variable, documented
├── vercel.json · package.json · .gitignore
```

## Setup

1. Push to GitHub and import the repo in Vercel.
2. **Project Settings → Environment Variables**, add at least `OPENROUTER_API_KEY`.
3. Deploy. Free OpenRouter models work immediately.

Local: `npm i -g vercel`, `cp .env.example .env`, fill it in, `vercel dev`.

## Adding AIs

A provider appears in the picker as soon as its key is set — no code changes:

| Env var | Provider |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter — hundreds of models from most labs behind one key |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic (via its OpenAI-compatible endpoint) |
| `GEMINI_API_KEY` | Google Gemini |
| `GROQ_API_KEY` · `DEEPSEEK_API_KEY` · `MISTRAL_API_KEY` · `XAI_API_KEY` | Groq · DeepSeek · Mistral · xAI |

Anything else that speaks the OpenAI chat-completions format (Together, Fireworks,
Ollama, LM Studio, a self-hosted vLLM…) goes in `EXTRA_PROVIDERS`, see `.env.example`.

Model ids are `provider:model` (e.g. `openai:gpt-4o`). Old ids without a prefix are
treated as OpenRouter ids. `DEFAULT_MODEL` sets the first-visit model.

> These calls use **API billing** (or free tiers), not a ChatGPT / Claude / Codex
> subscription quota.

## Access control (important once you add paid providers)

`/api/chat` is a public URL. To stop strangers spending your credits:

- **OpenRouter `:free` models** are open to everyone.
- **Every other model** requires the access key: set `APP_ACCESS_KEY` in Vercel to any long
  random string. The app asks for it once (kept in that browser's localStorage) when
  you pick a locked 🔒 model.
- Without `APP_ACCESS_KEY`, non-free models are refused.
- A per-IP limit (20 requests/min) is built in but is best-effort on serverless. For real
  protection also add a rate-limit rule in Vercel Firewall.

## What makes it efficient

- Replies stream as raw bytes end to end (no decode/re-encode → Thai text stays intact).
- Stop button cancels the request **and the upstream call**, so you stop paying for tokens.
- Photos are downscaled to ≤1280 px JPEG in the browser before upload.
- Only the latest 2 image-carrying messages are re-sent; images are dropped for models
  that can't see; oldest turns are trimmed past ~100k characters
  (`MAX_CONTEXT_CHARS`, `KEEP_IMAGES` at the top of the script in `index.html`).
- Text files are cut at 20,000 characters and the chip says so.
- Model list is cached at the CDN for 30 min; rendering is at most once per frame.

## Notes

- `maxDuration` for `/api/chat` is 60 s in `vercel.json`; raise it if your plan allows and
  you use slow reasoning models.
- Markdown is a small custom parser (headings, bold/italic, inline/fenced code, lists).
  All non-code text is HTML-escaped before it is applied.
- Only OpenRouter and the mock/`EXTRA_PROVIDERS` path were exercised in automated tests
  (mock upstream); the other providers use their documented OpenAI-compatible endpoints
  but have not been called with live keys.
