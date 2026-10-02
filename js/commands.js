// commands.js — CLI slash commands.
export const COMMANDS = {};

function cmd(name, desc, aliases, run) {
  COMMANDS[name] = { name, desc, aliases, run };
  for (const a of aliases) COMMANDS[a] = COMMANDS[name];
}

cmd('help', 'danh sách lệnh', ['h', '?'], (arg, ctx) => {
  const seen = new Set(), rows = [];
  for (const c of Object.values(COMMANDS)) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    rows.push({ c: '/' + c.name, d: c.desc, a: c.aliases.length ? '(/' + c.aliases.join(', /') + ')' : '' });
  }
  rows.sort((a, b) => a.c.localeCompare(b.c));
  ctx.ui.openCmd(rows);
  return rows.map(r => `${r.c.padEnd(14)}${r.d}`).join('\n');
});

cmd('model', 'chọn model', ['m', 'models'], (a, ctx) => ctx.ui.openModel());
cmd('provider', 'thêm / sửa provider', ['p', 'prov'], (a, ctx) => ctx.ui.openProviders());
cmd('key', 'mở vault, nhập API key', ['k', 'keys', 'vault'], (a, ctx) => ctx.ui.openVault(ctx.selProvider));
cmd('new', 'chat mới', ['clear', 'reset'], (a, ctx) => { ctx.chat.newChat(a || undefined); return null; });

cmd('set', '/set temp 0.9 · /set maxTokens 8192', [], (arg, ctx) => {
  const [k, ...r] = String(arg).split(/\s+/);
  const v = r.join(' ');
  const map = { temp: 'temp', temperature: 'temp', max: 'maxTokens', maxtokens: 'maxTokens' };
  const key = map[String(k).toLowerCase()];
  if (!key) return 'tham số lạ. xem /help.';
  const val = Number(v);
  if (Number.isNaN(val)) return 'giá trị phải là số.';
  ctx.state.settings[key] = val;
  ctx.store.saveSettings();
  return `settings.${key} = ${val}`;
});

cmd('temp', 'đặt nhiệt độ', ['temperature'], (a, ctx) => COMMANDS.set.run('temp ' + a, ctx));
cmd('maxtokens', 'giới hạn output tokens', ['maxtok'], (a, ctx) => COMMANDS.set.run('maxTokens ' + a, ctx));

cmd('ctx', 'ngân sách context của model hiện tại', ['context', 'budget'], (a, ctx) => {
  const info = ctx.currentModelInfo();
  if (!info) return 'chưa chọn model.';
  const used = ctx.estContextTokens();
  const left = Math.max(0, info.ctx - used);
  const pct = Math.min(100, Math.round(used / info.ctx * 100));
  return [
    `model   ${info.id}`,
    `window  ${info.ctx.toLocaleString()} tokens${info.ctx >= 1e6 ? '  (1M+)' : ''}`,
    `đã dùng ~${used.toLocaleString()}  (${pct}%)`,
    `còn     ~${left.toLocaleString()}`,
  ].join('\n');
});

cmd('info', 'provider / model / vault / settings', ['cd', 'status'], (a, ctx) => {
  const p = ctx.activeProvider(), m = ctx.currentModelInfo();
  return [
    `provider ${p ? p.name : '(chưa chọn)'}  ${p ? '· ' + p.kind + ' · ' + p.base : ''}`,
    `model    ${m ? m.id : '(chưa chọn)'}`,
    `vault    ${ctx.vault.unlocked ? 'đã mở · ' + ctx.vault.listKeys().length + ' key' : 'khóa'}`,
    `settings temp ${ctx.state.settings.temp} · maxTokens ${ctx.state.settings.maxTokens}`,
  ].join('\n');
});

cmd('copy', 'copy câu trả lời cuối', [], (a, ctx) => {
  const last = ctx.chat.cur().msgs.filter(m => m.role === 'assistant').at(-1);
  if (!last) return 'chưa có câu trả lời nào.';
  navigator.clipboard?.writeText(last.content);
  return 'đã copy vào clipboard.';
});

cmd('regen', 'trả lời lại câu cuối', ['retry'], (a, ctx) => {
  const msgs = ctx.chat.cur().msgs;
  const lastU = msgs.map(m => m.role).lastIndexOf('user');
  if (lastU < 0) return 'chưa có câu hỏi nào.';
  const q = msgs[lastU].content;
  msgs.splice(lastU);
  ctx.chat.rerender();
  ctx.send(q);
  return null;
});

cmd('export', 'export chat ra file json', ['exportchats'], (a, ctx) => {
  const blob = new Blob([ctx.store.exportChats()], { type: 'application/json' });
  dl(blob, `chats-${new Date().toISOString().slice(0, 10)}.json`);
  return 'đã tải file json.';
});

cmd('backup', 'export vault đã mã hoá', ['exportkeys'], (a, ctx) => {
  if (!ctx.vault.unlocked) return 'vault đang khoá. /key trước.';
  dl(new Blob([ctx.vault.exportBlob()], { type: 'application/json' }), 'vault.json');
  return 'file vault đã mã hoá. GIỮ KÉP passphrase, mất là mất key.';
});

cmd('theme', 'đổi sáng / tối', ['t'], (a, ctx) => { ctx.ui.toggleTheme(); return null; });

cmd('stop', 'dừng câu trả lời', [], (a, ctx) => { ctx.abort(); return null; });

cmd('clear-log', 'xoá log hiện tại (giữ cấu hình)', ['cls'], (a, ctx) => {
  ctx.chat.cur().msgs = [];
  ctx.chat.rerender();
  return null;
});

function dl(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export function parse(line) {
  const s = String(line).trim();
  if (!s.startsWith('/')) return null;
  const sp = s.indexOf(' ');
  const name = (sp < 0 ? s.slice(1) : s.slice(1, sp)).toLowerCase();
  const arg = sp < 0 ? '' : s.slice(sp + 1).trim();
  return { cmd: COMMANDS[name] || null, name, arg };
}