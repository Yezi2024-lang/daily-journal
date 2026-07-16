// ═══════════════════════════════════════════
// 每日记录 — 认证模块 (Supabase Auth)
// ═══════════════════════════════════════════

let authTab = 'login'; // 'login' | 'register'

// ── 渲染认证面板 ──
function renderAuthPanel() {
  const body = document.getElementById('authSheetBody');
  if (!body) return;

  const supabase = getSupabase();

  // 检查是否已登录
  supabase?.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      renderLoggedIn(body, session.user.email);
    } else {
      renderAuthForm(body);
    }
  }).catch(() => {
    renderAuthForm(body);
  });
}

function renderLoggedIn(body, email) {
  body.innerHTML = `
    <div class="auth-status">
      <span style="font-size:24px;">👤</span>
      <span class="as-email">${escapeHtml(email)}</span>
      <span class="as-badge">已同步</span>
    </div>
    <div style="text-align:center;font-size:13px;color:var(--text2);margin-bottom:16px;">
      你的记录会自动在设备间同步 📡
    </div>
    <button class="sheet-btn" onclick="syncNow()">
      <span class="sico">🔄</span> 手动同步
    </button>
    <button class="sheet-btn danger" onclick="handleSignOut()">
      <span class="sico">🚪</span> 退出登录
    </button>
    <div style="text-align:center;font-size:11px;color:var(--text3);padding:12px 0;">
      退出后数据保留在本地，不会丢失
    </div>
  `;
}

function renderAuthForm(body) {
  body.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ${authTab === 'login' ? 'active' : ''}" onclick="switchAuthTab('login')">
        登录
      </button>
      <button class="auth-tab ${authTab === 'register' ? 'active' : ''}" onclick="switchAuthTab('register')">
        注册
      </button>
    </div>
    <input class="auth-input" type="email" id="authEmail" placeholder="电子邮箱" autocomplete="email">
    <input class="auth-input" type="password" id="authPassword" placeholder="密码（至少6位）" autocomplete="${authTab === 'login' ? 'current-password' : 'new-password'}">
    ${authTab === 'register' ? '<input class="auth-input" type="password" id="authPassword2" placeholder="确认密码" autocomplete="new-password">' : ''}
    <button class="auth-submit" onclick="handleAuthSubmit()">
      ${authTab === 'login' ? '🔐 登录' : '✍️ 注册'}
    </button>
    <div class="auth-msg" id="authMsg"></div>
    <div style="text-align:center;font-size:11px;color:var(--text3);padding:12px 0;">
      ${authTab === 'login' ? '还没有账号？点击上方"注册"创建' : '已有账号？点击上方"登录"'}
    </div>
  `;
}

function switchAuthTab(tab) {
  authTab = tab;
  const body = document.getElementById('authSheetBody');
  renderAuthForm(body);
}

// ── 认证操作 ──
async function handleAuthSubmit() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  if (!email || !password) {
    showAuthMsg('请填写邮箱和密码', 'error');
    return;
  }

  if (password.length < 6) {
    showAuthMsg('密码至少需要6位', 'error');
    return;
  }

  if (authTab === 'register') {
    const password2 = document.getElementById('authPassword2').value;
    if (password !== password2) {
      showAuthMsg('两次输入的密码不一致', 'error');
      return;
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    showAuthMsg('Supabase 未配置，请先设置', 'error');
    return;
  }

  showAuthMsg(authTab === 'login' ? '正在登录...' : '正在注册...', '');

  let result;
  if (authTab === 'login') {
    result = await supabase.auth.signInWithPassword({ email, password });
  } else {
    result = await supabase.auth.signUp({ email, password });
  }

  if (result.error) {
    // 翻译常见错误
    const msg = translateError(result.error.message);
    showAuthMsg(msg, 'error');
    return;
  }

  if (authTab === 'register') {
    showAuthMsg('✅ 注册成功！已自动登录', 'ok');
  } else {
    showAuthMsg('✅ 登录成功', 'ok');
  }

  // 首次登录 → 双向同步
  setTimeout(async () => {
    await pushAllToCloud();
    await syncFromCloud();
    renderAll();
    renderAuthPanel();
    updateSyncDot();
    closeAllSheets();
    toast('✅ 同步完成');
  }, 600);
}

async function handleSignOut() {
  const supabase = getSupabase();
  if (supabase) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem('sb_session');
  renderAuthPanel();
  updateSyncDot();
  toast('👋 已退出登录');
}

async function syncNow() {
  updateSyncDot('syncing');
  toast('🔄 正在同步...');
  await pushAllToCloud();
  const result = await syncFromCloud();
  renderAll();
  updateSyncDot();
  if (result.success) {
    toast(`✅ 同步完成 (${result.total || 0} 条)`);
  } else {
    toast('⚠️ 同步失败: ' + (result.reason || '未知错误'));
  }
}

// ── 辅助函数 ──
function showAuthMsg(msg, cls) {
  const el = document.getElementById('authMsg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'auth-msg ' + (cls || '');
}

function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return '邮箱或密码错误';
  if (msg.includes('already registered')) return '该邮箱已注册，请直接登录';
  if (msg.includes('Email not confirmed')) return '邮箱未验证，请先点击邮件中的链接';
  if (msg.includes('User already registered')) return '该邮箱已注册';
  return msg;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── 同步状态指示器 ──
async function updateSyncDot(state) {
  const dot = document.getElementById('syncDot');
  if (!dot) return;

  if (state) {
    dot.className = 'sync-dot ' + state;
    return;
  }

  // 自动检测状态
  if (!isOnline()) {
    dot.className = 'sync-dot offline';
    dot.title = '离线';
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    dot.className = 'sync-dot offline';
    dot.title = '未配置同步';
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    dot.className = session ? 'sync-dot synced' : 'sync-dot offline';
    dot.title = session ? '已同步' : '未登录';
  } catch {
    dot.className = 'sync-dot offline';
    dot.title = '连接失败';
  }
}

// ── 监听认证状态变化 ──
function initAuthListener() {
  const supabase = getSupabase();
  if (!supabase) return;

  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[认证] 状态变化:', event);
    if (event === 'SIGNED_IN') {
      localStorage.setItem('sb_session', JSON.stringify(session));
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem('sb_session');
    }
    updateSyncDot();
  });
}

// ── 监听网络状态变化 ──
window.addEventListener('online', () => {
  updateSyncDot();
  toast('🌐 网络已恢复');
  // 自动同步
  syncNow().catch(() => {});
});

window.addEventListener('offline', () => {
  updateSyncDot('offline');
  toast('📡 已离线，数据保存在本地');
});
