// api.js — streaming for 4 wire formats, with reasoning + tool-call events.
import { chatUrl, authHeaders } from './providers.js';

export class Aborted extends Error {
  constructor() { super('aborted'); this.name = 'Aborted'; }
}

export function estTokens(str) {
  const cjk = (str.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  return Math.ceil((str.length + cjk * 2) / 3.6);
}

function buildBody(p, { model, system, messages, temp, maxTokens }) {
  if (p.kind === 'anthropic') {
    return {
      model, max_tokens: maxTokens, temperature: temp,
      ...(system ? { system } : {}),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    };
  }
  if (p.kind === 'openai-responses') {
    return {
      model,
      input: [
        ...(system ? [{ role: 'system', content: [{ type: 'input_text', text: system }] }] : []),
        ...messages.map(m => ({ role: m.role, content: [{ type: 'input_text', text: m.content }] })),
      ],
      temperature: temp, max_output_tokens: maxTokens, stream: true,
    };
  }
  if (p.kind === 'google') {
    return {
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: temp, maxOutputTokens: maxTokens },
    };
  }
  return {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
    temperature: temp, max_tokens: maxTokens, stream: true,
  };
}

/**
 * Handlers: onDelta(text) | onReasoning(text) | onToolStart(key,{name})
 *           onToolArgs(key,frag) | onToolEnd(key,{name,args})
 * Resolves { text, reasoning, tools, usage, raw }
 */
