// ═══════════════════════════════════════════
// 每日记录 — 主应用逻辑
// ═══════════════════════════════════════════

// ── 状态 ──
let selectedDate = todayStr();
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
let currentRating = 0;
let fabTimeout = null;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isToday(ds) { return ds === todayStr(); }

// ── 渲染引擎 ──
function renderAll() {
  loadEntryToForm(selectedDate);
  renderCalSheet();
  renderHistList();
  updateDateBar();
}

function updateDateBar() {
  const d = new Date(selectedDate + 'T00:00:00');
  const wd = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const today = todayStr();
  const yday = new Date(Date.now()-864e5);
  const ydayStr = `${yday.getFullYear()}-${String(yday.getMonth()+1).padStart(2,'0')}-${String(yday.getDate()).padStart(2,'0')}`;

  document.getElementById('weekdayDisplay').textContent = wd[d.getDay()];
  document.getElementById('dateDisplay').textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;

  let h = '';
  if (selectedDate === today) h = '📌 今天';
  else if (selectedDate === ydayStr) h = '📌 昨天';
  else if (selectedDate > today) h = '🔒 未来日期 · 只读';
  document.getElementById('hintDisplay').textContent = h;
}

function loadEntryToForm(ds) {
  const e = getEntry(ds);
  document.getElementById('happyInput').value = e?.happy || '';
  document.getElementById('unhappyInput').value = e?.unhappy || '';
  document.getElementById('thinkInput').value = e?.think || '';
  currentRating = e?.rating || 0;
  renderStars();
  updateDateBar();

  const ro = ds > todayStr();
  ['happyInput','unhappyInput','thinkInput'].forEach(id => {
    const el = document.getElementById(id);
    el.readOnly = ro;
    el.style.background = ro ? '#f9f8f6' : '#fdfdfc';
    el.style.color = ro ? '#a0988c' : 'var(--text)';
  });
}

// ── 评分星星 ──
const rateLabels = ['','很差','较差','一般','还行','中等','不错','挺好','很好','很棒','完美'];

function renderStars() {
  const container = document.getElementById('starRating');
  const numEl = document.getElementById('ratingNumber');
  const lblEl = document.getElementById('ratingLabel');
  const ro = selectedDate > todayStr();

  let h = '';
  for (let i = 1; i <= 10; i++) {
    h += `<button class="star-btn${i <= currentRating ? ' on' : ''}" ${ro ? 'disabled' : ''} onclick="setRating(${i})" aria-label="${i}分">★</button>`;
  }
  container.innerHTML = h;
  numEl.textContent = currentRating || '0';
  numEl.className = 'rate-num' + (currentRating > 0 ? ' scored' : '');
  lblEl.textContent = currentRating > 0 ? rateLabels[currentRating] : (ro ? '' : '点击评分');
}

function setRating(v) {
  if (selectedDate > todayStr()) return;
  currentRating = v;
  renderStars();
  autoSave();
  if (navigator.vibrate) navigator.vibrate(10);
}

// ── 保存（本地 + 云端双写） ──
let autoSaveTimer = null;
function autoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => doSave(true), 600);
}

['happyInput','unhappyInput','thinkInput'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (selectedDate <= todayStr()) autoSave();
  });
});

function manualSave() {
  clearTimeout(autoSaveTimer);
  doSave(false);
}

async function doSave(silent) {
  if (selectedDate > todayStr()) {
    if (!silent) toast('不能编辑未来的日期');
    return;
  }

  const entry = {
    happy: document.getElementById('happyInput').value.trim(),
    unhappy: document.getElementById('unhappyInput').value.trim(),
    think: document.getElementById('thinkInput').value.trim(),
    rating: currentRating,
    updatedAt: new Date().toISOString()
  };

  // 1. 写入本地存储（始终执行）
  setEntry(selectedDate, entry);

  // 2. 推送到云端（如果已登录且有网络）
  if (isOnline()) {
    const pushed = await pushEntryToCloud(selectedDate, entry);
    if (pushed) {
      updateSyncDot('synced');
    }
  }

  // 3. 更新 UI
  renderCalSheet();
  renderHistList();

  if (!silent) {
    toast('✅ 已保存');
    const fab = document.getElementById('fabBtn');
    fab.classList.add('saved');
    clearTimeout(fabTimeout);
    fabTimeout = setTimeout(() => fab.classList.remove('saved'), 1500);
  }
}

// ── 日期导航 ──
function selectDate(ds) {
  selectedDate = ds;
  const d = new Date(ds + 'T00:00:00');
  calYear = d.getFullYear();
  calMonth = d.getMonth();
  renderAll();
  closeAllSheets();
}

