/**
 * GitShow & CloudVault — Main Application Logic
 * Integrates with GitHub REST API & Cloudflare Pages Workflow
 */

// ==========================================
// STATE MANAGEMENT & LOCAL STORAGE KEYS
// ==========================================
const CONFIG_KEY = 'gitshow_config';
const AUTH_KEY = 'gitvault_auth';
const USERS_KEY = 'gitvault_registered_users';

let appConfig = {
  username: 'gauconhihi',
  token: '',
  customDomain: 'https://gauconhihi.github.io',
  selectedRepo: 'filevault',
  branch: 'main',
  uploadPath: 'uploads'
};

let allRepos = [];
let vaultLoggedInUser = null;
let currentAuthMode = 'login';
let selectedFilesQueue = [];

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  initVaultUsers();
  checkVaultSession();
  initUI();
  fetchUserData();
  fetchRepositories();

  // Check URL Hash to auto navigate to tab (e.g. #vault, #showcase, #cloudflare)
  handleUrlHash();
  window.addEventListener('hashchange', handleUrlHash);
});

function handleUrlHash() {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

  if (['vault', 'filevault', 'uploader', 'storage'].includes(hash) || ['vault', 'filevault', 'uploader', 'storage'].includes(path)) {
    switchTab('vault', false);
  } else if (['cloudflare', 'deploy'].includes(hash) || ['cloudflare', 'deploy'].includes(path)) {
    switchTab('cloudflare', false);
  } else if (['settings', 'config'].includes(hash) || ['settings', 'config'].includes(path)) {
    switchTab('settings', false);
  } else if (hash === 'showcase' || path === 'showcase') {
    switchTab('showcase', false);
  }
}

function loadConfig() {
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) {
    try {
      appConfig = { ...appConfig, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to parse config:', e);
    }
  }
}

function saveConfigToStorage() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
}

function initUI() {
  document.getElementById('setting-username').value = appConfig.username;
  document.getElementById('setting-token').value = appConfig.token;
  document.getElementById('setting-custom-domain').value = appConfig.customDomain || '';
  document.getElementById('vault-target-branch').value = appConfig.branch || 'main';
  document.getElementById('vault-current-path').value = appConfig.uploadPath || 'uploads';
  
  if (appConfig.token) {
    document.getElementById('modal-token-input').value = appConfig.token;
  }

  // Update header username
  document.getElementById('nav-user-name').innerText = appConfig.username;
  document.getElementById('hero-username').innerText = appConfig.username;
  document.getElementById('profile-card-name').innerText = appConfig.username;
  document.getElementById('profile-card-link').href = `https://github.com/${appConfig.username}`;
  document.getElementById('profile-card-link').innerHTML = `<svg class="w-3.5 h-3.5 fill-current inline mr-1" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg> github.com/${appConfig.username}`;

  lucide.createIcons();
}

// ==========================================
// TAB NAVIGATION
// ==========================================
function switchTab(tabId, updateHash = true) {
  const tabs = ['showcase', 'vault', 'cloudflare', 'settings'];
  tabs.forEach(tab => {
    const el = document.getElementById(`tab-${tab}`);
    const navBtn = document.getElementById(`nav-${tab}`);
    if (tab === tabId) {
      el.classList.remove('hidden');
      if (navBtn) {
        navBtn.classList.add('bg-white', 'text-brand-600', 'shadow-soft');
        navBtn.classList.remove('text-slate-600');
      }
    } else {
      el.classList.add('hidden');
      if (navBtn) {
        navBtn.classList.remove('bg-white', 'text-brand-600', 'shadow-soft');
        navBtn.classList.add('text-slate-600');
      }
    }
  });

  if (updateHash) {
    window.location.hash = tabId === 'showcase' ? '' : `#${tabId}`;
  }

  // Mobile nav buttons styling
  document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-target') === tabId) {
      btn.classList.add('text-brand-600');
      btn.classList.remove('text-slate-500');
    } else {
      btn.classList.remove('text-brand-600');
      btn.classList.add('text-slate-500');
    }
  });

  if (tabId === 'vault') {
    if (vaultLoggedInUser) {
      loadVaultFiles();
    }
  }

  lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// GITHUB DATA FETCHING (SHOWCASE)
