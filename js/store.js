// store.js — all persisted state. localStorage, no backend.
const P = 'gauconhihi.';

export const ls = {
  get(k, fb) {
    try { const v = localStorage.getItem(P + k); return v == null ? fb : JSON.parse(v); }
    catch { return fb; }
  },
  set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { console.warn('store set failed', k, e); } },
  del(k) { try { localStorage.removeItem(P + k); } catch { } },
};

export const state = {
  theme: ls.get('theme', 'light'),
  settings: ls.get('settings', { temp: 0.7, maxTokens: 4096 }),
  providers: ls.get('providers', []),
  chats: ls.get('chats', {}),
  current: ls.get('current', null),
  catalog: ls.get('catalog', {}),   // providerId -> [{id,label,ctx}]
};

export function saveSettings() { ls.set('settings', state.settings); }
export function saveProviders() { ls.set('providers', state.providers); }
export function saveCatalog() { ls.set('catalog', state.catalog); }
export function saveTheme() { ls.set('theme', state.theme); }

// ---------- chats ----------
export function newChat(title) {
  const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  state.chats[id] = { id, title: title || 'chat mới', msgs: [], model: null, ts: Date.now() };
  state.current = id;
  ls.set('chats', state.chats);
  ls.set('current', id);
  return state.chats[id];
}

export function curChat() {
  if (!state.current || !state.chats[state.current]) newChat();
  return state.chats[state.current];
}

export function saveChat() {
  state.chats[state.current].ts = Date.now();
  ls.set('chats', state.chats);
}

export function delChat(id) {
  delete state.chats[id];
  if (state.current === id) state.current = null;
  ls.set('chats', state.chats);
  ls.set('current', state.current);
}

export function renameChat(id, title) {
  if (state.chats[id]) { state.chats[id].title = title; ls.set('chats', state.chats); }
}

export function chatList() {
  return Object.values(state.chats).sort((a, b) => b.ts - a.ts);
}

export function exportChats() {
  return JSON.stringify(state.chats, null, 2);
}

export function importChats(json) {
  const o = JSON.parse(json);
  Object.assign(state.chats, o);
  ls.set('chats', state.chats);
}