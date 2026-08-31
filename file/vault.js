/**
 * Git Cloud Vault — Standalone File Manager & Uploader Logic
 * Connects directly with GitHub REST API
 */

const CONFIG_KEY = 'gitvault_file_config';
const AUTH_KEY = 'gitvault_file_auth';
const USERS_KEY = 'gitvault_file_users';

let vaultConfig = {
  username: 'gauconhihi',
  token: '',
  selectedRepo: 'file',
  branch: 'main',
  uploadPath: 'uploads'
};

let loggedInUser = null;
let currentAuthMode = 'login';
let uploadQueue = [];

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  initUsers();
  checkSession();
  initUI();
});

function loadConfig() {
  const saved = localStorage.getItem(CONFIG_KEY) || localStorage.getItem('gitshow_config');
  if (saved) {
    try {
      vaultConfig = { ...vaultConfig, ...JSON.parse(saved) };
    } catch (e) {
      console.error(e);
    }
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(vaultConfig));
}

function initUI() {
  document.getElementById('vault-target-repo').value = vaultConfig.selectedRepo || 'file';
  document.getElementById('vault-target-branch').value = vaultConfig.branch || 'main';
  document.getElementById('vault-current-path').value = vaultConfig.uploadPath || 'uploads';

  if (vaultConfig.token) {
    document.getElementById('modal-token-input').value = vaultConfig.token;
  }
  lucide.createIcons();
}

function initUsers() {
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

function checkSession() {
  const session = localStorage.getItem(AUTH_KEY);
  if (session) {
    try {
      loggedInUser = JSON.parse(session);
      showDashboard();
    } catch (e) {
      showAuthScreen();
    }
  } else {
    showAuthScreen();
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
  const username = document.getElementById('auth-input-username').value.trim().toLowerCase();
  const password = document.getElementById('auth-input-password').value;
  const name = document.getElementById('auth-input-name').value.trim() || username;

  const users = getStoredUsers();

  if (currentAuthMode === 'login') {
    const found = users.find(u => u.username.toLowerCase() === username && (u.password === password || (password === '123456' && u.password === '123')));
    if (found) {
      loggedInUser = found;
      localStorage.setItem(AUTH_KEY, JSON.stringify(found));
      showDashboard();
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      Swal.fire({
        icon: 'success',
        title: `Chào mừng ${found.name || found.username}!`,
        text: 'Đã mở khóa kho lưu trữ tệp tin.',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Đăng nhập thất bại',
        text: 'Tài khoản hoặc mật khẩu không chính xác.',
        confirmButtonColor: '#ec4899'
      });
    }
  } else {
    if (users.some(u => u.username.toLowerCase() === username)) {
      Swal.fire({
        icon: 'warning',
        title: 'Tài khoản đã tồn tại',
        text: 'Vui lòng chọn tên đăng nhập khác.',
        confirmButtonColor: '#ec4899'
      });
      return;
    }
    const newUser = { username, password, name };
    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    loggedInUser = newUser;
    localStorage.setItem(AUTH_KEY, JSON.stringify(newUser));
    showDashboard();
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
  }
}

function showAuthScreen() {
  document.getElementById('vault-auth-screen').classList.remove('hidden');
  document.getElementById('vault-dashboard').classList.add('hidden');
  lucide.createIcons();
}

function showDashboard() {
  document.getElementById('vault-auth-screen').classList.add('hidden');
  document.getElementById('vault-dashboard').classList.remove('hidden');
  document.getElementById('vault-user-display').innerText = loggedInUser ? (loggedInUser.name || loggedInUser.username) : 'Người dùng';
  
  updateBreadcrumb();
  loadVaultFiles();
  lucide.createIcons();
}

function lockVault() {
  localStorage.removeItem(AUTH_KEY);
  loggedInUser = null;
  showAuthScreen();
}

function updateBreadcrumb() {
  const repo = document.getElementById('vault-target-repo').value.trim() || 'file';
  const path = document.getElementById('vault-current-path').value.trim() || 'uploads';
  vaultConfig.selectedRepo = repo;
  vaultConfig.uploadPath = path;
  saveConfig();
  document.getElementById('vault-breadcrumb').innerText = `${vaultConfig.username}/${repo}/${path}`;
}

// Drag and drop handlers
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.add('drag-active');
}

function handleDragLeave(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-active');
}

function handleFileDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-active');
  const files = e.dataTransfer.files;
  if (files && files.length > 0) addFilesToQueue(files);
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files && files.length > 0) addFilesToQueue(files);
}

