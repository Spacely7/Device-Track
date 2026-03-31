// ============================================================
// SHARED NAV + LAYOUT HELPERS
// ============================================================

function buildSidebar(activePage) {
  const session = DB.getSession();
  if (!session) return;

  const darkMode = localStorage.getItem('rt_dark') === '1';
  if (darkMode) document.body.classList.add('dark');

  const pages = [
    { section: 'Overview' },
    { id: 'dashboard',     icon: '🏠', label: 'Dashboard',          badge: null,        page: 'dashboard.html' },
    { section: 'Operations' },
    { id: 'issue',         icon: '📤', label: 'Retrieve Device',        badge: null,        page: 'issue.html' },
    { id: 'officer',       icon: '👤', label: 'Officer Tracker',     badge: null,        page: 'officer.html' },
    { id: 'fieldconfirm',  icon: '✅', label: 'Field Confirmation',   badge: 'g',         page: 'fieldconfirm.html' },
    { section: 'Device Status' },
    { id: 'retrieval',     icon: '📥', label: 'Retrieval',           badge: 'o',         page: 'retrieval.html' },
    { id: 'delayed',       icon: '⚠️',  label: 'Delayed',             badge: 'r',         page: 'delayed.html' },
    { id: 'timeline',      icon: '🕐', label: 'Device Timeline',     badge: null,        page: 'timeline.html' },
    { section: 'Insights' },
    { id: 'reports',       icon: '📋', label: 'Reports',             badge: null,        page: 'reports.html' },
    { id: 'analytics',     icon: '📊', label: 'Analytics',           badge: null,        page: 'analytics.html' },
    { id: 'performance',   icon: '🏆', label: 'Officer Performance', badge: null,        page: 'performance.html' },
    { section: 'Admin' },
    { id: 'roles',         icon: '🔐', label: 'Roles & Users',       badge: null,        page: 'roles.html' },
    { id: 'sla',           icon: '⏱️',  label: 'SLA Rules',           badge: null,        page: 'sla.html' },
    { id: 'bulkimport',    icon: '📁', label: 'Bulk Import',         badge: null,        page: 'bulkimport.html' },
    { id: 'sms',           icon: '💬', label: 'SMS / Alerts',        badge: null,        page: 'sms.html' },
    { id: 'mapview',       icon: '🗺️',  label: 'Map View',            badge: null,        page: 'mapview.html' },
    { section: 'Alerts' },
    { id: 'notifications', icon: '🔔', label: 'Notifications',       badge: 'o',         page: 'notifications.html' },
    { id: 'audit',         icon: '📜', label: 'Audit Log',           badge: null,        page: 'audit.html' },
  ];

  const devices = DB.getDevices();
  const waitingCount = devices.filter(d => d.status === 'Awaiting Retrieval' && d.fieldConfirmed && !d.isDelayed).length;
  const delayedCount = devices.filter(d => d.isDelayed && d.status !== 'Retrieved').length;
  const unconfirmedCount = devices.filter(d => !d.fieldConfirmed && d.status !== 'Retrieved').length;
  const unreadCount = DB.getUnreadCount();

  const badgeVals = {
    fieldconfirm: unconfirmedCount,
    retrieval: waitingCount,
    delayed: delayedCount,
    notifications: unreadCount,
  };

  let html = '';
  pages.forEach(p => {
    if (p.section) {
      html += `<div class="nav-section">${p.section}</div>`;
      return;
    }
    const hasAccess = canAccess(p.id);
    const isActive = p.id === activePage;
    const bv = badgeVals[p.id];
    const badgeHtml = (bv && bv > 0) ? `<span class="nav-badge ${p.badge === 'g' ? 'g' : p.badge === 'r' ? '' : 'o'}">${bv}</span>` : '';
    html += `<a href="${p.page}" class="nav-item${isActive ? ' active' : ''}${!hasAccess ? ' disabled' : ''}" title="${!hasAccess ? 'Access restricted for your role' : ''}">
      <span class="nav-icon">${p.icon}</span>${p.label}${badgeHtml}
    </a>`;
  });

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-logo">
      <div class="logo-icon">📦</div>
      <div>
        <div class="logo-text">Retrieval Track</div>
        <div class="logo-sub">Port Device Management</div>
      </div>
    </div>
    <nav class="sidebar-nav">${html}</nav>
    <div class="sidebar-footer">
      <div class="user-avatar-sm" style="background:${session.color || '#1a2b5c'}">${session.init || 'U'}</div>
      <div>
        <div class="user-name-sm">${session.name}</div>
        <div class="user-role-sm">${session.role}</div>
      </div>
      <button class="dark-toggle" onclick="toggleDark()" title="Toggle dark mode">🌙</button>
      <button class="logout-btn" onclick="logout()" title="Logout">⏻</button>
    </div>`;
}

function toggleDark() {
  document.body.classList.toggle('dark');
  localStorage.setItem('rt_dark', document.body.classList.contains('dark') ? '1' : '0');
}

function logout() {
  const s = DB.getSession();
  DB.addAudit('LOGOUT', `${s?.name} logged out`, s?.name || 'Unknown');
  DB.clearSession();
  // Works whether pages are in /pages/ subfolder or root
  const depth = window.location.pathname.includes('/pages/') ? '../index.html' : 'index.html';
  window.location.href = depth;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = type + ' show';
  setTimeout(() => t.classList.remove('show'), 3200);
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }

function regBadge(r) {
  const cls = { Warehouse: 'reg-Warehouse', Freezones: 'reg-Freezones', 'Re-Export': 'reg-Re-Export', Transit: 'reg-Transit', Petroleum: 'reg-Petroleum' };
  return `<span class="reg ${cls[r] || ''}">${r}</span>`;
}

function fmtDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtDateTime(d) { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function fmtRelTime(d) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

function renderPagination(type, total, cur, onPage) {
  const pages = Math.ceil(total / 10);
  const el = document.getElementById(type + '-pages');
  if (!el) return;
  el.innerHTML = Array.from({ length: pages }, (_, i) =>
    `<button class="page-btn${i + 1 === cur ? ' active' : ''}" onclick="${onPage}(${i + 1})">${i + 1}</button>`
  ).join('');
}

function drawDonut(svgId, legendId, segs, total) {
  const svg = document.getElementById(svgId); if (!svg) return;
  const cx = 65, cy = 65, r = 48, stroke = 20, circ = 2 * Math.PI * r;
  let off = 0, paths = '';
  segs.forEach(s => {
    const dash = total > 0 ? (s.val / total) * circ : 0;
    paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90,${cx},${cy})"/>`;
    off += dash;
  });
  const isDark = document.body.classList.contains('dark');
  svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r + stroke / 2 + 1}" fill="${isDark ? '#0a1020' : '#f0f2f8'}"/><circle cx="${cx}" cy="${cy}" r="${r - stroke / 2 - 1}" fill="${isDark ? '#111827' : '#fff'}"/>${paths}<text x="${cx}" y="${cy - 3}" text-anchor="middle" fill="${isDark ? '#e8eaf6' : '#1a1f36'}" font-family="Syne,sans-serif" font-weight="800" font-size="18">${total}</text><text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="${isDark ? '#7b89b0' : '#6b7494'}" font-size="9">devices</text>`;
  const leg = document.getElementById(legendId); if (leg) leg.innerHTML = segs.map(s => `<div class="legend-item"><div class="legend-dot" style="background:${s.color}"></div><span>${s.label}: <strong>${total > 0 ? (s.val / total * 100).toFixed(0) : 0}%</strong></span></div>`).join('');
}

