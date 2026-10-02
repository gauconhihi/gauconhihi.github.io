// app.js — sidebar + chat UI, slash commands, send loop with reasoning & tool frames.
import * as store from './store.js';
import { state, ls } from './store.js';
import { Vault, HAS_CRYPTO } from './vault.js';
import * as P from './providers.js';
import { streamChat, Aborted, estTokens } from './api.js';
import { parse, COMMANDS } from './commands.js';

const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

const vault = new Vault(localStorage);
const ui = {};
let abortCtl = null;
let selProvider = null, selModel = null;

// ===================== markdown =====================
function inline(target, text) {
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(__[^_]+__)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) target.appendChild(document.createTextNode(text.slice(last, m.index)));
    const tok = m[0];
    if (tok[0] === '`') target.appendChild(el('code', null, tok.slice(1, -1)));
    else if (tok.startsWith('**') || tok.startsWith('__')) target.appendChild(el('strong', null, tok.slice(2, -2)));
    else target.appendChild(el('em', null, tok.slice(1, -1)));
    last = m.index + tok.length;
  }
  if (last < text.length) target.appendChild(document.createTextNode(text.slice(last)));
}

function renderMarkdown(node, src) {
  node.textContent = '';
  const lines = String(src ?? '').split('\n');
  let i = 0;
  const flushInline = (s) => { const d = el('div'); inline(d, s); node.appendChild(d); return d; };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const pre = el('pre');
      pre.appendChild(el('code', null, body.join('\n')));
      node.appendChild(pre);
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { node.appendChild(el('h' + Math.min(3, h[1].length), null)); inline(node.lastChild, h[2]); i++; continue; }

    if (/^\s*([-*+])\s+/.test(line)) {
      const ul = el('ul');
      while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) {
        const li = el('li');
        inline(li, lines[i].replace(/^\s*([-*+])\s+/, ''));
        ul.appendChild(li); i++;
      }
      node.appendChild(ul); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const ol = el('ol');
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const li = el('li');
        inline(li, lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        ol.appendChild(li); i++;
      }
      node.appendChild(ol); continue;
    }
    if (/^>\s?/.test(line)) {
      const bq = el('blockquote');
      while (i < lines.length && /^>\s?/.test(lines[i])) { bq.appendChild(document.createTextNode(lines[i++].replace(/^>\s?/, ''))); }
      node.appendChild(bq); continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const tbl = el('table'), thead = el('thead'), tr = el('tr');
      line.split('|').slice(1, -1).forEach(c => { const th = el('th', null); inline(th, c.trim()); tr.appendChild(th); });
      thead.appendChild(tr); tbl.appendChild(thead);
      const tb = el('tbody'); i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const r = el('tr');
        lines[i].split('|').slice(1, -1).forEach(c => { const td = el('td'); inline(td, c.trim()); r.appendChild(td); });
        tb.appendChild(r); i++;
      }
      tbl.appendChild(tb); node.appendChild(tbl); continue;
    }

    // paragraph: consume until blank line or a block starter
    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(```|#{1,4}\s|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    const d = flushInline(para.join('\n'));
    d.style.whiteSpace = 'pre-wrap';
    d.style.margin = '.5em 0';
  }
}

function previewMarkdown(node, src) {
  try { renderMarkdown(node, src); } catch { node.textContent = String(src ?? ''); }
}

// ===================== turn rendering =====================
function renderTurn(msg) {
  const wrap = el('div', 'turn ' + (msg.role === 'user' ? 'u' : 'a'));
  wrap.appendChild(el('div', 'avatar', msg.role === 'user' ? 'YOU' : 'AI'));
  const body = el('div', 'body');

  if (msg.role === 'user') {
    body.appendChild(el('div', 'u-text', msg.content));
    wrap.appendChild(body);
    return wrap;
  }

  const txt = el('div', 'a-text');
  previewMarkdown(txt, msg.content || '');
  body.appendChild(txt);

  if (msg.reasoning) body.appendChild(frame('think', `◆ suy nghĩ · ${msg.reasoning.length} ký tự`, msg.reasoning));
  for (const t of msg.tools || []) {
    body.appendChild(frame('tool', `⌁ ${t.name || 'tool'}`, prettyArgs(t.args)));
  }

  if (msg.usage || msg.ms || msg.model) {
    const meta = el('div', 'meta');
    if (msg.model) meta.appendChild(chip(msg.model.modelId));
    if (msg.ms) meta.appendChild(chip(msg.ms + ' ms'));
    if (msg.usage?.total) meta.appendChild(chip(fmtN(msg.usage.total) + ' tok'));
    if (msg.usage?.think) meta.appendChild(chip('◆ ' + fmtN(msg.usage.think) + ' think', 'think'));
    if (msg.usage?.in) meta.appendChild(chip('↑ ' + fmtN(msg.usage.in)));
    if (msg.usage?.out) meta.appendChild(chip('↓ ' + fmtN(msg.usage.out)));
    body.appendChild(meta);
  }
  wrap.appendChild(body);
  return wrap;
}

function frame(kind, label, content) {
  const d = el('details', 'frame ' + kind);
  const s = el('summary');
  s.appendChild(el('span', 'caret', '▶'));
  s.appendChild(el('span', null, label));
  d.appendChild(s);
  d.appendChild(el('div', 'content', content));
  if (kind === 'think') d.open = false;
  return d;
}
const chip = (t, c) => el('span', 'chip' + (c ? ' ' + c : ''), t);
const fmtN = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
const prettyArgs = (a) => { try { return JSON.stringify(JSON.parse(a), null, 2); } catch { return a || ''; } };

function sysLine(html) {
  const s = el('div', 'sys');
  s.appendChild(el('div', 'avatar', '·'));
  const b = el('div', 'body');
  inline(b, html);
  s.appendChild(b);
  return s;
}

// ===================== log =====================
function logNode() {
  const log = $('#log');
  let w = log.querySelector('.wrap');
  if (!w) { w = el('div', 'wrap'); log.appendChild(w); }
  return w;
}

function rerender() {
  const log = $('#log'); log.textContent = '';
  const msgs = store.curChat().msgs;
  for (const m of msgs) logNode().appendChild(renderTurn(m));
  if (!msgs.length) {
    const w = logNode();
    w.appendChild(sysLine('Xin chào. Gõ **/help** xem lệnh, **/provider** để thêm API, **/model** để chọn model.'));
  }
  scroll();
  refreshChrome();
}

function scroll() { const l = $('#log'); l.scrollTop = l.scrollHeight; }

// ===================== send =====================
function activeProvider() { return state.providers.find(p => p.id === selProvider) || null; }
function currentModelInfo() {
  if (!selModel || !selProvider) return null;
  const c = state.catalog[selProvider] || [];
  return c.find(m => m.id === selModel) || { id: selModel, ctx: P.contextWindow(selModel), label: selModel };
}
function estContextTokens() {
  let n = 0;
  for (const m of store.curChat().msgs) n += estTokens(m.content) + (m.reasoning ? estTokens(m.reasoning) : 0) + 4;
  return n;
}

const SYSTEM = 'Bạn là trợ lý AI dùng trong một CLI. Trả lời súc tích, chính xác, dùng markdown khi hữu ích (tiêu đề, list, bảng, code block). Ngôn ngữ: tiếng Việt trừ khi user viết tiếng Anh.';

async function send(text) {
  if (abortCtl) { sysLine('đang chạy — **/stop** hoặc Esc để dừng.'); return; }

  const p = activeProvider();
  if (!p) { sysLine('chưa chọn provider — **/provider**'); return ui.openProviders(); }
  const info = currentModelInfo();
  if (!info) { sysLine('chưa chọn model — **/model**'); return ui.openModel(); }

  let key = vault.getKey(p.id);
  if (!key && P.needsKey(p)) {
    sysLine(`🔐 **${p.name}** cần API key — /key`);
    return ui.openVault(p.id);
  }

  const chat = store.curChat();
  chat.msgs.push({ role: 'user', content: text, ts: Date.now() });
  maybeTitle(text);
  store.saveChat();
  const w = logNode();
  w.appendChild(renderTurn(chat.msgs.at(-1)));
  scroll();

  const msgs = chat.msgs.filter(m => m.role === 'user' || m.role === 'assistant').slice(-100);

  // live assistant turn
  const turn = el('div', 'turn a');
  turn.appendChild(el('div', 'avatar', 'AI'));
  const body = el('div', 'body');
  const thinkBox = el('details', 'frame think');
  const thinkSum = el('summary');
  thinkSum.appendChild(el('span', 'caret', '▶'));
  const thinkLabel = el('span', null, '◆ đang suy nghĩ…');
  thinkSum.appendChild(thinkLabel);
  thinkBox.appendChild(thinkSum);
  const thinkBody = el('div', 'content');
  thinkBox.appendChild(thinkBody);

  const txt = el('div', 'a-text');
  const toolHost = el('div');
  const meta = el('div', 'meta');
  body.appendChild(thinkBox);
  body.appendChild(toolHost);
  body.appendChild(txt);
  body.appendChild(meta);
  turn.appendChild(body);
  w.appendChild(turn);
  scroll();

  const frames = new Map();
  let acc = '', reasoning = '';
  const ctl = new AbortController();
  abortCtl = ctl;
  setBusy(true);

  const t0 = performance.now();
  try {
    const res = await streamChat(p, key, {
      model: selModel, system: SYSTEM, messages: msgs,
      temp: state.settings.temp, maxTokens: state.settings.maxTokens,
    }, {
      signal: ctl.signal,
      onReasoning: (d) => {
        reasoning += d;
        thinkBody.textContent = reasoning;
        thinkBox.hidden = false;
        $('#thinking').hidden = false;
        $('#thinking-txt').textContent = reasoning.slice(-90).replace(/\s+/g, ' ');
        scroll();
      },
      onDelta: (d) => {
        acc += d;
        $('#thinking').hidden = true;
        previewMarkdown(txt, acc);
        scroll();
      },
      onToolStart: (k, t) => {
        const f = frame('tool', `⌁ ${t.name || 'đang gọi…'}`, '');
        f.dataset.k = k;
        frames.set(k, f);
        toolHost.appendChild(f);
        thinkBox.hidden = true;
        $('#thinking').hidden = true;
        scroll();
      },
      onToolArgs: (k, frag) => {
        const f = frames.get(k);
        if (!f) return;
        const c = f.querySelector('.content');
        c.dataset.raw = (c.dataset.raw || '') + frag;
        c.textContent = prettyArgs(c.dataset.raw);
      },
      onToolEnd: (k, t) => {
        const f = frames.get(k);
        if (!f) return;
        f.querySelector('summary span:nth-child(2)').textContent = `⌁ ${t.name || 'tool'}`;
        f.querySelector('.content').textContent = prettyArgs(t.args || f.querySelector('.content').dataset.raw);
      },
    });

    const ms = Math.round(performance.now() - t0);
    if (reasoning) { thinkBody.textContent = reasoning; thinkLabel.textContent = `◆ suy nghĩ · ${fmtN(reasoning.length)} ký tự`; }
    else thinkBox.remove();

    const m = { role: 'assistant', content: res.text || '(rỗng)', reasoning, tools: res.tools, usage: res.usage, ms, model: { providerId: p.id, modelId: selModel }, ts: Date.now() };
    chat.msgs.push(m);
    store.saveChat();

    // swap live turn for the persisted one
    turn.replaceWith(renderTurn(m));
    previewMarkdown(txt, acc);
    scroll();
  } catch (e) {
    const aborted = e instanceof Aborted || e?.name === 'AbortError';
    const m = { role: 'assistant', content: acc || (aborted ? '_(đã dừng)_' : ''), reasoning, ms: Math.round(performance.now() - t0), model: { providerId: p.id, modelId: selModel }, ts: Date.now(), error: aborted ? 'aborted' : (e.message || String(e)) };
    if (!aborted) m.content = '⚠️ **LỖI**\n\n' + (e.message || String(e));
    chat.msgs.push(m);
    store.saveChat();
    turn.replaceWith(renderTurn(m));
    turn.querySelector('.avatar').style.background = aborted ? 'var(--dim)' : 'var(--err)';
    if (!aborted) {
      thinkBox.remove();
      sysLine('kiểm tra: key (**/key**), base URL (**/provider**), model (**/model**)');
    }
  } finally {
    abortCtl = null;
    setBusy(false);
    refreshChrome();
    scroll();
  }
}

function maybeTitle(text) {
  const c = store.curChat();
  if (c.title === 'chat mới' && c.msgs.filter(m => m.role === 'user').length === 1) {
    c.title = text.slice(0, 48);
    store.saveChat();
  }
}

function setBusy(on) {
  $('#btn-stop').hidden = !on;
  $('#btn-send').disabled = on;
  if (!on) $('#thinking').hidden = true;
}

// ===================== chrome =====================
function refreshChrome() {
  const p = activeProvider(), m = currentModelInfo();

  $('#prov-label').textContent = p ? p.name : 'chọn provider';
  $('#model-label').textContent = m ? m.id : 'chọn model';
  $('#top-title').textContent = store.curChat().title;
  $('#prov-dot').className = 'dot' + (p ? (vault.getKey(p.id) || !P.needsKey(p) ? ' on' : ' off') : '');
  $('#vault-label').textContent = vault.unlocked ? 'khoá ✓' : 'khoá';
  $('#vault-dot').className = 'dot' + (vault.unlocked ? ' on' : '');

  const info = m, used = estContextTokens();
  const badge = $('#ctx-badge');
  if (info) {
    const pct = Math.round(used / info.ctx * 100);
    badge.textContent = `ctx ${pct}% · ${fmtN(info.ctx)}${info.ctx >= 1e6 ? ' · 1M' : ''}`;
    badge.classList.toggle('warn', pct > 85);
    badge.title = `~${used.toLocaleString()} / ${info.ctx.toLocaleString()} tokens`;
  } else { badge.textContent = 'ctx'; badge.classList.remove('warn'); }

  renderSessions();
}

function renderSessions() {
  const box = $('#sessions'); box.textContent = '';
  for (const c of store.chatList()) {
    const s = el('div', 'sess' + (c.id === state.current ? ' on' : ''));
    const t = el('div', 't', c.title);
    t.onclick = () => { loadChat(c.id); };
    const del = el('button', 'del', '×');
    del.title = 'xoá';
    del.onclick = (e) => {
      e.stopPropagation();
      if (!confirm(`xoá "${c.title}"?`)) return;
      store.delChat(c.id);
      if (!state.current) store.newChat();
      rerender();
    };
    s.append(t, del);
    box.appendChild(s);
  }
}

function loadChat(id) {
  state.current = id; ls.set('current', id);
  const c = store.curChat();
  selProvider = c.model?.providerId ?? null;
  selModel = c.model?.modelId ?? null;
  document.querySelector('#side').classList.remove('open');
  rerender();
}

// ===================== dialogs =====================
let vaultFocus = null;

function soleOpen(except) {
  for (const d of document.querySelectorAll('dialog')) if (d !== except && d.open) d.close();
}

ui.openProviders = () => {
  const d = $('#d-prov'); soleOpen(d);
  renderProvList();
  const p = activeProvider();
  if (p) { $('#f-name').value = p.name; $('#f-url').value = p.base; $('#f-kind').value = p.kind; }
  else { $('#f-name').value = ''; $('#f-url').value = ''; }
  d.showModal();
};

ui.openModel = () => {
  const d = $('#d-model'); soleOpen(d);
  $('#f-model-q').value = '';
  renderModelList();
  d.showModal();
  $('#f-model-q').focus();
};

ui.openVault = (pid) => {
  const d = $('#d-vault'); soleOpen(d);
  vaultFocus = pid;
  renderVaultState();
  d.showModal();
  $('#v-pass').focus();
};

ui.openCmd = (rows) => {
  const d = $('#d-cmd'); soleOpen(d);
  const box = $('#cmd-list'); box.textContent = '';
  for (const r of rows) {
    const row = el('div', 'cmdrow');
    row.appendChild(el('span', 'c', r.c + (r.a ? ' ' + r.a : '')));
    row.appendChild(el('span', 'd', r.d));
    row.onclick = () => { d.close(); $('#in').value = r.c.split(' ')[0]; $('#in').focus(); };
    box.appendChild(row);
  }
  d.showModal();
};

ui.toggleTheme = () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  store.saveTheme();
};

function renderProvList() {
  const box = $('#prov-list'); box.textContent = '';
  if (!state.providers.length) { box.appendChild(el('div', 'empty', 'chưa có provider')); return; }
  for (const p of state.providers) {
    const hasKey = !!vault.getKey(p.id);
    const n = (state.catalog[p.id] || []).length;
    const item = el('div', 'pitem' + (p.id === selProvider ? ' on' : ''));
    const info = el('div', 'info');
    info.appendChild(el('div', 'nm', p.name));
    const sub = el('div', 'sub');
    sub.textContent = `${p.kind} · ${n ? n.toLocaleString() : 0} models · `;
    const keyMark = el('b', null, hasKey ? 'có key' : (P.KEYLESS.has(p.id) ? 'no-key' : 'cần key'));
    sub.appendChild(keyMark);
    info.appendChild(sub);
    item.appendChild(info);

    const del = el('button', 'btn danger', '✕');
    del.onclick = (e) => {
      e.stopPropagation();
      if (!confirm(`xoá provider "${p.name}"?`)) return;
      state.providers = state.providers.filter(x => x.id !== p.id);
      delete state.catalog[p.id];
      vault.delKey(p.id);
      store.saveProviders(); store.saveCatalog();
      if (selProvider === p.id) { selProvider = selModel = null; }
      renderProvList(); refreshChrome();
    };
    item.appendChild(del);
    item.onclick = () => { selectProvider(p.id); $('#d-prov').close(); };
    box.appendChild(item);
  }
}

function renderModelList() {
  const box = $('#model-list'); box.textContent = '';
  const q = $('#f-model-q').value.trim().toLowerCase();
  const total = (state.catalog[selProvider] || []).length;
  if (!selProvider) { box.appendChild(el('div', 'empty', 'chưa chọn provider — /provider')); return; }
  const all = state.catalog[selProvider] || [];
  const list = q ? all.filter(m => m.id.toLowerCase().includes(q) || String(m.label || '').toLowerCase().includes(q)) : all;
  if (!list.length) { box.appendChild(el('div', 'empty', q ? 'không khớp lọc' : 'chưa load được model')); return; }

  const CAP = 300;
  const shown = list.slice(0, CAP);
  for (const m of shown) {
    const item = el('div', 'pitem' + (m.id === selModel ? ' on' : ''));
    const info = el('div', 'info');
    info.appendChild(el('div', 'nm', m.label !== m.id ? m.label : m.id));
    info.appendChild(el('div', 'sub', `${fmtN(m.ctx)} ctx${m.ctx >= 1e6 ? ' · 1M+' : ''}${m.id !== m.label ? ' · ' + m.id : ''}`));
    item.appendChild(info);
    item.onclick = () => { selModel = m.id; persistSel(); $('#d-model').close(); };
    box.appendChild(item);
  }
  if (list.length > CAP) {
    box.appendChild(el('div', 'empty', `…còn ${list.length - CAP} nữa — gõ để lọc`));
  }
  $('#model-count').textContent = q ? `${fmtN(list.length)}/${fmtN(total)}` : fmtN(total);
}

function renderVaultState() {
  const p = state.providers.find(x => x.id === vaultFocus);
  const t = !HAS_CRYPTO ? 'Trình duyệt không có WebCrypto — không mã hoá được, key sẽ không lưu.'
    : !vault.exists ? 'Chưa có vault. Nhập mật khẩu → tạo mới.'
    : vault.unlocked ? `✔ Đang mở · ${vault.listKeys().length} key đã lưu` + (p ? ` · đang chỉnh: ${p.name}` : '')
    : 'Vault tồn tại, đang khoá.';
  const box = $('#v-state');
  box.textContent = t;

  // show exactly which providers hold a key so nothing is ambiguous
  let list = $('#v-list');
  if (!list) return;
  list.textContent = '';
  if (!vault.unlocked) return;
  const have = vault.listKeys();
  if (!have.length) {
    list.appendChild(el('div', 'empty', 'chưa lưu key nào — nhập ở /provider'));
    return;
  }
  for (const id of have) {
    const pr = state.providers.find(x => x.id === id);
    list.appendChild(el('div', 'item', `${pr?.name || id} · đã mã hoá`));
  }
}

// ===================== provider ops =====================
async function selectProvider(id) {
  selProvider = id;
  const p = state.providers.find(x => x.id === id);
  selModel = (state.catalog[id] || [])[0]?.id || p?.def || null;
  persistSel();
  refreshChrome();
  if (!(state.catalog[id] || []).length) await loadModels(id, true);
  else ui.openModel();
}

async function loadModels(id, quiet, transientKey) {
  const p = state.providers.find(x => x.id === id);
  if (!p) return [];
  const key = vault.getKey(id) || transientKey || '';
  try {
    const list = await P.fetchModels(p, key);
    state.catalog[id] = list;
    store.saveCatalog();
    if (!quiet) sysLine(`✔ **${p.name}** — ${list.length.toLocaleString()} models`);
    return list;
  } catch (e) {
    if (!(state.catalog[id] || []).length) {
      state.catalog[id] = P.fallbackModels(p);
      store.saveCatalog();
    }
    sysLine(`⚠ **${p.name}**: ${e.message}. ${(state.catalog[id] || []).length ? 'Giữ list cũ.' : 'Thử lại: /key hoặc /provider.'}`);
    return state.catalog[id];
  }
}

function persistSel() {
  const c = store.curChat();
  c.model = selProvider ? { providerId: selProvider, modelId: selModel } : null;
  store.saveChat();
  refreshChrome();
}

// ===================== input =====================
function updateHint() {
  const v = $('#in').value.trimStart();
  const p = parse(v);
  const h = $('#hint');
  if (p && p.cmd) h.textContent = `/${p.cmd.name} — ${p.cmd.desc}`;
  else if (p) h.textContent = `lệnh lạ: /${p.name}`;
  else {
    const info = currentModelInfo();
    h.textContent = info
      ? `${info.id} · Enter gửi · Shift+Enter xuống dòng · Esc dừng · /help`
      : 'chọn provider & model trước: /provider';
  }
}

async function submit() {
  const inp = $('#in');
  const raw = inp.value;
  if (!raw.trim()) return;
  inp.value = ''; inp.style.height = 'auto'; updateHint();

  const parsed = parse(raw);
  if (parsed) {
    if (!parsed.cmd) return sysLine(`lệnh lạ: **/${parsed.name}** — xem /help`);
    const out = await parsed.cmd.run(parsed.arg, ctx);
    if (typeof out === 'string' && out) sysLine(out);
    refreshChrome();
    return;
  }
  await send(raw.trim());
}

// ===================== ctx =====================
const ctx = {
  state, vault, store, ui,
  get selProvider() { return selProvider; },
  activeProvider, currentModelInfo, estContextTokens,
  abort: () => abortCtl?.abort(),
  send,
  chat: {
    cur: () => store.curChat(),
    newChat: (t) => { store.newChat(t); selProvider = null; selModel = null; rerender(); },
    rerender,
  },
};

// ===================== init =====================
function wire() {
  $('#btn-send').onclick = submit;
  $('#btn-stop').onclick = () => abortCtl?.abort();
  $('#newchat').onclick = () => ctx.chat.newChat();
  $('#sb-provider').onclick = () => ui.openProviders();
  $('#sb-model').onclick = () => ui.openModel();
  $('#sb-keys').onclick = () => ui.openVault(selProvider);
  $('#sb-theme').onclick = () => ui.toggleTheme();
  $('#sb-help').onclick = () => COMMANDS.help.run('', ctx);

  const inp = $('#in');
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') abortCtl?.abort();
  });
  inp.addEventListener('input', () => {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 200) + 'px';
    updateHint();
  });

  $('#f-model-q').oninput = renderModelList;
  $('#f-load').onclick = async () => {
    const name = $('#f-name').value.trim();
    if (!name) return sysLine('cần tên provider trước');
    const id = saveFormOnly();
    const pending = $('#f-key').value.trim();   // dùng tạm để probe, chưa cần vault mở
    const n = await loadModels(id, false, pending);
    selProvider = id;
    if (!selModel) selModel = (state.catalog[id] || [])[0]?.id || null;
    persistSel();
    renderProvList();
    renderModelList();
    if (!n.length) return sysLine('không có model nào để chọn');
  };
  $('#f-save').onclick = async () => {
    const name = $('#f-name').value.trim();
    if (!name) return sysLine('cần tên provider');
    const id = saveFormOnly();
    $('#d-prov').close();
    await selectProvider(id);
    if (!vault.unlocked && $('#f-key').value.trim()) ui.openVault(id);
  };

  $('#v-ok').onclick = async () => {
    const pass = $('#v-pass').value;
    if (!HAS_CRYPTO) return sysLine('trình duyệt không có WebCrypto');
    const creating = !vault.exists;
    if (!(await vault.unlock(pass))) return sysLine('❌ passphrase sai');
    if (creating) sysLine(`✔ vault đã tạo. Keys: ${vault.listKeys().length}`);
    const k = $('#f-key').value.trim();
    if (vaultFocus && k) { vault.setKey(vaultFocus, k); $('#f-key').value = ''; sysLine(`🔑 key đã lưu cho **${vaultFocus}**`); }
    renderVaultState(); renderProvList(); refreshChrome();
  };
  $('#v-lock').onclick = () => { vault.lock(); renderVaultState(); renderProvList(); refreshChrome(); };

  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
  $('#thinking-toggle').onclick = () => {
    const last = [...document.querySelectorAll('#log .frame.think')].at(-1);
    if (last) last.open = !last.open;
  };

  // default provider form values for first run
  if (!activeProvider() && state.providers[0]) {
    const p = state.providers[0];
    $('#f-name').value = p.name; $('#f-url').value = p.base; $('#f-kind').value = p.kind;
  }
}

function saveFormOnly() {
  const name = $('#f-name').value.trim();
  if (!name) return null;
  const id = name.toLowerCase().replace(/\s+/g, '-');
  P.upsertProvider(state.providers, {
    id, name,
    base: $('#f-url').value.trim(),
    kind: $('#f-kind').value,
  });
  store.saveProviders();
  const key = $('#f-key').value.trim();
  if (key && vault.unlocked) { vault.setKey(id, key); $('#f-key').value = ''; sysLine(`🔑 key đã lưu cho **${name}**`); }
  else if (key) sysLine('vault đang khoá — key dùng tạm để tải model. Mở **/key** để lưu lâu dài.');
  return id;
}

async function init() {
  document.documentElement.dataset.theme = state.theme;
  if (!state.providers.length) {
    state.providers = P.PRESETS.map(x => ({ ...x }));
    store.saveProviders();
  }
  if (!state.current || !state.chats[state.current]) store.newChat();
  const c = store.curChat();
  selProvider = c.model?.providerId ?? null;
  selModel = c.model?.modelId ?? null;

  wire();
  rerender();
  updateHint();
  $('#in').focus();

  if (!vault.exists) sysLine('khuyến nghị: đặt passphrase qua **/key** để lưu API key mã hoá.');
  if (selProvider && !(state.catalog[selProvider] || []).length) loadModels(selProvider, true);
}

init();