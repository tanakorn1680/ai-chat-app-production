// lib/providers.js
// Provider registry. Every provider below speaks the OpenAI-compatible
// /chat/completions (SSE) + /models API, so ONE code path serves them all.
// A provider is "configured" (and its models shown in the picker) only when
// its API key env var is set.

export const DEFAULT_MODEL = 'openrouter:cohere/north-mini-code:free';

const BUILTIN = [
  { id: 'openrouter', name: 'OpenRouter',    base: 'https://openrouter.ai/api/v1',                              keyEnv: 'OPENROUTER_API_KEY' },
  { id: 'openai',     name: 'OpenAI',        base: 'https://api.openai.com/v1',                                 keyEnv: 'OPENAI_API_KEY' },
  { id: 'anthropic',  name: 'Anthropic',     base: 'https://api.anthropic.com/v1',                              keyEnv: 'ANTHROPIC_API_KEY' },
  { id: 'google',     name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai',   keyEnv: 'GEMINI_API_KEY' },
  { id: 'groq',       name: 'Groq',          base: 'https://api.groq.com/openai/v1',                            keyEnv: 'GROQ_API_KEY' },
  { id: 'deepseek',   name: 'DeepSeek',      base: 'https://api.deepseek.com/v1',                               keyEnv: 'DEEPSEEK_API_KEY' },
  { id: 'mistral',    name: 'Mistral',       base: 'https://api.mistral.ai/v1',                                 keyEnv: 'MISTRAL_API_KEY' },
  { id: 'xai',        name: 'xAI',           base: 'https://api.x.ai/v1',                                       keyEnv: 'XAI_API_KEY' },
];

// EXTRA_PROVIDERS='[{"id":"together","name":"Together","base":"https://api.together.xyz/v1","keyEnv":"TOGETHER_API_KEY"}]'
// Add "noKey": true for endpoints that need no key (e.g. a local Ollama during `vercel dev`).
function extraProviders() {
  try {
    const list = JSON.parse(process.env.EXTRA_PROVIDERS || '[]');
    return list.filter(p => p && /^[a-z0-9_-]+$/.test(p.id) && typeof p.base === 'string')
               .map(p => ({ ...p, name: p.name || p.id, base: p.base.replace(/\/+$/, '') }));
  } catch {
    console.error('EXTRA_PROVIDERS is not valid JSON — ignored.');
    return [];
  }
}

export const PROVIDERS = (() => {
  const seen = new Set(BUILTIN.map(p => p.id));
  return [...BUILTIN, ...extraProviders().filter(p => !seen.has(p.id))];
})();

const byId = id => PROVIDERS.find(p => p.id === id);

export const providerKey = p => (p.keyEnv ? process.env[p.keyEnv] : '') || '';
export const isConfigured = p => p.noKey === true || !!providerKey(p);
export const configured = () => PROVIDERS.filter(isConfigured);

/** "provider:model-id" → { provider, model }. Ids without a known provider prefix
 *  (e.g. the old "cohere/north-mini-code:free") are treated as OpenRouter ids. */
export function resolveModel(spec) {
  const s = String(spec || process.env.DEFAULT_MODEL || DEFAULT_MODEL).trim();
  const i = s.indexOf(':');
  if (i > 0) {
    const provider = byId(s.slice(0, i));
    if (provider) return { provider, model: s.slice(i + 1) };
  }
  return { provider: byId('openrouter'), model: s };
}

/** Only OpenRouter ":free" models are usable without the access key. */
export const isFree = (provider, model) => provider.id === 'openrouter' && model.endsWith(':free');

/** Extra request headers per provider. */
export function extraHeaders(p, origin) {
  const h = {};
  if (p.id === 'openrouter') { h['HTTP-Referer'] = origin || 'https://vercel.app'; h['X-Title'] = 'AI Chat'; }
  if (p.id === 'anthropic' && process.env.ANTHROPIC_WORKSPACE_ID) h['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
  return h;
}

/* ── Model listing ── */
const NOT_CHAT = /embed|whisper|tts|dall-e|moderation|transcribe|realtime|imagen|veo|aqa|rerank|guard|-image|audio/i;

export function normalizeModel(p, m) {
  const raw = String(m?.id || '').replace(/^models\//, '');
  if (!raw) return null;
  const arch = m.architecture;                       // OpenRouter only
  if (arch?.output_modalities && !arch.output_modalities.includes('text')) return null;
  if (!arch && NOT_CHAT.test(raw)) return null;
  return {
    id: `${p.id}:${raw}`,
    name: m.name || m.display_name || raw,
    provider: p.id,
    free: isFree(p, raw),
    // true / false when the provider tells us, null when unknown (UI then allows images)
    vision: arch?.input_modalities ? arch.input_modalities.includes('image') : (p.id === 'anthropic' ? true : null),
  };
}

export async function listModels(p) {
  const key = providerKey(p);
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  let url = `${p.base}/models`;
  if (p.id === 'anthropic') {                        // native models endpoint uses x-api-key
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    url += '?limit=1000';
  }
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const rows = Array.isArray(j) ? j : (j.data || []);
  return rows.map(m => normalizeModel(p, m)).filter(Boolean);
}