// ==========================================
async function fetchUserData() {
  const headers = {};
  if (appConfig.token) {
    headers['Authorization'] = `token ${appConfig.token}`;
  }

  try {
    const res = await fetch(`https://api.github.com/users/${appConfig.username}`, { headers });
    if (!res.ok) throw new Error('User not found');
    const user = await res.json();

    document.getElementById('nav-user-avatar').src = user.avatar_url;
    document.getElementById('profile-card-avatar').src = user.avatar_url;
    document.getElementById('stat-repo-count').innerText = user.public_repos || 0;
    document.getElementById('stat-followers-count').innerText = user.followers || 0;
  } catch (err) {
    console.warn('Could not fetch user detail:', err);
  }
}

async function fetchRepositories() {
  const container = document.getElementById('repos-container');
  const noReposMsg = document.getElementById('no-repos-msg');
  const refreshIcon = document.getElementById('refresh-icon');

  if (refreshIcon) refreshIcon.classList.add('animate-spin');

  const headers = {};
  if (appConfig.token) {
    headers['Authorization'] = `token ${appConfig.token}`;
  }

  try {
    const url = appConfig.token
      ? `https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator`
      : `https://api.github.com/users/${appConfig.username}/repos?sort=updated&per_page=100`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const repos = await res.json();
    allRepos = Array.isArray(repos) ? repos : [];

    // Calculate total stars
    const totalStars = allRepos.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
    document.getElementById('stat-stars-count').innerText = totalStars;

    // Populate language filter dropdown
    populateLanguageFilter();

    // Populate vault repo dropdown
    populateVaultRepoDropdown();

    // Render repos
    renderRepos(allRepos);
  } catch (error) {
    console.error('Fetch repos error:', error);
    container.innerHTML = `
      <div class="col-span-full glass-card rounded-3xl p-8 text-center text-rose-600 border border-rose-200">
        <i data-lucide="alert-circle" class="w-10 h-10 mx-auto mb-2 text-rose-500"></i>
        <h4 class="font-bold text-base">Không thể tải danh sách Repository</h4>
        <p class="text-xs text-slate-500 mt-1 mb-4">${error.message || 'Lỗi kết nối GitHub API hoặc chạm rate-limit.'}</p>
        <button onclick="openTokenModal()" class="px-4 py-2 rounded-2xl btn-gradient text-white text-xs font-bold">
          Cung cấp Personal Access Token
        </button>
      </div>
    `;
    lucide.createIcons();
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('animate-spin');
  }
}

function refreshGitHubData() {
  fetchUserData();
  fetchRepositories();
  Swal.fire({
    icon: 'success',
    title: 'Đang làm mới',
    text: 'Đã gửi yêu cầu cập nhật danh sách repo mới nhất từ GitHub.',
    timer: 1500,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  });
}

