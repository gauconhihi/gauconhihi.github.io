// providers.js — presets, model discovery, context-window table.
export const KINDS = {
  'openai':            { label: 'OpenAI-compatible', path: '/chat/completions' },
  'openai-responses':  { label: 'OpenAI Responses',    path: '/responses' },
  'anthropic':         { label: 'Anthropic',           path: '/v1/messages' },
  'google':            { label: 'Google Gemini',       path: ':generateContent' },
};

// id, name, base, kind, default model, headers, free-tier friendly
export const PRESETS = [
  { id: 'openai',     name: 'OpenAI',          base: 'https://api.openai.com/v1',                    kind: 'openai',   def: 'gpt-4o-mini' },
  { id: 'anthropic',  name: 'Anthropic',       base: 'https://api.anthropic.com',                     kind: 'anthropic', def: 'claude-sonnet-4-5' },
  { id: 'google',     name: 'Google Gemini',   base: 'https://generativelanguage.googleapis.com/v1beta', kind: 'google', def: 'gemini-2.5-flash' },
  { id: 'openrouter', name: 'OpenRouter',      base: 'https://openrouter.ai/api/v1',                 kind: 'openai',   def: 'anthropic/claude-sonnet-4.5' },
  { id: 'groq',       name: 'Groq',            base: 'https://api.groq.com/openai/v1',                kind: 'openai',   def: 'llama-3.3-70b-versatile' },
  { id: 'deepseek',   name: 'DeepSeek',        base: 'https://api.deepseek.com/v1',                   kind: 'openai',   def: 'deepseek-chat' },
  { id: 'together',   name: 'Together AI',     base: 'https://api.together.xyz/v1',                  kind: 'openai',   def: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { id: 'fireworks',  name: 'Fireworks AI',    base: 'https://api.fireworks.ai/inference/v1',         kind: 'openai',   def: 'accounts/fireworks/models/llama-v3p3-70b-instruct' },
  { id: 'xai',        name: 'xAI Grok',        base: 'https://api.x.ai/v1',                           kind: 'openai',   def: 'grok-2-latest' },
  { id: 'mistral',    name: 'Mistral',         base: 'https://api.mistral.ai/v1',                      kind: 'openai',   def: 'mistral-large-latest' },
  { id: 'cerebras',   name: 'Cerebras',        base: 'https://api.cerebras.ai/v1',                    kind: 'openai',   def: 'llama3.3-70b' },
  { id: 'ollama',     name: 'Ollama (local)',  base: 'http://localhost:11434/v1',                     kind: 'openai',   def: 'llama3.3' },
  { id: 'lmstudio',   name: 'LM Studio (local)', base: 'http://localhost:1234/v1',                    kind: 'openai',   def: 'local-model' },
  { id: 'any-llm',    name: 'Moonshot Kimi',   base: 'https://api.moonshot.ai/v1',                    kind: 'openai',   def: 'kimi-k2-0905-preview' },
  { id: 'siliconflow',name: 'SiliconFlow',     base: 'https://api.siliconflow.cn/v1',                 kind: 'openai',   def: 'Qwen/Qwen3-235B-A22B' },
  { id: '9router',    name: '9Router (⚠ chat bị chặn CORS)', base: 'https://k24zr.cyou/v1', kind: 'openai', def: 'xkiro/stealth/space-bunny-alpha:free' },
];

// context windows. 1M = 1_048_576. extend for unknown models.
const CTX = [
  [/(gemini-[23]|gemini-pro|gemini-3)/i, 1_048_576],
  [/(gemini-)/, 1_048_576],
  [/(space-bunny|claude-(sonnet|opus|fable)|gpt-4o|gpt-5|gpt-4\.1)/, 1_000_000],
  [/(o3|claude-3|deepseek|glm)/, 200_000],
  [/(gpt-3\.5|o1-mini|o1-)/, 128_000],
  [/(qwen|llama|mistral|gpt-oss|grok|agnes)/, 131_072],
];

export function contextWindow(modelId) {
  const id = String(modelId || '');
  for (const [re, n] of CTX) if (re.test(id)) return n;
  return 128_000;
}

export function isMillion(modelId) { return contextWindow(modelId) >= 1_000_000; }

// ---------- headers ----------
// Some gateways only answer the CORS preflight when the request already carries
// Authorization, which blocks browsers entirely. A non-safelisted header such as
// x-api-key skips preflight, so offer it per provider.
// ---------- headers ----------
// Note: the Authorization header is NOT CORS-safelisted, so any browser call
// triggers a preflight. A gateway whose OPTIONS handler errors out (no
// Access-Control-Allow-Origin) therefore cannot be used from a web page at all.
export function authHeaders(p, apiKey) {
  const h = { 'content-type': 'application/json' };
  if (!apiKey) return h;
  switch (p.kind) {
    case 'anthropic':
      h['x-api-key'] = apiKey;
      h['anthropic-version'] = '2023-06-01';
      h['anthropic-dangerous-direct-browser-access'] = 'true';  // required for browser CORS
      return h;
    case 'google':
      h['x-goog-api-key'] = apiKey;
      return h;
  }
  h['authorization'] = 'Bearer ' + apiKey;
  if (p.id === 'openrouter') h['http-referer'] = location.origin;
  return h;
}

// ---------- url building ----------
const trim = (s) => String(s || '').replace(/\/+$/, '');

// Google needs the model in the path: /models/{model}:generateContent
export function chatUrl(p, model) {
  const b = trim(p.base);
  if (p.kind === 'anthropic') return b + '/v1/messages';
  if (p.kind === 'openai-responses') return b + '/responses';
  if (p.kind === 'google') return `${b}/models/${encodeURIComponent(model || 'gemini-2.5-flash')}:generateContent`;
  return b + '/chat/completions';
}

export function modelsUrl(p, apiKey) {
  const b = trim(p.base);
  if (p.kind === 'google') return b + '/models';
  if (p.kind === 'anthropic') return b + '/v1/models';
  return b + '/models';
}

// ---------- discovery ----------
// Returns normalized [{id,label,ctx,raw}]. Throws Error with actionable message.
export async function fetchModels(p, apiKey) {
  const url = modelsUrl(p);
  let res;
  try {
    // /models is a plain GET, so it never hits the preflight problem.
    res = await fetch(url, { headers: authHeaders(p, apiKey) });
  } catch {
    throw new Error('bị chặn CORS. Provider này không cho browser gọi POST (preflight lỗi) — cần proxy, hoặc dùng bản CLI.');
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(apiKey ? 'key bị từ chối (401)' : 'cần API key (401) — /key');
    }
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} từ ${url} ${t.slice(0, 120)}`);
  }
  const j = await res.json();
  const list = j?.data || j?.models || [];
  if (!Array.isArray(list)) throw new Error('response không có danh sách models');
  return list.map(m => normalize(m, p)).filter(m => m.id);
}

function normalize(m, p) {
  const id = m.id || m.name || m.model || m.slug || '';
  // google: "models/gemini-2.5-pro"
  const clean = p.kind === 'google' ? String(id).replace(/^models\//, '') : id;
  const ctx = m.context_length || m.context_window || m.max_context_length ||
              m.contextSize || m.top_provider?.context_length;
  return {
    id: clean,
    label: m.display_name || m.displayName || m.name || clean,
    ctx: Number(ctx) > 0 ? Number(ctx) : contextWindow(clean),
    raw: m,
  };
}

// fallback: ask the user, but pre-guess from the provider default
export function fallbackModels(p) {
  const ctx = contextWindow(p.def || '');
  const list = [p.def].filter(Boolean).map(id => ({ id, label: id, ctx, raw: null }));
  return list;
}

// ---------- provider CRUD ----------
export function upsertProvider(list, p) {
  const i = list.findIndex(x => x.id === p.id);
  if (i >= 0) {
    // Never let a blank form field wipe working config.
    const merged = { ...list[i] };
    for (const [k, v] of Object.entries(p)) {
      if (v === '' || v == null) continue;
      merged[k] = v;
    }
    list[i] = merged;
    return merged;
  }
  // Name matches a preset -> inherit its base/kind so users don't have to retype them.
  const preset = PRESETS.find(x => x.id === p.id || x.name.toLowerCase() === String(p.name || '').toLowerCase());
  const np = preset ? { ...preset, ...p } : p;
  list.push(np);
  return np;
}

export function providerById(id, list) { return list.find(p => p.id === id) || null; }

// which providers can we reach with no key at all?
export const KEYLESS = new Set(['ollama', 'lmstudio']);

export function needsKey(p) { return !KEYLESS.has(p.id); }