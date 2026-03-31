// ============================================================
// RETRIEVAL TRACK — DATABASE (localStorage-backed)
// ============================================================

const DB = {
  // ── KEYS ──────────────────────────────────────────────────
  KEYS: {
    DEVICES:       'rt_devices',
    USERS:         'rt_users',
    ISSUANCES:     'rt_issuances',
    NOTIFICATIONS: 'rt_notifications',
    SMS_LOG:       'rt_sms_log',
    AUDIT_LOG:     'rt_audit_log',
    SLA:           'rt_sla',
    SESSION:       'rt_session',
  },

  // ── HELPERS ───────────────────────────────────────────────
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch { return null; }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  now() { return new Date().toISOString(); },
  today() { return '2026-02-19'; },
  fmtDate(d) { return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); },
  fmtISO(d) { return new Date(d).toISOString().split('T')[0]; },
  addDays(d, n) { let r = new Date(d); r.setDate(r.getDate() + n); return r; },
  ri: (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
  pick: arr => arr[Math.floor(Math.random() * arr.length)],
  uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2),

  // ── CONSTANTS ─────────────────────────────────────────────
  REGIMES: ['Warehouse', 'Freezones', 'Re-Export', 'Transit', 'Petroleum'],
  AGENCIES: [
    'COMPASS POWER AFRICA LTD','KOMENDA SUGAR FACTORY','RONOR MOTORS',
    'WEB HELP GHANA','DAILY FOOD','WESTERN BEVERAGES LTD','CAVE AND GARDEN',
    'GLOBAL POLY GHANA','MIRO TIMBER','KING RECYCLING SOLUTIONS LTD'
  ],
  DESTS: ['Elubo','Daily food Limited','Sunda Ghana Ltd','Spaceplast Gh Ltd',
          'Newrest','Paga','Keda','Kumasi','Tema','Takoradi'],
  OFFICERS_DATA: {
    'Yaw Boateng':   { phone:'233597563674', color:'#1a2b5c', init:'YB' },
    'Kojo Rexford':  { phone:'233206748677', color:'#007a67', init:'KR' },
    'Elias Brown':   { phone:'233244675874', color:'#8a4000', init:'EB' },
    'Kofi Brew':     { phone:'233509765467', color:'#6b00aa', init:'KB' },
  },
  REG_COLORS: { Warehouse:'#0f1a3c', Freezones:'#00c5a3', 'Re-Export':'#d4a000', Transit:'#f0833a', Petroleum:'#e84040' },

  // ── SLA ───────────────────────────────────────────────────
  getSLA() {
    return this.get(this.KEYS.SLA) || { Warehouse:3, Freezones:2, 'Re-Export':5, Transit:5, Petroleum:3 };
  },
  setSLA(rules) { this.set(this.KEYS.SLA, rules); },

  // ── AUTH / SESSION ────────────────────────────────────────
  getSession() { return this.get(this.KEYS.SESSION); },
  setSession(user) { this.set(this.KEYS.SESSION, { ...user, loginTime: this.now() }); },
  clearSession() { localStorage.removeItem(this.KEYS.SESSION); },
  requireAuth(allowedRoles) {
    const s = this.getSession();
    if (!s) { const depth = window.location.pathname.includes('/pages/') ? '../index.html' : 'index.html'; window.location.href = depth; return null; }
    if (allowedRoles && !allowedRoles.includes(s.role)) {
      window.location.href = 'dashboard.html';
      return null;
    }
    return s;
  },

  // ── USERS ─────────────────────────────────────────────────
  getUsers() { return this.get(this.KEYS.USERS) || []; },
  setUsers(users) { this.set(this.KEYS.USERS, users); },
  getUserByCredentials(username, password) {
    return this.getUsers().find(u => u.username === username && u.password === password && u.active);
  },
  addUser(user) {
    const users = this.getUsers();
    user.id = this.uid();
    user.createdAt = this.now();
    user.active = true;
    users.push(user);
    this.setUsers(users);
    this.addAudit('USER_CREATED', `User "${user.name}" created`, 'System', { userId: user.id });
    return user;
  },
  updateUser(id, updates) {
    const users = this.getUsers().map(u => u.id === id ? { ...u, ...updates } : u);
    this.setUsers(users);
  },

  // ── DEVICES ───────────────────────────────────────────────
  getDevices() { return this.get(this.KEYS.DEVICES) || []; },
  setDevices(devices) { this.set(this.KEYS.DEVICES, devices); },
  getDevice(id) { return this.getDevices().find(d => d.id === id); },
  addDevice(device) {
    const devices = this.getDevices();
    device.createdAt = this.now();
    device.auditLog = device.auditLog || [];
    devices.push(device);
    this.setDevices(devices);
    this.addAudit('DEVICE_ADDED', `Device ${device.id} added`, device.addedBy || 'System', { deviceId: device.id });
    return device;
  },
  updateDevice(id, updates) {
    const devices = this.getDevices().map(d => d.id === id ? { ...d, ...updates } : d);
    this.setDevices(devices);
  },
  recalcDelays() {
    const sla = this.getSLA();
    const today = new Date(this.today());
    const devices = this.getDevices().map(d => {
      if (d.status === 'Retrieved') return d;
      const daysOverdue = Math.max(0, Math.floor((today - new Date(d.expectedReturn)) / 86400000));
      const threshold = sla[d.regime] || 3;
      const isDelayed = daysOverdue >= threshold;
      return { ...d, daysOverdue, isDelayed, status: isDelayed ? 'Delayed' : (d.status === 'Delayed' ? 'Awaiting Retrieval' : d.status) };
    });
    this.setDevices(devices);
  },

  // ── ISSUANCES ─────────────────────────────────────────────
  getIssuances() { return this.get(this.KEYS.ISSUANCES) || []; },
  addIssuance(rec) {
    const issuances = this.getIssuances();
    rec.id = this.uid();
    rec.createdAt = this.now();
    issuances.push(rec);
    this.set(this.KEYS.ISSUANCES, issuances);
    this.addAudit('ISSUANCE', `${rec.officer} issued ${rec.collected} device(s) from ${rec.agency}`, rec.issuedBy || rec.officer, rec);
    return rec;
  },

  // ── NOTIFICATIONS ─────────────────────────────────────────
  getNotifications() { return this.get(this.KEYS.NOTIFICATIONS) || []; },
  addNotification(n) {
    const notifs = this.getNotifications();
    n.id = this.uid();
    n.createdAt = this.now();
    n.unread = true;
    notifs.unshift(n);
    this.set(this.KEYS.NOTIFICATIONS, notifs.slice(0, 200));
    return n;
  },
  markNotifRead(id) {
    const notifs = this.getNotifications().map(n => n.id === id ? { ...n, unread: false } : n);
    this.set(this.KEYS.NOTIFICATIONS, notifs);
  },
  markAllNotifsRead() {
    const notifs = this.getNotifications().map(n => ({ ...n, unread: false }));
    this.set(this.KEYS.NOTIFICATIONS, notifs);
  },
  getUnreadCount() { return this.getNotifications().filter(n => n.unread).length; },

  // ── SMS LOG ───────────────────────────────────────────────
  getSMSLog() { return this.get(this.KEYS.SMS_LOG) || []; },
  addSMS(entry) {
    const log = this.getSMSLog();
    entry.id = this.uid();
    entry.createdAt = this.now();
    log.unshift(entry);
    this.set(this.KEYS.SMS_LOG, log.slice(0, 500));
  },

  // ── AUDIT LOG ─────────────────────────────────────────────
  getAuditLog() { return this.get(this.KEYS.AUDIT_LOG) || []; },
  addAudit(action, detail, actor, meta = {}) {
    const log = this.getAuditLog();
    log.unshift({ id: this.uid(), action, detail, actor, meta, timestamp: this.now() });
    this.set(this.KEYS.AUDIT_LOG, log.slice(0, 1000));
  },

  // ── SEED DATA ─────────────────────────────────────────────
  isSeeded() { return !!localStorage.getItem('rt_seeded'); },
  seed() {
    if (this.isSeeded()) return;

    // Users
    this.setUsers([
      { id:'u1', name:'Admin User',   username:'admin',  password:'admin123',  role:'Administrator',    color:'#1a2b5c', init:'AD', contact:'admin@port.gh',    active:true, createdAt:this.now() },
      { id:'u2', name:'Ama Owusu',    username:'ama',    password:'pass123',   role:'Supervisor',       color:'#e84040', init:'AO', contact:'233201234567',     active:true, createdAt:this.now() },
      { id:'u3', name:'Yaw Boateng',  username:'yaw',    password:'pass123',   role:'Retrieval Officer',color:'#1a2b5c', init:'YB', contact:'233597563674',     active:true, createdAt:this.now() },
      { id:'u4', name:'Kojo Rexford', username:'kojo',   password:'pass123',   role:'Retrieval Officer',color:'#007a67', init:'KR', contact:'233206748677',     active:true, createdAt:this.now() },
      { id:'u5', name:'Elias Brown',  username:'elias',  password:'pass123',   role:'Office Retrieval',    color:'#8a4000', init:'EB', contact:'233244675874',     active:true, createdAt:this.now() },
      { id:'u6', name:'Kofi Brew',    username:'kofi',   password:'pass123',   role:'Retrieval Officer',color:'#6b00aa', init:'KB', contact:'233509765467',     active:true, createdAt:this.now() },
    ]);

    // SLA
    this.setSLA({ Warehouse:3, Freezones:2, 'Re-Export':5, Transit:5, Petroleum:3 });

    // Devices
    const TODAY = new Date(this.today());
    const addD = (d, n) => { let r = new Date(d); r.setDate(r.getDate() + n); return this.fmtISO(r); };
    const seeded = [
      { id:'8294402634', regime:'Warehouse',  agency:'COMPASS POWER AFRICA LTD', dest:'Elubo',              io:-3,  ro:14, fc:true  },
      { id:'8294402610', regime:'Warehouse',  agency:'KOMENDA SUGAR FACTORY',    dest:'Daily food Limited', io:-5,  ro:14, fc:true  },
      { id:'8294402587', regime:'Warehouse',  agency:'RONOR MOTORS',             dest:'Sunda Ghana Ltd',    io:-3,  ro:14, fc:true  },
      { id:'8294402577', regime:'Warehouse',  agency:'WEB HELP GHANA',           dest:'Spaceplast Gh Ltd',  io:-3,  ro:8,  fc:true  },
      { id:'8150640211', regime:'Freezones',  agency:'CAVE AND GARDEN',          dest:'Newrest',            io:-3,  ro:7,  fc:true  },
      { id:'81506402562',regime:'Warehouse',  agency:'COMPASS POWER AFRICA LTD', dest:'Elubo',              io:-16, ro:5,  fc:true  },
      { id:'8150640374', regime:'Petroleum',  agency:'DAILY FOOD',               dest:'Paga',               io:-25, ro:5,  fc:true  },
      { id:'8150640436', regime:'Transit',    agency:'MIRO TIMBER',              dest:'Keda',               io:-6,  ro:5,  fc:false },
      { id:'8294402562', regime:'Warehouse',  agency:'WESTERN BEVERAGES LTD',    dest:'Tema',               io:-2,  ro:12, fc:true  },
      { id:'8294402557', regime:'Freezones',  agency:'GLOBAL POLY GHANA',        dest:'Takoradi',           io:-4,  ro:10, fc:false },
      { id:'8294402553', regime:'Re-Export',  agency:'RONOR MOTORS',             dest:'Kumasi',             io:-7,  ro:15, fc:true  },
      { id:'8294402545', regime:'Transit',    agency:'MIRO TIMBER',              dest:'Keda',               io:-8,  ro:8,  fc:true  },
      { id:'8294402511', regime:'Petroleum',  agency:'DAILY FOOD',               dest:'Paga',               io:-10, ro:5,  fc:false },
      { id:'8294402446', regime:'Warehouse',  agency:'KOMENDA SUGAR FACTORY',    dest:'Kumasi',             io:-12, ro:18, fc:true  },
      { id:'8294402404', regime:'Freezones',  agency:'CAVE AND GARDEN',          dest:'Newrest',            io:-2,  ro:10, fc:true  },
      { id:'8294402378', regime:'Warehouse',  agency:'GLOBAL POLY GHANA',        dest:'Takoradi',           io:-15, ro:7,  fc:false },
      { id:'8294402349', regime:'Re-Export',  agency:'WESTERN BEVERAGES LTD',    dest:'Elubo',              io:-1,  ro:21, fc:true  },
      { id:'8294402340', regime:'Transit',    agency:'WEB HELP GHANA',           dest:'Paga',               io:-9,  ro:6,  fc:true  },
      { id:'8294402303', regime:'Warehouse',  agency:'KING RECYCLING SOLUTIONS LTD','dest':'Tema',          io:-4,  ro:12, fc:true  },
      { id:'8294402274', regime:'Petroleum',  agency:'RONOR MOTORS',             dest:'Takoradi',           io:-20, ro:4,  fc:true  },
      { id:'8294402256', regime:'Freezones',  agency:'COMPASS POWER AFRICA LTD', dest:'Sunda Ghana Ltd',    io:-6,  ro:9,  fc:false },
      { id:'8294402229', regime:'Re-Export',  agency:'MIRO TIMBER',              dest:'Keda',               io:-3,  ro:14, fc:true  },
      { id:'8294402204', regime:'Warehouse',  agency:'DAILY FOOD',               dest:'Daily food Limited', io:-18, ro:3,  fc:true  },
      { id:'8150640057', regime:'Transit',    agency:'CAVE AND GARDEN',          dest:'Kumasi',             io:-5,  ro:8,  fc:true  },
      { id:'8150640085', regime:'Petroleum',  agency:'KING RECYCLING SOLUTIONS LTD','dest':'Tema',          io:-7,  ro:5,  fc:false },
      { id:'8150640177', regime:'Freezones',  agency:'KOMENDA SUGAR FACTORY',    dest:'Newrest',            io:-11, ro:6,  fc:true  },
      { id:'8025134271', regime:'Warehouse',  agency:'WEB HELP GHANA',           dest:'Spaceplast Gh Ltd',  io:-2,  ro:16, fc:true  },
      { id:'8025134378', regime:'Re-Export',  agency:'GLOBAL POLY GHANA',        dest:'Elubo',              io:-14, ro:9,  fc:true  },
      { id:'8025134394', regime:'Transit',    agency:'WESTERN BEVERAGES LTD',    dest:'Tema',               io:-3,  ro:11, fc:false },
      { id:'8025134410', regime:'Petroleum',  agency:'COMPASS POWER AFRICA LTD', dest:'Takoradi',           io:-22, ro:3,  fc:true  },
      { id:'8025134474', regime:'Warehouse',  agency:'RONOR MOTORS',             dest:'Kumasi',             io:-6,  ro:14, fc:true  },
      { id:'8025134495', regime:'Freezones',  agency:'MIRO TIMBER',              dest:'Keda',               io:-4,  ro:7,  fc:true  },
    ];

    const offNames = Object.keys(this.OFFICERS_DATA);
    const sla = this.getSLA();
    const devices = [];

    seeded.forEach(s => {
      const issued = addD(this.today(), s.io);
      const expectedReturn = addD(issued, s.ro);
      const daysOverdue = Math.max(0, Math.floor((TODAY - new Date(expectedReturn)) / 86400000));
      const threshold = sla[s.regime] || 3;
      const isDelayed = daysOverdue >= threshold;
      const fcBy = s.fc ? this.pick(offNames) : null;
      devices.push({
        id: s.id, regime: s.regime, agency: s.agency, dest: s.dest,
        issued, expectedReturn, fieldConfirmed: s.fc, fieldConfirmedBy: fcBy,
        status: isDelayed ? 'Delayed' : 'Awaiting Retrieval',
        daysOverdue, isDelayed, retrievalOfficer: null, retrievalTime: null,
        createdAt: this.now(),
        auditLog: [
          { event:'Device Issued', detail:`Assigned to ${s.agency} – ${s.dest} (${s.regime})`, time: this.fmtDate(issued), color:'#1a2b5c' },
          { event: s.fc ? 'Field Confirmed' : 'Pending Confirmation', detail: s.fc ? `Confirmed by ${fcBy}` : 'Awaiting Office Retrieval confirmation', time: this.fmtDate(addD(issued, 1)), color: s.fc ? '#007a67' : '#f5c842' }
        ]
      });
    });

    // Mark 4 as retrieved
    const retOfficers = [offNames[0], offNames[1], offNames[2], offNames[3]];
    devices.slice(0, 4).forEach((d, i) => {
      d.status = 'Retrieved'; d.isDelayed = false;
      d.retrievalOfficer = retOfficers[i]; d.retrievalTime = new Date().toISOString();
      d.auditLog.push({ event:'Retrieved', detail:`Collected by ${retOfficers[i]}`, time: this.fmtDate(this.today()), color:'#00c5a3' });
    });

    this.setDevices(devices);

    // Seed notifications
    this.set(this.KEYS.NOTIFICATIONS, [
      { id:'n1', type:'upcoming', title:'Upcoming – COMPASS POWER AFRICA LTD', desc:'3 devices at Elubo due March 3rd. Assign officer promptly.', tag:'upcoming', unread:true, createdAt: new Date(Date.now()-300000).toISOString(), extra:'Expected: March 3rd · 3 devices · Warehouse' },
      { id:'n2', type:'delayed',  title:'Device Overdue – CAVE AND GARDEN',     desc:'Device 8150640211 at Newrest (Freezones) is 8 days overdue.', tag:'delayed', unread:true, createdAt: new Date(Date.now()-1800000).toISOString(), extra:'Device ID: 8150640211 · Overdue: 8 days' },
      { id:'n3', type:'delayed',  title:'Device Overdue – MIRO TIMBER',         desc:'Device 8150640436 at Keda (Transit) is 9 days overdue.', tag:'delayed', unread:false, createdAt: new Date(Date.now()-2700000).toISOString(), extra:'Device ID: 8150640436 · Overdue: 9 days' },
      { id:'n4', type:'assign',   title:'Assignment – Yaw Boateng',             desc:'Yaw Boateng assigned to RONOR MOTORS at Sunda Ghana Ltd.', officer:'Yaw Boateng', tag:'assignment', unread:false, createdAt: new Date(Date.now()-86400000).toISOString(), extra:'Regime: Warehouse · Expected: March 3rd' },
      { id:'n5', type:'retrieved',title:'Retrieved – Kojo Rexford',             desc:'Kojo Rexford retrieved 2 devices from WESTERN BEVERAGES LTD.', officer:'Kojo Rexford', tag:'retrieved', unread:false, createdAt: new Date(Date.now()-172800000).toISOString() },
    ]);

    localStorage.setItem('rt_seeded', '1');
  }
};