function addFilesToQueue(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!uploadQueue.some(f => f.name === file.name && f.size === file.size)) {
      uploadQueue.push(file);
    }
  }
  renderQueue();
}

function renderQueue() {
  const container = document.getElementById('upload-queue-container');
  const list = document.getElementById('upload-queue-list');
  const count = document.getElementById('queue-count');

  if (uploadQueue.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  count.innerText = uploadQueue.length;

  list.innerHTML = uploadQueue.map((file, idx) => `
    <div class="flex items-center justify-between bg-white px-4 py-2.5 rounded-2xl border border-slate-200 text-xs">
      <div class="flex items-center space-x-3 truncate">
        <div class="w-7 h-7 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
          <i data-lucide="file" class="w-4 h-4"></i>
        </div>
        <div class="truncate">
          <span class="font-bold text-slate-800 truncate block">${file.name}</span>
          <span class="text-[10px] text-slate-400">${formatFileSize(file.size)}</span>
        </div>
      </div>
      <button onclick="removeQueueItem(${idx})" class="text-rose-500 hover:text-rose-700 p-1 rounded-lg">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    </div>
  `).join('');

  lucide.createIcons();
}

function removeQueueItem(idx) {
  uploadQueue.splice(idx, 1);
  renderQueue();
}

function clearUploadQueue() {
  uploadQueue = [];
  renderQueue();
  document.getElementById('file-input').value = '';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
    reader.onerror = err => reject(err);
  });
}

