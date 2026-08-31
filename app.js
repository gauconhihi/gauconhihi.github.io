/**
 * gauconhihi.github.io — GitHub Repositories Showcase
 * Pure Repository Explorer & Live Web Viewer
 */

const USERNAME = 'gauconhihi';
let allRepos = [];

document.addEventListener('DOMContentLoaded', () => {
  fetchUserData();
  fetchRepositories();
});

async function fetchUserData() {
  try {
    const res = await fetch(`https://api.github.com/users/${USERNAME}`);
    if (!res.ok) return;
    const user = await res.json();

    const avatar = document.getElementById('profile-avatar');
    if (avatar && user.avatar_url) avatar.src = user.avatar_url;

    const repoCount = document.getElementById('stat-repo-count');
    if (repoCount) repoCount.innerText = user.public_repos || 0;

    const followers = document.getElementById('stat-followers-count');
    if (followers) followers.innerText = user.followers || 0;
  } catch (err) {
    console.warn(err);
  }
}

async function fetchRepositories() {
  const container = document.getElementById('repos-container');
  const refreshIcon = document.getElementById('refresh-icon');

  if (refreshIcon) refreshIcon.classList.add('animate-spin');

  try {
    const res = await fetch(`https://api.github.com/users/${USERNAME}/repos?sort=updated&per_page=100`);
    if (!res.ok) throw new Error('API Rate Limit or Network Error');

    const repos = await res.json();
    allRepos = Array.isArray(repos) ? repos : [];

    // Calculate total stars
    const totalStars = allRepos.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
    const starEl = document.getElementById('stat-stars-count');
    if (starEl) starEl.innerText = totalStars;

    populateLanguageFilter();
    renderRepos(allRepos);
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="col-span-full glass-card rounded-3xl p-8 text-center text-slate-500 border border-slate-200">
        <p class="font-bold text-slate-800">Không thể tải danh sách Repository lúc này.</p>
        <p class="text-xs text-slate-400 mt-1">${err.message}</p>
      </div>
    `;
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('animate-spin');
    lucide.createIcons();
  }
}

function populateLanguageFilter() {
  const select = document.getElementById('filter-language');
  if (!select) return;

  const languages = new Set();
  allRepos.forEach(r => {
    if (r.language) languages.add(r.language);
  });

  select.innerHTML = '<option value="all">Tất cả ngôn ngữ</option>';
  languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.innerText = lang;
    select.appendChild(opt);
  });
}

function renderRepos(repos) {
  const container = document.getElementById('repos-container');
  const noReposMsg = document.getElementById('no-repos-msg');

  if (!repos || repos.length === 0) {
    container.innerHTML = '';
    if (noReposMsg) noReposMsg.classList.remove('hidden');
    lucide.createIcons();
    return;
  }

  if (noReposMsg) noReposMsg.classList.add('hidden');

  const languageColors = {
    JavaScript: 'bg-amber-100 text-amber-800 border-amber-200',
    TypeScript: 'bg-blue-100 text-blue-800 border-blue-200',
    HTML: 'bg-orange-100 text-orange-800 border-orange-200',
    CSS: 'bg-sky-100 text-sky-800 border-sky-200',
    Python: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    Vue: 'bg-teal-100 text-teal-800 border-teal-200',
    React: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    C: 'bg-slate-100 text-slate-800 border-slate-200',
    'C++': 'bg-pink-100 text-pink-800 border-pink-200',
    PHP: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    Shell: 'bg-gray-100 text-gray-800 border-gray-200',
    Default: 'bg-purple-100 text-purple-800 border-purple-200'
  };

  container.innerHTML = repos.map(repo => {
    const langStyle = languageColors[repo.language] || languageColors.Default;
    const updatedAt = new Date(repo.updated_at).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    let livePageUrl = repo.homepage;
    if (!livePageUrl || livePageUrl.trim() === '') {
      if (repo.name === 'gauconhihi.github.io') {
        livePageUrl = 'https://gauconhihi.github.io/';
      } else {
        livePageUrl = `https://gauconhihi.github.io/${repo.name}/`;
      }
    }

    const description = repo.description || 'Chưa có mô tả chi tiết cho repository này.';
    const isPrivate = repo.private;

    return `
      <div class="glass-card rounded-3xl p-6 shadow-soft hover:shadow-soft-lg transition-all duration-300 border border-white flex flex-col justify-between group hover:-translate-y-1">
        <div class="space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-brand-500 group-hover:text-white transition">
                <i data-lucide="${isPrivate ? 'lock' : 'folder-git'}" class="w-4 h-4"></i>
              </span>
              <h3 class="font-extrabold text-base text-slate-900 group-hover:text-brand-600 transition break-all line-clamp-1" title="${repo.name}">
                ${repo.name}
              </h3>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isPrivate ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}">
              ${isPrivate ? 'Private' : 'Public'}
            </span>
          </div>

          <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[32px]">
            ${escapeHtml(description)}
          </p>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            ${repo.language ? `<span class="px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${langStyle}">${repo.language}</span>` : ''}
            <span class="inline-flex items-center space-x-1 text-slate-500 text-xs px-2 py-1 bg-slate-50 rounded-xl border border-slate-100">
              <i data-lucide="star" class="w-3.5 h-3.5 text-amber-500 fill-amber-400"></i>
              <span class="font-bold">${repo.stargazers_count || 0}</span>
            </span>
            <span class="inline-flex items-center space-x-1 text-slate-500 text-xs px-2 py-1 bg-slate-50 rounded-xl border border-slate-100">
              <i data-lucide="git-fork" class="w-3.5 h-3.5 text-indigo-500"></i>
              <span class="font-bold">${repo.forks_count || 0}</span>
            </span>
          </div>
        </div>

        <div class="pt-5 mt-4 border-t border-slate-100/80 space-y-3">
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>Cập nhật: ${updatedAt}</span>
            <span>${(repo.size || 0) > 1024 ? ((repo.size / 1024).toFixed(1) + ' MB') : ((repo.size || 0) + ' KB')}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1">
            <a href="${livePageUrl}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 text-white text-xs font-bold shadow-sm transition flex items-center justify-center space-x-1.5" title="Xem trang web trực tiếp">
              <i data-lucide="globe" class="w-3.5 h-3.5"></i>
              <span>Xem Web</span>
            </a>

            <a href="${repo.html_url}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center space-x-1.5" title="Xem mã nguồn trên GitHub">
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              <span>Mã Nguồn</span>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function filterRepos() {
  const searchTerm = document.getElementById('search-repo-input').value.toLowerCase().trim();
  const selectedLang = document.getElementById('filter-language').value;
  const sortBy = document.getElementById('sort-repos').value;

  let filtered = allRepos.filter(repo => {
    const matchesSearch =
      repo.name.toLowerCase().includes(searchTerm) ||
      (repo.description && repo.description.toLowerCase().includes(searchTerm)) ||
      (repo.language && repo.language.toLowerCase().includes(searchTerm));

    const matchesLang = selectedLang === 'all' || repo.language === selectedLang;
    return matchesSearch && matchesLang;
  });

  if (sortBy === 'updated') {
    filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  } else if (sortBy === 'stars') {
    filtered.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
  } else if (sortBy === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderRepos(filtered);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
