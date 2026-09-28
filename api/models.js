// /api/models.js
// Lists every model from every configured provider (one call each, in parallel).
// The response is identical for all visitors, so the CDN can cache it — the
// picker opens instantly and providers are not hit on every page load.

import { configured, listModels, DEFAULT_MODEL } from '../lib/providers.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const providers = configured();
  const settled = await Promise.allSettled(providers.map(listModels));

  const models = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') models.push(...r.value);
    else errors.push(`${providers[i].name}: ${r.reason?.message || 'failed'}`);
  });

  res.setHeader('Cache-Control',
    errors.length ? 'public, s-maxage=60' : 'public, s-maxage=1800, stale-while-revalidate=86400');
  res.status(200).json({
    default: process.env.DEFAULT_MODEL || DEFAULT_MODEL,
    gated: !!process.env.APP_ACCESS_KEY,
    providers: providers.map(p => ({ id: p.id, name: p.name })),
    models,
    errors
  });
}
