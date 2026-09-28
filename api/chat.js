// /api/chat.js
// Vercel Serverless Function — streams chat requests to any configured provider
// (see lib/providers.js). API keys live only in environment variables and are
// never sent to the browser.
//
// Access policy:
//   • OpenRouter ":free" models  → open to everyone
//   • every other model          → needs the x-access-key header to equal APP_ACCESS_KEY
//     (if APP_ACCESS_KEY is not set, non-free models are refused)

import { timingSafeEqual } from 'node:crypto';
import { resolveModel, providerKey, isConfigured, isFree, extraHeaders } from '../lib/providers.js';

const MAX_MESSAGES = 200;
const RATE = { windowMs: 60_000, max: 20 };   // per IP, best-effort (per warm instance)
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.clear();
  return recent.length > RATE.max;
}

function hasAccess(req) {
  const secret = process.env.APP_ACCESS_KEY;
  if (!secret) return false;
  const a = Buffer.from(String(req.headers['x-access-key'] || ''));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const fail = (res, status, message, code) =>
  res.status(status).json({ error: { message, ...(code ? { code } : {}) } });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Method not allowed');
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (tooMany(ip)) return fail(res, 429, 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่', 'rate_limited');

  const { messages, model: spec } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return fail(res, 400, `messages[] is required (max ${MAX_MESSAGES}).`);
  }

  const { provider, model } = resolveModel(spec);
  if (!model) return fail(res, 400, 'model is required.');
  if (!isConfigured(provider)) {
    return fail(res, 500, `Server misconfigured: ${provider.keyEnv || provider.id} is not set.`);
  }

  if (!isFree(provider, model) && !hasAccess(req)) {
    return process.env.APP_ACCESS_KEY
      ? fail(res, 401, 'โมเดลนี้ต้องใส่รหัสเข้าใช้งาน', 'access_required')
      : fail(res, 403, 'โมเดลนี้ถูกล็อก — ตั้ง APP_ACCESS_KEY บน server เพื่อเปิดใช้', 'locked');
  }

  // Stop paying for tokens nobody will read if the user closes the tab / hits stop.
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });

  try {
    const upstream = await fetch(`${provider.base}/chat/completions`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(providerKey(provider) ? { Authorization: `Bearer ${providerKey(provider)}` } : {}),
        ...extraHeaders(provider, req.headers.origin)
      },
      body: JSON.stringify({ model, messages, stream: true })
    });

    if (!upstream.ok || !upstream.body) {
      const p = await upstream.json().catch(() => ({}));
      const e = Array.isArray(p) ? p[0] : p;
      return fail(res, upstream.status,
        e?.error?.message || e?.message || `Upstream error: HTTP ${upstream.status}`);
    }

    // Pass raw bytes straight through. Decoding here would corrupt multi-byte
    // characters (Thai) that get split across network chunks.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    if (ac.signal.aborted) return;                 // client left — nothing to send
    console.error('chat.js error:', err);
    if (!res.headersSent) fail(res, 502, 'Failed to reach upstream AI provider.');
    else res.end();
  }
}