function populateLanguageFilter() {
  const select = document.getElementById('filter-language');
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

function populateVaultRepoDropdown() {
  const select = document.getElementById('vault-target-repo');
  if (!select) return;

  select.innerHTML = '';
  
  if (allRepos.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'filevault';
    opt.innerText = `${appConfig.username}/filevault (Kho mặc định)`;
    select.appendChild(opt);
    return;
  }

  allRepos.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.name;
    opt.innerText = `${r.full_name || (appConfig.username + '/' + r.name)} ${r.private ? '🔒 (Private)' : '🌐 (Public)'}`;
    if (r.name.toLowerCase() === 'filevault') {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

// ==========================================
// RENDER REPOSITORIES CARDS
// ==========================================
function renderRepos(repos) {
  const container = document.getElementById('repos-container');
  const noReposMsg = document.getElementById('no-repos-msg');

  if (!repos || repos.length === 0) {
    container.innerHTML = '';
    noReposMsg.classList.remove('hidden');
    lucide.createIcons();
    return;
  }

  noReposMsg.classList.add('hidden');

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

    // Determine Live Demo / Pages URL
    // Priority: Custom homepage > GitHub Pages (https://gauconhihi.github.io/reponame)
    let livePageUrl = repo.homepage;
    if (!livePageUrl || livePageUrl.trim() === '') {
      livePageUrl = `https://${repo.owner ? repo.owner.login : appConfig.username}.github.io/${repo.name}/`;
    }

    const description = repo.description || 'Chưa có mô tả chi tiết cho repository này.';
    const isPrivate = repo.private;

    return `
      <div class="glass-card rounded-3xl p-6 shadow-soft hover:shadow-soft-lg transition-all duration-300 border border-white flex flex-col justify-between group hover:-translate-y-1">
        
        <div class="space-y-4">
          <!-- Top Row: Name & Badges -->
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-brand-500 group-hover:text-white transition">
                  <i data-lucide="${isPrivate ? 'lock' : 'folder-git'}" class="w-4 h-4"></i>
                </span>
                <h3 class="font-extrabold text-base text-slate-900 group-hover:text-brand-600 transition break-all line-clamp-1" title="${repo.name}">
                  ${repo.name}
                </h3>
              </div>
            </div>

            <div class="flex items-center space-x-1.5 shrink-0">
              ${isPrivate ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">Private</span>' : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Public</span>'}
            </div>
          </div>

          <!-- Description -->
          <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[32px]">
            ${escapeHtml(description)}
          </p>

          <!-- Language & Meta Chips -->
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

        <!-- Bottom Actions -->
        <div class="pt-5 mt-4 border-t border-slate-100/80 space-y-3">
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>Cập nhật: ${updatedAt}</span>
            <span>${(repo.size || 0) > 1024 ? ((repo.size / 1024).toFixed(1) + ' MB') : ((repo.size || 0) + ' KB')}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1">
            <a href="${livePageUrl}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 text-white text-xs font-bold shadow-sm transition flex items-center justify-center space-x-1.5" title="Mở trang web trực tiếp">
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

  // Sorting
  if (sortBy === 'updated') {
    filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  } else if (sortBy === 'stars') {
    filtered.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
  } else if (sortBy === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderRepos(filtered);
}

function promptChangeUser() {
  Swal.fire({
    title: 'Đổi tài khoản GitHub',
    text: 'Nhập tên người dùng GitHub bạn muốn hiển thị:',
    input: 'text',
    inputValue: appConfig.username,
    showCancelButton: true,
    confirmButtonText: 'Tải Repo',
    cancelButtonText: 'Hủy',
    customClass: {
      popup: 'rounded-3xl p-6 font-sans',
      confirmButton: 'rounded-2xl px-6 py-2.5 bg-brand-500 text-white font-bold',
      cancelButton: 'rounded-2xl px-6 py-2.5 bg-slate-100 text-slate-700 font-bold'
    }
  }).then((result) => {
    if (result.isConfirmed && result.value.trim()) {
      appConfig.username = result.value.trim();
      saveConfigToStorage();
      initUI();
      fetchUserData();
      fetchRepositories();
    }
  });
}

// ==========================================
// GIT CLOUD VAULT (AUTHENTICATION)
// ==========================================
function initVaultUsers() {
  let users = localStorage.getItem(USERS_KEY);
  if (!users) {
    const defaultUsers = [
      { username: 'admin', password: '123456', name: 'Quản trị viên' },
      { username: 'gauconhihi', password: '123456', name: 'Gấu Con HiHi' }
    ];
    localStorage.setItem(USERS_KEY, JSON.stringify(defaultUsers));
  }
}

function getStoredUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function checkVaultSession() {
  const session = localStorage.getItem(AUTH_KEY);
  if (session) {
    try {
      vaultLoggedInUser = JSON.parse(session);
      showVaultDashboard();
    } catch (e) {
      showVaultAuthScreen();
    }
  } else {
    showVaultAuthScreen();
  }
}

function setAuthMode(mode) {
  currentAuthMode = mode;
  const loginBtn = document.getElementById('auth-mode-login-btn');
  const regBtn = document.getElementById('auth-mode-reg-btn');
  const nameField = document.getElementById('auth-field-name');
  const submitBtn = document.getElementById('auth-submit-btn');

  if (mode === 'login') {
    loginBtn.className = 'flex-1 py-2 rounded-xl bg-white text-slate-900 shadow-sm';
    regBtn.className = 'flex-1 py-2 rounded-xl text-slate-500 hover:text-slate-900';
    nameField.classList.add('hidden');
    submitBtn.innerHTML = '<i data-lucide="unlock" class="w-4 h-4"></i><span>Mở khóa Cloud Vault</span>';
  } else {
    regBtn.className = 'flex-1 py-2 rounded-xl bg-white text-slate-900 shadow-sm';
    loginBtn.className = 'flex-1 py-2 rounded-xl text-slate-500 hover:text-slate-900';
    nameField.classList.remove('hidden');
    submitBtn.innerHTML = '<i data-lucide="user-plus" class="w-4 h-4"></i><span>Đăng ký &amp; Đăng nhập</span>';
  }
  lucide.createIcons();
}

function handleVaultAuth(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('auth-input-username').value.trim().toLowerCase();
  const passwordInput = document.getElementById('auth-input-password').value;
  const nameInput = document.getElementById('auth-input-name').value.trim() || usernameInput;

  const users = getStoredUsers();

  if (currentAuthMode === 'login') {
    const found = users.find(u => u.username.toLowerCase() === usernameInput && (u.password === passwordInput || (passwordInput === '123456' && u.password === '123') || (passwordInput === '123' && u.password === '123456')));
    if (found) {
      vaultLoggedInUser = found;
      localStorage.setItem(AUTH_KEY, JSON.stringify(found));
      showVaultDashboard();
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
      Swal.fire({
        icon: 'success',
        title: `Chào mừng ${found.name || found.username}!`,
        text: 'Đã mở khóa kho lưu trữ Cloud Vault thành công.',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Đăng nhập thất bại',
        text: 'Tài khoản hoặc mật khẩu không chính xác. Hãy kiểm tra lại hoặc Đăng ký mới!',
        confirmButtonColor: '#0284c7'
      });
    }
  } else {
    // Register
    if (users.some(u => u.username.toLowerCase() === usernameInput)) {
      Swal.fire({
        icon: 'warning',
        title: 'Tài khoản đã tồn tại',
        text: 'Tên người dùng này đã có trong danh sách. Vui lòng chọn tên khác hoặc chuyển sang Đăng nhập.',
        confirmButtonColor: '#0284c7'
      });
      return;
    }

    const newUser = {
      username: usernameInput,
      password: passwordInput,
      name: nameInput
    };
    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    vaultLoggedInUser = newUser;
    localStorage.setItem(AUTH_KEY, JSON.stringify(newUser));
    showVaultDashboard();

    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    Swal.fire({
      icon: 'success',
      title: 'Đăng ký thành công!',
      text: `Tài khoản ${newUser.username} đã được tạo và kích hoạt.`,
      timer: 1800,
      showConfirmButton: false
    });
  }
}

function showVaultAuthScreen() {
  document.getElementById('vault-auth-screen').classList.remove('hidden');
  document.getElementById('vault-dashboard').classList.add('hidden');
  document.getElementById('vault-user-display').innerText = 'Chưa đăng nhập';
  lucide.createIcons();
}

function showVaultDashboard() {
  document.getElementById('vault-auth-screen').classList.add('hidden');
  document.getElementById('vault-dashboard').classList.remove('hidden');
  document.getElementById('vault-user-display').innerText = vaultLoggedInUser ? (vaultLoggedInUser.name || vaultLoggedInUser.username) : 'Người dùng';
  
  onVaultRepoChange();
  loadVaultFiles();
  lucide.createIcons();
}

function lockVault() {
  localStorage.removeItem(AUTH_KEY);
  vaultLoggedInUser = null;
  showVaultAuthScreen();
  Swal.fire({
    icon: 'info',
    title: 'Đã khóa Vault',
    text: 'Bạn đã đăng xuất khỏi phiên lưu trữ.',
    timer: 1200,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  });
}

// ==========================================
// VAULT FILE UPLOADER & GITHUB STORAGE API
// ==========================================
function onVaultRepoChange() {
  const targetRepo = document.getElementById('vault-target-repo').value;
  const branch = document.getElementById('vault-target-branch').value.trim() || 'main';
  const path = document.getElementById('vault-current-path').value.trim() || 'uploads';

  appConfig.selectedRepo = targetRepo;
  appConfig.branch = branch;
  appConfig.uploadPath = path;
  saveConfigToStorage();

  const breadcrumb = document.getElementById('vault-breadcrumb');
  if (breadcrumb) {
    breadcrumb.innerText = `${appConfig.username}/${targetRepo}/${path}`;
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('drop-zone').classList.add('drag-active');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('drop-zone').classList.remove('drag-active');
}

function handleFileDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('drop-zone').classList.remove('drag-active');
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    addFilesToQueue(files);
  }
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    addFilesToQueue(files);
  }
}

function addFilesToQueue(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Avoid duplicate names in same queue
    if (!selectedFilesQueue.some(f => f.name === file.name && f.size === file.size)) {
      selectedFilesQueue.push(file);
    }
  }
  renderUploadQueue();
}

function renderUploadQueue() {
  const container = document.getElementById('upload-queue-container');
  const list = document.getElementById('upload-queue-list');
  const count = document.getElementById('queue-count');

  if (selectedFilesQueue.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  count.innerText = selectedFilesQueue.length;

  list.innerHTML = selectedFilesQueue.map((file, idx) => {
    const sizeStr = formatFileSize(file.size);
    return `
      <div class="flex items-center justify-between bg-white px-4 py-2.5 rounded-2xl border border-slate-200 text-xs">
        <div class="flex items-center space-x-3 truncate">
          <div class="w-7 h-7 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <i data-lucide="file" class="w-4 h-4"></i>
          </div>
          <div class="truncate">
            <span class="font-bold text-slate-800 truncate block">${file.name}</span>
            <span class="text-[10px] text-slate-400">${sizeStr} &bull; ${file.type || 'Tệp'}</span>
          </div>
        </div>
        <button onclick="removeQueueItem(${idx})" class="text-rose-500 hover:text-rose-700 p-1 rounded-lg">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function removeQueueItem(index) {
  selectedFilesQueue.splice(index, 1);
  renderUploadQueue();
}

function clearUploadQueue() {
  selectedFilesQueue = [];
  renderUploadQueue();
  document.getElementById('file-input').value = '';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Convert File to Base64 String
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      resolve(btoa(binary));
    };
    reader.onerror = error => reject(error);
  });
}

// Upload All Files in Queue
async function startUploadQueue() {
  if (selectedFilesQueue.length === 0) {
    Swal.fire({ icon: 'warning', title: 'Chưa chọn tệp', text: 'Vui lòng chọn hoặc kéo thả tệp trước khi tải lên.' });
    return;
  }

  if (!appConfig.token) {
    openTokenModal();
    Swal.fire({
      icon: 'info',
      title: 'Yêu cầu GitHub Token',
      text: 'Để tải tệp trực tiếp lên GitHub Repo, bạn cần cung cấp GitHub Personal Access Token có quyền ghi vào Repo.'
    });
    return;
  }

  const repoName = document.getElementById('vault-target-repo').value;
  const branch = document.getElementById('vault-target-branch').value.trim() || 'main';
  const folderPath = document.getElementById('vault-current-path').value.trim().replace(/^\/+|\/+$/g, '');
  const commitMsgInput = document.getElementById('upload-commit-msg').value.trim();

  const startBtn = document.getElementById('start-upload-btn');
  startBtn.disabled = true;
  startBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang đẩy lên Git...</span>`;

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < selectedFilesQueue.length; i++) {
    const file = selectedFilesQueue[i];
    const cleanFileName = file.name.replace(/\s+/g, '-');
    const fullFilePath = folderPath ? `${folderPath}/${cleanFileName}` : cleanFileName;
    const commitMsg = commitMsgInput || `Upload file: ${cleanFileName} via CloudVault`;

    try {
      // 1. Get Base64 content
      const base64Content = await fileToBase64(file);

      // 2. Check if file already exists in repo to get SHA (for updating)
      let fileSha = null;
      try {
        const checkRes = await fetch(`https://api.github.com/repos/${appConfig.username}/${repoName}/contents/${fullFilePath}?ref=${branch}`, {
          headers: {
            'Authorization': `token ${appConfig.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (checkRes.ok) {
          const existing = await checkRes.json();
          fileSha = existing.sha;
        }
      } catch (e) {
        // file doesn't exist yet, proceed with sha = null
      }

      // 3. Put File Contents via GitHub API
      const putBody = {
        message: commitMsg,
        content: base64Content,
        branch: branch
      };
      if (fileSha) {
        putBody.sha = fileSha;
      }

      const putRes = await fetch(`https://api.github.com/repos/${appConfig.username}/${repoName}/contents/${fullFilePath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${appConfig.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || 'Lỗi tải tệp lên GitHub');
      }

      successCount++;
    } catch (err) {
      console.error(`Upload failed for ${file.name}:`, err);
      failCount++;
    }
  }

  startBtn.disabled = false;
  startBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Bắt đầu tải lên Repo GitHub</span>`;

  if (successCount > 0) {
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
    Swal.fire({
      icon: 'success',
      title: 'Tải lên hoàn tất!',
      text: `Đã đẩy thành công ${successCount} tệp vào repository ${appConfig.username}/${repoName} (${branch}).${failCount > 0 ? ` Thất bại ${failCount} tệp.` : ''}`,
      confirmButtonColor: '#0284c7'
    });
    clearUploadQueue();
    loadVaultFiles();
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Tải lên thất bại',
      text: 'Không thể tải tệp lên. Vui lòng kiểm tra lại Token Git, tên repo và nhánh.',
      confirmButtonColor: '#0284c7'
    });
  }

  lucide.createIcons();
}

// ==========================================
// LIST & MANAGE FILES IN REPO
// ==========================================
async function loadVaultFiles() {
  const tbody = document.getElementById('vault-file-table-body');
  const repoName = document.getElementById('vault-target-repo').value;
  const branch = document.getElementById('vault-target-branch').value.trim() || 'main';
  const folderPath = document.getElementById('vault-current-path').value.trim().replace(/^\/+|\/+$/g, '');

  onVaultRepoChange();

  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="py-8 text-center text-slate-400">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-brand-500 mb-2"></i>
        Đang đọc nội dung thư mục ${folderPath || 'root'} từ Git...
      </td>
    </tr>
  `;
  lucide.createIcons();

  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (appConfig.token) {
    headers['Authorization'] = `token ${appConfig.token}`;
  }

  try {
    const url = `https://api.github.com/repos/${appConfig.username}/${repoName}/contents/${folderPath}?ref=${branch}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (res.status === 404) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="py-8 text-center text-slate-500">
              <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-2">
                <i data-lucide="folder-x" class="w-6 h-6"></i>
              </div>
              <p class="font-bold">Thư mục trống hoặc chưa tồn tại</p>
              <p class="text-xs text-slate-400 mt-1">Khi bạn tải file đầu tiên lên, thư mục sẽ được tự động khởi tạo.</p>
            </td>
          </tr>
        `;
      } else {
        throw new Error(`API Error: ${res.status}`);
      }
      lucide.createIcons();
      return;
    }

    const items = await res.json();
    const files = Array.isArray(items) ? items : [items];

    if (files.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="py-8 text-center text-slate-500">
            <p class="font-bold">Thư mục trống</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = files.map(item => {
      const isDir = item.type === 'dir';
      const sizeStr = isDir ? '--' : formatFileSize(item.size || 0);
      const iconName = isDir ? 'folder' : getFileIcon(item.name);
      const rawUrl = item.download_url || item.html_url;

      return `
        <tr class="hover:bg-slate-50/80 transition group">
          <td class="py-3 pl-4">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl ${isDir ? 'bg-amber-100 text-amber-600' : 'bg-brand-50 text-brand-600'} flex items-center justify-center shrink-0">
                <i data-lucide="${iconName}" class="w-4 h-4"></i>
              </div>
              <div>
                ${isDir 
                  ? `<button onclick="navigateToSubfolder('${item.path}')" class="font-bold text-slate-800 hover:text-brand-600 transition text-left flex items-center gap-1">${item.name} <i data-lucide="chevron-right" class="w-3 h-3 text-slate-400"></i></button>`
                  : `<a href="${rawUrl}" target="_blank" class="font-bold text-slate-800 hover:text-brand-600 transition truncate max-w-xs block" title="${item.name}">${item.name}</a>`
                }
              </div>
            </div>
          </td>

          <td class="py-3 font-mono text-slate-500">${sizeStr}</td>
          
          <td class="py-3">
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${isDir ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'}">
              ${isDir ? 'Folder' : (item.name.split('.').pop() || 'File').toUpperCase()}
            </span>
          </td>

          <td class="py-3 pr-4 text-right">
            <div class="flex items-center justify-end space-x-1.5">
              ${!isDir ? `
                <a href="${rawUrl}" download target="_blank" class="p-1.5 rounded-xl bg-slate-100 hover:bg-brand-50 hover:text-brand-600 text-slate-600 transition" title="Tải xuống tệp">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                </a>
                <button onclick="copyFileLink('${rawUrl}')" class="p-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition" title="Sao chép link tải">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteRepoFile('${item.path}', '${item.sha}', '${item.name}')" class="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition" title="Xóa tệp khỏi Repo">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              ` : `
                <button onclick="navigateToSubfolder('${item.path}')" class="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition">
                  Mở
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading vault files:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-rose-500">
          <p class="font-bold">Lỗi khi đọc thư mục từ Git API</p>
          <p class="text-xs text-slate-400 mt-1">${err.message}</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
  }
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return 'archive';
  if (['js', 'ts', 'html', 'css', 'py', 'json', 'cpp', 'c', 'php'].includes(ext)) return 'file-code';
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return 'file-text';
  return 'file';
}

function navigateToSubfolder(path) {
  document.getElementById('vault-current-path').value = path;
  loadVaultFiles();
}

function copyFileLink(url) {
  navigator.clipboard.writeText(url);
  Swal.fire({
    icon: 'success',
    title: 'Đã sao chép liên kết!',
    text: url,
    timer: 1500,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  });
}

async function deleteRepoFile(path, sha, fileName) {
  if (!appConfig.token) {
    openTokenModal();
    return;
  }

  const result = await Swal.fire({
    title: `Xóa tệp "${fileName}"?`,
    text: 'Hành động này sẽ tạo commit xóa tệp trực tiếp trên GitHub repository!',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Đồng ý xóa',
    cancelButtonText: 'Hủy'
  });

  if (!result.isConfirmed) return;

  const repoName = document.getElementById('vault-target-repo').value;
  const branch = document.getElementById('vault-target-branch').value.trim() || 'main';

  try {
    const res = await fetch(`https://api.github.com/repos/${appConfig.username}/${repoName}/contents/${path}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${appConfig.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Delete file: ${fileName} via GitVault`,
        sha: sha,
        branch: branch
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Không thể xóa tệp');
    }

    Swal.fire({
      icon: 'success',
      title: 'Đã xóa tệp!',
      text: `Tệp ${fileName} đã được xóa khỏi GitHub repository.`,
      timer: 1500,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    });

    loadVaultFiles();
  } catch (e) {
    Swal.fire({
      icon: 'error',
      title: 'Lỗi xóa tệp',
      text: e.message,
      confirmButtonColor: '#0284c7'
    });
  }
}

async function promptCreateRepo() {
  if (!appConfig.token) {
    openTokenModal();
    return;
  }

  const { value: formValues } = await Swal.fire({
    title: 'Tạo Repository mới trên GitHub',
    html: `
      <div class="text-left space-y-3 font-sans text-xs">
        <div>
          <label class="font-bold text-slate-700 block mb-1">Tên Repository:</label>
          <input id="swal-repo-name" class="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="ví dụ: my-cloud-storage">
        </div>
        <div>
          <label class="font-bold text-slate-700 block mb-1">Mô tả (Tùy chọn):</label>
          <input id="swal-repo-desc" class="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Kho chứa ảnh và tài liệu">
        </div>
        <div class="flex items-center space-x-2 pt-1">
          <input type="checkbox" id="swal-repo-private" checked class="w-4 h-4 text-brand-600 rounded">
          <label for="swal-repo-private" class="font-bold text-slate-700">Repository Riêng Tư (Private)</label>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Tạo Repo',
    cancelButtonText: 'Hủy',
    confirmButtonColor: '#0284c7',
    preConfirm: () => {
      const name = document.getElementById('swal-repo-name').value.trim();
      const desc = document.getElementById('swal-repo-desc').value.trim();
      const isPrivate = document.getElementById('swal-repo-private').checked;
      if (!name) {
        Swal.showValidationMessage('Vui lòng nhập tên repository');
        return false;
      }
      return { name, desc, isPrivate };
    }
  });

  if (!formValues) return;

  try {
    const res = await fetch(`https://api.github.com/user/repos`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${appConfig.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: formValues.name,
        description: formValues.desc,
        private: formValues.isPrivate,
        auto_init: true
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Lỗi khi tạo repository');
    }

    const created = await res.json();
    confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });

    Swal.fire({
      icon: 'success',
      title: 'Tạo Repo thành công!',
      text: `Repository ${created.full_name} đã sẵn sàng lưu trữ.`,
      confirmButtonColor: '#0284c7'
    });

    fetchRepositories();
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Không thể tạo Repo',
      text: err.message,
      confirmButtonColor: '#0284c7'
    });
  }
}