function goPrevDay() {
  const d = new Date(selectedDate + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  selectDate(toStr(d));
}

function goNextDay() {
  const d = new Date(selectedDate + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  selectDate(toStr(d));
}

function goToToday() {
  selectDate(todayStr());
  calMonth = new Date().getMonth();
  calYear = new Date().getFullYear();
}

function toStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── 滑动手势 ──
let touchStartX = 0, touchStartY = 0;
const scrollArea = document.getElementById('scrollArea');

scrollArea.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

scrollArea.addEventListener('touchend', (e) => {
  const dx = (e.changedTouches[0]?.clientX || touchStartX) - touchStartX;
  const dy = Math.abs((e.changedTouches[0]?.clientY || touchStartY) - touchStartY);
  if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.3) {
    if (dx < 0) goNextDay();
    else goPrevDay();
  }
});

// ── 面板控制 ──
function openCalendar() {
  calYear = new Date(selectedDate + 'T00:00:00').getFullYear();
  calMonth = new Date(selectedDate + 'T00:00:00').getMonth();
  renderCalSheet();
  renderHistList();
  showSheet('calendarSheet');
}

function openMenu() { showSheet('menuSheet'); }

function openAccount() {
  renderAuthPanel();
  showSheet('accountSheet');
}

function showSheet(id) {
  document.getElementById('overlay').classList.add('open');
  document.getElementById(id).classList.add('open');
}

function closeAllSheets() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('calendarSheet').classList.remove('open');
  document.getElementById('menuSheet').classList.remove('open');
  document.getElementById('accountSheet').classList.remove('open');
}

// ── 日历面板渲染 ──
function calChangeMonth(d) {
  calMonth += d;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalSheet();
}

function renderCalSheet() {
  document.getElementById('calMonthLabel').textContent = `${calYear}年 ${calMonth+1}月`;
  const grid = document.getElementById('calGrid');
  if (!grid) return; // 可能还没渲染 DOM
  const entries = loadAll();
  const fd = new Date(calYear, calMonth, 1).getDay();
  const dim = new Date(calYear, calMonth+1, 0).getDate();
  const pdim = new Date(calYear, calMonth, 0).getDate();
  const today = todayStr();

  let h = '';
  for (let i = fd-1; i >= 0; i--) {
    h += `<div class="cal-day other">${pdim - i}</div>`;
  }
  for (let d = 1; d <= dim; d++) {
    const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'cal-day';
    if (ds === today) cls += ' today';
    if (ds === selectedDate) cls += ' sel';
    if (entries[ds]) cls += ' dot';
    h += `<div class="${cls}" onclick="selectDate('${ds}')">${d}</div>`;
  }
  const rem = 7 - ((fd + dim) % 7);
  if (rem < 7) for (let d=1; d<=rem; d++) h += `<div class="cal-day other">${d}</div>`;
  grid.innerHTML = h;
}

function renderHistList() {
  const container = document.getElementById('histList');
  if (!container) return;
  const entries = loadAll();
  const dates = Object.keys(entries).sort().reverse();
  if (!dates.length) {
    container.innerHTML = '<div class="empty"><div class="eicon">📝</div>还没有记录</div>';
    return;
  }
  let h = '';
  for (const ds of dates.slice(0, 30)) {
    const e = entries[ds];
    const act = ds === selectedDate ? ' active' : '';
    const d = new Date(ds + 'T00:00:00');
    const label = `${d.getMonth()+1}/${d.getDate()} ${['日','一','二','三','四','五','六'][d.getDay()]}`;
    const sc = e.rating > 0 ? `<span class="hist-score">${e.rating}分</span>` : '';
    h += `<div class="hist-item${act}" onclick="selectDate('${ds}')"><span class="hist-date">${label}</span>${sc}</div>`;
  }
  container.innerHTML = h;
}

// ── 菜单操作 ──
async function clearTodayViaMenu() {
  if (!confirm(`确定清空 ${selectedDate} 的全部记录吗？\n此操作不可撤销。`)) return;

  // 删除本地
  setEntry(selectedDate, null);

  // 删除云端
  if (isOnline()) {
    await deleteEntryFromCloud(selectedDate);
  }

  currentRating = 0;
  loadEntryToForm(selectedDate);
  renderStars();
  renderCalSheet();
  renderHistList();
  closeAllSheets();
  toast('🗑 已清空');
}

function exportData() {
  const blob = new Blob([JSON.stringify(loadAll(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `每日记录_备份_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  closeAllSheets();
  toast('📥 已导出');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const imported = JSON.parse(ev.target.result);
      if (typeof imported !== 'object') throw new Error();
      if (confirm('"确定"=合并数据  |  "取消"=替换全部')) {
        const existing = loadAll();
        Object.assign(existing, imported);
        saveAll(existing);
      } else {
        saveAll(imported);
      }
      closeAllSheets();
      renderAll();
      toast('📤 已导入');
      // 导入后尝试同步到云端
      pushAllToCloud().catch(() => {});
    } catch { alert('导入失败：格式错误'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── Toast ──
function toast(msg) {
  const old = document.querySelector('.toast');
  if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 300); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 1800);
}

// ── 键盘快捷键 ──
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); manualSave(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); goPrevDay(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); goNextDay(); }
  if (e.key >= '0' && e.key <= '9' && document.activeElement === document.body) {
    setRating(e.key === '0' ? 10 : parseInt(e.key));
  }
  if (e.key === 'Escape') { closeAllSheets(); }
});

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── 启动 ──
async function boot() {
  renderAll();

  // 初始化 Supabase
  const supabase = getSupabase();
  if (supabase) {
    initAuthListener();

    // 尝试恢复 session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      console.log('[启动] 已登录:', session.user.email);
      // 双向同步
      await syncFromCloud();
      await pushAllToCloud();
      renderAll();
    }
  }

  updateSyncDot();
}

// 页面加载完成后启动
document.addEventListener('DOMContentLoaded', boot);
