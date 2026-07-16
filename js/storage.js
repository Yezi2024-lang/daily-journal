// ═══════════════════════════════════════════
// 每日记录 — 数据层 (localStorage + Supabase 双写)
// ═══════════════════════════════════════════

const STORAGE_KEY = 'daily_journal_entries';
let supabaseClient = null;

// ── Supabase 初始化 ──
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    console.log('[存储] Supabase 未配置，仅使用本地存储');
    return null;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[存储] Supabase 已连接');
    return supabaseClient;
  } catch (e) {
    console.warn('[存储] Supabase 初始化失败:', e.message);
    return null;
  }
}

// ── 本地存储 (始终可用) ──
function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getEntry(ds) {
  return loadAll()[ds] || null;
}

function setEntry(ds, entry) {
  const data = loadAll();
  if (entry === null) {
    delete data[ds];
  } else {
    data[ds] = entry;
  }
  saveAll(data);
}

// ── 云端同步 ──

// 检查是否已登录
function isLoggedIn() {
  const supabase = getSupabase();
  if (!supabase) return false;
  // 同步检查 localStorage 中缓存的 session
  const cached = localStorage.getItem('sb_session');
  return !!cached;
}

// 从云端拉取所有数据并合并到本地（云端优先）
async function syncFromCloud() {
  const supabase = getSupabase();
  if (!supabase) return { success: false, reason: 'Supabase 未配置' };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, reason: '未登录' };

  const { data, error } = await supabase
    .from('journal_entries')
    .select('date, happy, unhappy, think, rating, updated_at');

  if (error) {
    console.error('[同步] 拉取失败:', error.message);
    return { success: false, reason: error.message };
  }

  const local = loadAll();
  let merged = 0;

  for (const row of data) {
    const ds = row.date;
    const cloudEntry = {
      happy: row.happy || '',
      unhappy: row.unhappy || '',
      think: row.think || '',
      rating: row.rating || 0,
      updatedAt: row.updated_at
    };
    const localEntry = local[ds];

    if (!localEntry) {
      // 本地没有 → 用云端的
      local[ds] = cloudEntry;
      merged++;
    } else {
      // 两边都有 → 比较 updatedAt，新的覆盖旧的
      const cloudTime = new Date(row.updated_at).getTime();
      const localTime = localEntry.updatedAt ? new Date(localEntry.updatedAt).getTime() : 0;
      if (cloudTime > localTime) {
        local[ds] = cloudEntry;
        merged++;
      }
      // 否则：本地更新 → 保留本地，稍后 pushToCloud 会上传
    }
  }

  saveAll(local);
  console.log(`[同步] 云端 → 本地: ${merged} 条更新, 共 ${data.length} 条`);
  return { success: true, merged, total: data.length };
}

// 推送单条记录到云端
async function pushEntryToCloud(ds, entry) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const row = {
    date: ds,
    happy: entry.happy || '',
    unhappy: entry.unhappy || '',
    think: entry.think || '',
    rating: entry.rating || 0,
    updated_at: entry.updatedAt || new Date().toISOString()
  };

  const { error } = await supabase
    .from('journal_entries')
    .upsert(row, { onConflict: 'user_id, date' });

  if (error) {
    console.error('[同步] 上传失败:', error.message);
    return false;
  }
  return true;
}

// 从云端删除单条记录
async function deleteEntryFromCloud(ds) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('date', ds);

  if (error) {
    console.error('[同步] 删除失败:', error.message);
    return false;
  }
  return true;
}

// 推送所有本地数据到云端（首次登录时调用）
async function pushAllToCloud() {
  const supabase = getSupabase();
  if (!supabase) return { success: false, reason: 'Supabase 未配置' };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, reason: '未登录' };

  const local = loadAll();
  const rows = Object.entries(local).map(([ds, entry]) => ({
    date: ds,
    happy: entry.happy || '',
    unhappy: entry.unhappy || '',
    think: entry.think || '',
    rating: entry.rating || 0,
    updated_at: entry.updatedAt || new Date().toISOString()
  }));

  if (rows.length === 0) return { success: true, pushed: 0 };

  const { error } = await supabase
    .from('journal_entries')
    .upsert(rows, { onConflict: 'user_id, date' });

  if (error) {
    console.error('[同步] 批量上传失败:', error.message);
    return { success: false, reason: error.message };
  }

  console.log(`[同步] 本地 → 云端: ${rows.length} 条`);
  return { success: true, pushed: rows.length };
}

// 判断是否有网络
function isOnline() {
  return navigator.onLine;
}

// 获取当前同步状态
async function getSyncStatus() {
  if (!isOnline()) return 'offline';
  const supabase = getSupabase();
  if (!supabase) return 'offline';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'offline';
  return 'synced';
}