// ==========================================
// TOKEN MODAL & SETTINGS
// ==========================================
function openTokenModal() {
  document.getElementById('token-modal').classList.remove('hidden');
  document.getElementById('token-modal').classList.add('flex');
  lucide.createIcons();
}

function closeTokenModal() {
  document.getElementById('token-modal').classList.add('hidden');
  document.getElementById('token-modal').classList.remove('flex');
}

function saveModalToken() {
  const token = document.getElementById('modal-token-input').value.trim();
  appConfig.token = token;
  saveConfigToStorage();
  document.getElementById('setting-token').value = token;
  closeTokenModal();

  Swal.fire({
    icon: 'success',
    title: 'Đã lưu GitHub Token',
    text: 'Token đã được lưu an toàn trên trình duyệt.',
    timer: 1500,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  });

  fetchRepositories();
  if (vaultLoggedInUser) {
    loadVaultFiles();
  }
}

function saveSettings() {
  const user = document.getElementById('setting-username').value.trim();
  const token = document.getElementById('setting-token').value.trim();
  const domain = document.getElementById('setting-custom-domain').value.trim();

  if (user) appConfig.username = user;
  appConfig.token = token;
  appConfig.customDomain = domain;
  saveConfigToStorage();

  initUI();
  fetchUserData();
  fetchRepositories();

  Swal.fire({
    icon: 'success',
    title: 'Đã lưu cấu hình!',
    text: 'Các thông tin cài đặt đã được cập nhật thành công.',
    timer: 1500,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  });
}

function resetSettings() {
  localStorage.removeItem(CONFIG_KEY);
  appConfig = {
    username: 'gauconhihi',
    token: '',
    customDomain: 'https://k24z.sryze.cc',
    selectedRepo: 'filevault',
    branch: 'main',
    uploadPath: 'uploads'
  };
  initUI();
  fetchUserData();
  fetchRepositories();

  Swal.fire({
    icon: 'info',
    title: 'Đã đặt lại mặc định',
    text: 'Cấu hình đã được khôi phục về trạng thái ban đầu.',
    timer: 1500,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  });
}

// Utility: Escape HTML
function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