// Auto-seed on first load
DB.seed();

// ── ROLE PERMISSIONS ──────────────────────────────────────────
const ROLES = {
  Administrator:     { dashboard:true, issue:true, officer:true, fieldconfirm:true, retrieval:true, delayed:true, timeline:true, reports:true, analytics:true, performance:true, roles:true, sla:true, bulkimport:true, sms:true, mapview:true, notifications:true, audit:true },
  Supervisor:        { dashboard:true, issue:true, officer:true, fieldconfirm:true, retrieval:true, delayed:true, timeline:true, reports:true, analytics:true, performance:true, roles:false, sla:false, bulkimport:true, sms:true, mapview:true, notifications:true, audit:false },
  'Office Retrieval':   { dashboard:true, issue:false, officer:false, fieldconfirm:true, retrieval:true, delayed:true, timeline:true, reports:false, analytics:false, performance:false, roles:false, sla:false, bulkimport:false, sms:false, mapview:true, notifications:true, audit:false },
  'Retrieval Officer':{ dashboard:true, issue:true, officer:true, fieldconfirm:false, retrieval:false, delayed:false, timeline:true, reports:false, analytics:false, performance:false, roles:false, sla:false, bulkimport:false, sms:false, mapview:true, notifications:true, audit:false },};
function canAccess(page) {
  const s = DB.getSession();
  if (!s) return false;
  return !!(ROLES[s.role] && ROLES[s.role][page]);
}