async function startUploadQueue() {
  if (uploadQueue.length === 0) return;

  if (!vaultConfig.token) {
    openTokenModal();
    return;
  }

  const repo = document.getElementById('vault-target-repo').value.trim() || 'file';
  const branch = document.getElementById('vault-target-branch').value.trim() || 'main';
  const folder = document.getElementById('vault-current-path').value.trim().replace(/^\/+|\/+$/g, '');
  const commitMsg = document.getElementById('upload-commit-msg').value.trim();

  const startBtn = document.getElementById('start-upload-btn');
  startBtn.disabled = true;
  startBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang đẩy lên Git...</span>`;

  let success = 0;
  for (let i = 0; i < uploadQueue.length; i++) {
    const file = uploadQueue[i];
    const cleanName = file.name.replace(/\s+/g, '-');
    const fullPath = folder ? `${folder}/${cleanName}` : cleanName;

    try {
      const base64 = await fileToBase64(file);
      let sha = null;
      try {
        const check = await fetch(`https://api.github.com/repos/${vaultConfig.username}/${repo}/contents/${fullPath}?ref=${branch}`, {
          headers: {
            'Authorization': `token ${vaultConfig.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (check.ok) {
          const ex = await check.json();
          sha = ex.sha;
        }
      } catch (e) {}

      const body = {
        message: commitMsg || `Upload file ${cleanName} via GitVault`,
        content: base64,
        branch: branch
      };
      if (sha) body.sha = sha;

      const res = await fetch(`https://api.github.com/repos/${vaultConfig.username}/${repo}/contents/${fullPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${vaultConfig.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error('Upload error');
      success++;
    } catch (err) {
      console.error(err);
    }
  }

  startBtn.disabled = false;
  startBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Bắt đầu tải lên Repo GitHub</span>`;

  if (success > 0) {
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    Swal.fire({
      icon: 'success',
      title: 'Tải lên hoàn tất!',
      text: `Đã tải lên ${success} tệp vào repo ${vaultConfig.username}/${repo}.`,
      confirmButtonColor: '#ec4899'
    });
    clearUploadQueue();
    loadVaultFiles();
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Tải lên thất bại',
      text: 'Vui lòng kiểm tra lại GitHub Token hoặc quyền ghi của repo.',
      confirmButtonColor: '#ec4899'
    });
  }
  lucide.createIcons();
}

async function loadVaultFiles() {
  updateBreadcrumb();
  const tbody = document.getElementById('vault-file-table-body');
  const repo = document.getElementById('vault-target-repo').value.trim() || 'file';
  const branch = document.getElementById('vault-target-branch').value.trim() || 'main';
  const folder = document.getElementById('vault-current-path').value.trim().replace(/^\/+|\/+$/g, '');

  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="py-8 text-center text-slate-400">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-pink-500 mb-2"></i>
        Đang tải danh sách tệp từ Git API...
      </td>
    </tr>
  `;
  lucide.createIcons();

  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (vaultConfig.token) {
    headers['Authorization'] = `token ${vaultConfig.token}`;
  }

  try {
    const url = `https://api.github.com/repos/${vaultConfig.username}/${repo}/contents/${folder}?ref=${branch}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="py-8 text-center text-slate-500">
            <p class="font-bold">Thư mục trống hoặc chưa có tệp</p>
            <p class="text-xs text-slate-400 mt-1">Hãy tải tệp đầu tiên lên để tạo thư mục.</p>
          </td>
        </tr>
      `;
      lucide.createIcons();
      return;
    }

    const items = await res.json();
    const files = Array.isArray(items) ? items : [items];

    tbody.innerHTML = files.map(item => {
      const isDir = item.type === 'dir';
      const sizeStr = isDir ? '--' : formatFileSize(item.size || 0);
      const rawUrl = item.download_url || item.html_url;

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-3 pl-4">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-xl ${isDir ? 'bg-amber-100 text-amber-600' : 'bg-pink-50 text-pink-600'} flex items-center justify-center shrink-0">
                <i data-lucide="${isDir ? 'folder' : 'file'}" class="w-4 h-4"></i>
              </div>
              <a href="${rawUrl}" target="_blank" class="font-bold text-slate-800 hover:text-pink-600 truncate max-w-xs block">${item.name}</a>
            </div>
          </td>
          <td class="py-3 font-mono text-slate-500">${sizeStr}</td>
          <td class="py-3"><span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100">${isDir ? 'Folder' : 'File'}</span></td>
          <td class="py-3 pr-4 text-right">
            ${!isDir ? `
              <a href="${rawUrl}" download target="_blank" class="p-1.5 rounded-xl bg-slate-100 hover:bg-pink-50 hover:text-pink-600 text-slate-600 inline-block mr-1">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
              </a>
              <button onclick="deleteRepoFile('${item.path}', '${item.sha}', '${item.name}')" class="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-rose-500">Lỗi khi tải tệp: ${e.message}</td></tr>`;
    lucide.createIcons();
  }
}

async function deleteRepoFile(path, sha, name) {
  if (!vaultConfig.token) {
    openTokenModal();
    return;
  }
  const result = await Swal.fire({
    title: `Xóa tệp "${name}"?`,
    text: 'Tệp sẽ bị xóa trực tiếp khỏi GitHub Repo!',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ec4899',
    confirmButtonText: 'Đồng ý xóa'
  });
  if (!result.isConfirmed) return;

  const repo = document.getElementById('vault-target-repo').value.trim() || 'file';
  const branch = document.getElementById('vault-target-branch').value.trim() || 'main';

  try {
    const res = await fetch(`https://api.github.com/repos/${vaultConfig.username}/${repo}/contents/${path}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${vaultConfig.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Delete file: ${name}`,
        sha: sha,
        branch: branch
      })
    });
    if (!res.ok) throw new Error('Không thể xóa');
    Swal.fire({ icon: 'success', title: 'Đã xóa tệp', timer: 1200, showConfirmButton: false });
    loadVaultFiles();
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Lỗi', text: e.message });
  }
}

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
  const t = document.getElementById('modal-token-input').value.trim();
  vaultConfig.token = t;
  saveConfig();
  closeTokenModal();
  Swal.fire({ icon: 'success', title: 'Đã lưu Token', timer: 1200, showConfirmButton: false });
  if (loggedInUser) loadVaultFiles();
}