export async function streamChat(p, apiKey, opts, handlers = {}) {
  const { onDelta, onReasoning, onToolStart, onToolArgs, onToolEnd, signal } = handlers;

  const res = await fetch(chatUrl(p, opts.model), {
    method: 'POST',
    headers: authHeaders(p, apiKey),
    body: JSON.stringify(buildBody(p, opts)),
    signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let msg = t;
    try { const j = JSON.parse(t); msg = j?.error?.message || j?.message || t; } catch { }
    const err = new Error(`HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}: ${String(msg).slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }

  const ctype = res.headers.get('content-type') || '';
  const sse = ctype.includes('event-stream') || ctype.includes('x-ndjson');

  // Server ignored stream:true -> single plain JSON body.
  if (!res.body || !sse) {
    const j = await res.json();
    const { text, reasoning, toolList } = readWhole(p, j);
    for (const t of toolList) { onToolStart?.(t.key, t); onToolEnd?.(t.key, t); }
    if (reasoning) onReasoning?.(reasoning);
    if (text) onDelta?.(text);
    return { text, reasoning, tools: toolList, usage: normalizeUsage(p, j?.usage || j?.usageMetadata), raw: j };
  }

  const tools = new Map();
  const blockMode = new Map();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', reasoning = '', usage = null, raw = null;

  const feed = (j) => {
    raw = j;
    if (p.kind === 'anthropic') {
      if (j.type === 'content_block_start') {
        const i = j.index, cb = j.content_block || {};
        if (cb.type === 'thinking') blockMode.set(i, 'thinking');
        else if (cb.type === 'redacted_thinking') { blockMode.set(i, 'thinking'); onReasoning?.('[nội dung suy nghĩ đã bị ẩn]'); }
        else if (cb.type === 'tool_use') {
          blockMode.set(i, 'tool');
          const key = 'a:' + i;
          tools.set(key, { key, id: cb.id, name: cb.name, args: '' });
          onToolStart?.(key, { name: cb.name });
        } else blockMode.set(i, 'text');
      }
      if (j.type === 'content_block_delta') {
        const d = j.delta || {}, mode = blockMode.get(j.index);
        if (d.type === 'thinking_delta' && d.thinking) { reasoning += d.thinking; onReasoning?.(d.thinking); }
        else if (d.type === 'input_json_delta' && d.partial_json) {
          const key = 'a:' + j.index, t = tools.get(key);
          if (t) { t.args += d.partial_json; onToolArgs?.(key, d.partial_json); }
        } else if (d.type === 'text_delta' && d.text) { text += d.text; onDelta?.(d.text); }
      }
      if (j.type === 'message_delta' && j.usage) usage = { ...(usage || {}), ...j.usage };
      if (j.type === 'message_start' && j.message?.usage) usage = { ...(usage || {}), ...j.message.usage };
      return;
    }

    if (p.kind === 'openai-responses') {
      if (j.type === 'response.reasoning_summary_text.delta' || j.type === 'response.reasoning_text.delta') {
        const d = j.delta || ''; if (d) { reasoning += d; onReasoning?.(d); } return;
      }
      if (j.type === 'response.output_text.delta' && typeof j.delta === 'string') { text += j.delta; onDelta?.(j.delta); return; }
      if (j.type === 'response.output_item.added' && j.item?.type === 'function_call') {
        const key = 'r:' + j.output_index;
        tools.set(key, { key, name: j.item.name, args: '' });
        onToolStart?.(key, { name: j.item.name });
      }
      if (j.type === 'response.function_call_arguments.delta') {
        const key = 'r:' + j.output_index, t = tools.get(key);
        if (t) { t.args += j.delta; onToolArgs?.(key, j.delta); }
      }
      if (j.type === 'response.output_item.done' && j.item?.type === 'function_call') {
        const key = 'r:' + j.output_index;
        const t = tools.get(key) || { key, name: j.item.name, args: j.item.arguments || '' };
        tools.set(key, t); onToolEnd?.(key, t);
      }
      if (j.response?.usage) usage = j.response.usage;
      return;
    }

    // OpenAI-compatible: reasoning_content (DeepSeek/Qwen) or reasoning (OpenRouter)
    const d = j.choices?.[0]?.delta;
    if (d) {
      const r = d.reasoning_content ?? d.reasoning;
      if (typeof r === 'string' && r) { reasoning += r; onReasoning?.(r); }
      if (typeof d.content === 'string' && d.content) { text += d.content; onDelta?.(d.content); }
      for (const tc of d.tool_calls || []) {
        const key = 'o:' + tc.index;
        if (!tools.has(key)) { tools.set(key, { key, id: tc.id, name: '', args: '' }); onToolStart?.(key, { name: '' }); }
        const t = tools.get(key);
        if (tc.function?.name && !t.name) { t.name = tc.function.name; onToolStart?.(key, { name: t.name }); }
        if (tc.function?.arguments) { t.args += tc.function.arguments; onToolArgs?.(key, tc.function.arguments); }
      }
    }
    if (j.usage) usage = j.usage;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) consume(line, feed);
    }
    if (buf.trim()) consume(buf, feed);
  } catch (e) {
    if (signal?.aborted || e?.name === 'AbortError') throw new Aborted();
    throw e;
  } finally {
    try { reader.releaseLock(); } catch { }
  }

  for (const t of tools.values()) onToolEnd?.(t.key, t);
  return { text, reasoning, tools: [...tools.values()], usage: normalizeUsage(p, usage), raw };
}

function consume(line, feed) {
  const s = line.trim();
  if (!s || s.startsWith(':') || s === 'data: [DONE]' || !s.startsWith('data:')) return;
  const j = tryJson(s.slice(5).trim());
  if (j) feed(j);
}

function readWhole(p, j) {
  const toolList = [];
  let text = '', reasoning = '';
  if (Array.isArray(j)) j = j[0];

  if (p.kind === 'anthropic') {
    for (const c of j?.content || []) {
      if (c.type === 'thinking') reasoning += c.thinking || '';
      else if (c.type === 'redacted_thinking') reasoning += '[ẩn]';
      else if (c.type === 'tool_use') toolList.push({ key: 'a:' + toolList.length, id: c.id, name: c.name, args: JSON.stringify(c.input ?? {}) });
      else text += c.text || '';
    }
  } else if (p.kind === 'google') {
    for (const part of j?.candidates?.[0]?.content?.parts || []) {
      if (part.thought) reasoning += part.text || '';
      else if (part.functionCall) toolList.push({ key: 'g:' + toolList.length, name: part.functionCall.name, args: JSON.stringify(part.functionCall.args ?? {}) });
      else text += part.text || '';
    }
  } else if (p.kind === 'openai-responses') {
    text = j?.output_text || '';
    for (const o of j?.output || []) {
      if (o.type === 'reasoning') for (const s of o.summary || []) reasoning += s.text || '';
      if (o.type === 'function_call') toolList.push({ key: 'r:' + toolList.length, name: o.name, args: o.arguments || '' });
    }
  } else {
    const m = j?.choices?.[0]?.message || {};
    reasoning = m.reasoning_content || m.reasoning || '';
    text = m.content || '';
    for (const tc of m.tool_calls || []) toolList.push({ key: 'o:' + tc.index, id: tc.id, name: tc.function?.name || '', args: tc.function?.arguments || '' });
  }
  return { text, reasoning, toolList };
}

function tryJson(s) { try { return JSON.parse(s); } catch { return null; } }

export function normalizeUsage(p, u) {
  if (!u) return null;
  if (p.kind === 'google') {
    return { in: u.promptTokenCount ?? null, out: u.candidatesTokenCount ?? null, total: u.totalTokenCount ?? null, think: u.thoughtsTokenCount ?? null };
  }
  return {
    in: u.input_tokens ?? u.prompt_tokens ?? null,
    out: u.output_tokens ?? u.completion_tokens ?? null,
    total: u.total_tokens ?? null,
    think: u.reasoning_tokens ?? null,
  };
}