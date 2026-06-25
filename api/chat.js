// /api/chat.js
// Vercel Serverless Function — proxies chat requests to OpenRouter.
// The API key lives only in the OPENROUTER_API_KEY environment variable
// (set it in Vercel → Project Settings → Environment Variables).
// It is never sent to or exposed in the browser.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'Server misconfigured: OPENROUTER_API_KEY is not set.' }
    });
  }

  const { messages, model } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages[] is required.' } });
  }

  const MODEL = typeof model === 'string' && model.trim()
    ? model.trim()
    : 'cohere/north-mini-code:free';

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': req.headers.origin || 'https://vercel.app',
        'X-Title': 'AI Chat'
      },
      body: JSON.stringify({ model: MODEL, messages, stream: true })
    });

    if (!upstream.ok || !upstream.body) {
      const errPayload = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({
        error: {
          message: errPayload?.error?.message || `Upstream error: HTTP ${upstream.status}`
        }
      });
    }

    // Stream the SSE response straight through to the client.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }

    res.end();
  } catch (err) {
    console.error('chat.js error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: { message: 'Failed to reach upstream AI provider.' } });
    } else {
      res.end();
    }
  }
}