function drawMonthChart(canvasId, data) {
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const today = new Date(DB.today());
  const months = [];
  for (let i = 5; i >= 0; i--) { let d = new Date(today); d.setMonth(d.getMonth() - i); months.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }); }
  const ret = months.map(m => data.filter(d => d.status === 'Retrieved' && d.issued && d.issued.startsWith(m.key)).length);
  const del = months.map(m => data.filter(d => d.isDelayed && d.issued && d.issued.startsWith(m.key)).length);
  const maxV = Math.max(...ret, ...del, 1);
  const W = canvas.width, H = canvas.height, pad = { t: 16, r: 10, b: 28, l: 28 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const isDark = document.body.classList.contains('dark');
  ctx.fillStyle = isDark ? '#111827' : '#f8f9ff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = isDark ? '#1e2a40' : '#e2e6f0'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = pad.t + cH * (1 - i / 4); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); }
  const bw = cW / months.length / 3;
  months.forEach((m, i) => {
    const x = pad.l + i * (cW / months.length) + (cW / months.length - bw * 2.5) / 2;
    const rh = ret[i] / maxV * cH; ctx.fillStyle = '#00c5a3'; ctx.fillRect(x, pad.t + cH - rh, bw, rh);
    const dh = del[i] / maxV * cH; ctx.fillStyle = '#e84040'; ctx.fillRect(x + bw + 2, pad.t + cH - dh, bw, dh);
    ctx.fillStyle = isDark ? '#7b89b0' : '#6b7494'; ctx.font = '10px DM Sans,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.label, x + bw, H - 6);
  });
  ctx.fillStyle = '#00c5a3'; ctx.fillRect(W - 90, 8, 8, 8); ctx.fillStyle = isDark ? '#7b89b0' : '#6b7494'; ctx.font = '10px DM Sans'; ctx.textAlign = 'left'; ctx.fillText('Retrieved', W - 78, 16);
  ctx.fillStyle = '#e84040'; ctx.fillRect(W - 90, 22, 8, 8); ctx.fillText('Delayed', W - 78, 30);
}
