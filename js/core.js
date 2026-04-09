(() => {
  'use strict';

  //* constants open
  const APP_VERSION = '10.20';
  const LS_ADMIN = 'FAKDU_ADMIN_LOGGED_IN';
  const LS_DEFERRED_INSTALL = 'FAKDU_DEFERRED_INSTALL';
  const LS_INSTALL_BANNER_DISMISSED = 'FAKDU_INSTALL_BANNER_DISMISSED';
  const LS_SNAPSHOT_PREFIX = 'FAKDU_SYNC_SNAPSHOT_';
  const LS_PENDING_SYNC_VERSION = 'FAKDU_PENDING_SYNC_VERSION';
  const LS_CLIENT_OP_QUEUE = 'FAKDU_CLIENT_OP_QUEUE';
  const LS_FORCE_CLIENT_MODE = 'FAKDU_FORCE_CLIENT_MODE';
  const LS_STAFF_MODE = 'FAKDU_STAFF_MODE';
  const LS_PENDING_PAIR_REQUEST_ID = 'FAKDU_PENDING_PAIR_REQUEST_ID';
  const LS_MENU_IMAGE_CACHE_PREFIX = 'FAKDU_MENU_IMAGE_CACHE_';
  const LS_PROMPTPAY_DYNAMIC = 'promptpay_dynamic';
  const MEMBER_BAHT_PER_POINT = 10;
  const HEARTBEAT_INTERVAL_MS = 5000;
  const CLIENT_AVATAR_MAX_BYTES = 1.5 * 1024 * 1024;
  const COLOR_MAP = {
    red: 'สีแดง',
    white: 'สีขาว',
    blue: 'สีน้ำเงิน',
    green: 'สีเขียว',
    yellow: 'สีเหลือง',
    black: 'สีดำ',
    pink: 'สีชมพู'
  };
  const ANIMAL_MAP = {
    dog: 'หมา', cat: 'แมว', bird: 'นก', fish: 'ปลา', elephant: 'ช้าง', horse: 'ม้า',
    cow: 'วัว', buffalo: 'ควาย', pig: 'หมู', chicken: 'ไก่', duck: 'เป็ด', tiger: 'เสือ',
    lion: 'สิงโต', bear: 'หมี', monkey: 'ลิง', snake: 'งู', crocodile: 'จระเข้', turtle: 'เต่า',
    frog: 'กบ', rabbit: 'กระต่าย'
  };
  const DEFAULT_DB = {
    version: APP_VERSION,
    shopId: null,
    shopName: 'FAKDU',
    logo: '',
    theme: '#800000',
    bgColor: '#f8fafc',
    bank: '',
    ppay: '',
    qrOffline: '',
    adminPin: '1234',
    licenseToken: '',
    licenseActive: false,
    unitType: 'โต๊ะ',
    unitCount: 4,
    soundEnabled: true,
    items: [],
    units: [],
    carts: {},
    sales: [],
    opLog: [],
    fraudLogs: [],
    members: {},
    promotionConfig: {
      title: '',
      detail: '',
      pointPerBaht: 1 / MEMBER_BAHT_PER_POINT
    },
    recovery: {
      phone: '',
      color: '',
      animal: ''
    },
    sync: {
      masterDeviceId: '',
      syncVersion: 1,
      currentSyncPin: '',
      key: '',
      keyResetDate: '',
      keyResetCount: 0,
      approvedClients: [],
      clients: [],
      clientSession: null,
      approvals: [],
      lastCheck: {
        status: 'idle',
        text: 'ยังไม่ได้ตรวจ',
        hint: 'กดปุ่มเช็คเมื่อต้องการปิดร้านหรือเช็กความตรงกัน',
        at: null
      }
    }
  };
  const TRIAL_LIMITS = {
    unitMax: 4,
    menuMax: 4,
    onlineClientMax: 1,
    topBasicMax: 3,
    themePalette: ['#800000', '#1d4ed8', '#0f766e', '#b45309', '#111827']
  };
  const state = {
    db: structuredClone(DEFAULT_DB),
    isAdminLoggedIn: localStorage.getItem(LS_ADMIN) === 'true',
    isStaffMode: false,
    activeTab: 'customer',
    activeManageSub: 'dash',
    activeDashSub: 'history',
    activeMenuManageSub: 'menu',
    activeUnitId: null,
    gridZoom: 2,
    customerGridCollapsed: true,
    shopQueueCollapsed: true,
    pendingAdminAction: null,
    tempAddons: [],
    tempImg: '',
    pendingAddonItem: null,
    currentAddonQty: 1,
    currentCheckoutTotal: 0,
    checkoutMemberInputDirty: false,
    checkoutMemberPanelVisible: false,
    redeemDraft: [],
    qrScanner: null,
    deferredInstallPrompt: null,
    syncButtonResetTimer: null,
    syncChannel: null,
    syncPollTimer: null,
    firebaseSyncApi: null,
    stopFirebaseListener: null,
    stopJoinRequestListener: null,
    stopClientApproveListener: null,
    stopOperationListener: null,
    processedSyncMessages: new Set(),
    processedOperationIds: new Set(),
    clientQueueFlushTimer: null,
    liveTick: null,
    autoSaveTimer: null,
    audioCtx: null,
    hwid: '',
    isPro: true,
    activeSalesCompare: 'today',
    lastClientHeartbeatAt: 0,
    lastCloudSessionCheckAt: 0,
    appliedOpsPersistTimer: null
  };
  const IS_CLIENT_NODE = false;
  //* constants close

  //* adapter open
  const fallbackDbAdapter = {
    async load() {
      try {
        const raw = localStorage.getItem('FAKDU_DB_V946');
        return raw ? JSON.parse(raw) : null;
      } catch (_) {
        return null;
      }
    },
    async save(data) {
      localStorage.setItem('FAKDU_DB_V946', JSON.stringify(data));
    },
    async exportData(data) {
      return JSON.stringify(data, null, 2);
    },
    async importData(raw) {
      return JSON.parse(raw);
    },
    async getDeviceId() {
      let id = localStorage.getItem('FAKDU_DEVICE_INSTALL_ID');
      if (!id) {
        id = 'FD-' + Math.random().toString(36).slice(2, 8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
        localStorage.setItem('FAKDU_DEVICE_INSTALL_ID', id);
      }
      return id;
    }
  };

  function resolveDbApi() {
    if (window.FakduDB && typeof window.FakduDB.load === 'function' && typeof window.FakduDB.save === 'function') {
      return window.FakduDB;
    }
    return fallbackDbAdapter;
  }

  function resolveVaultApi() {
    return window.FakduVault || {};
  }
  //* adapter close

  //* helpers open
  function qs(id) { return document.getElementById(id); }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function now() { return Date.now(); }
  function thaiDate(ts = Date.now()) {
    return new Date(ts).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function getLocalYYYYMMDD(d = new Date()) {
    const options = { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Intl.DateTimeFormat('en-CA', options).format(d);
  }
  function getTimeHHMM(d = new Date()) {
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }
  function formatMoney(n) {
    return Number(n || 0).toLocaleString('th-TH');
  }
  function toPromptPayTarget(raw = '') {
    const digits = String(raw || '').replace(/[^\d+]/g, '').replace(/\+/g, '');
    if (digits.length === 11 && digits.startsWith('66')) {
      return { type: '01', value: `0066${digits.slice(2)}` }; // mobile in +66 / 66 format
    }
    if (digits.length === 10 && digits.startsWith('0')) {
      return { type: '01', value: `0066${digits.slice(1)}` }; // mobile
    }
    if (digits.length === 13) {
      return { type: '02', value: digits }; // national id / tax id
    }
    if (digits.length === 15) {
      return { type: '03', value: digits }; // e-wallet id
    }
    return null;
  }
  function emvField(id, value) {
    const text = String(value ?? '');
    return `${id}${String(text.length).padStart(2, '0')}${text}`;
  }
  function crc16Ccitt(input = '') {
    let crc = 0xFFFF;
    for (let i = 0; i < input.length; i += 1) {
      crc ^= input.charCodeAt(i) << 8;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  function buildPromptPayPayload(ppay, amount = 0, shopName = '') {
    const target = toPromptPayTarget(ppay);
    if (!target) return '';
    const amountNum = Number(amount || 0);
    const amountText = Number.isFinite(amountNum) && amountNum > 0 ? amountNum.toFixed(2) : '';
    const merchantInfo = emvField('29', `${emvField('00', 'A000000677010111')}${emvField(target.type, target.value)}`);
    const safeName = String(shopName || 'FAKDU').trim().slice(0, 25) || 'FAKDU';
    let payload = '';
    payload += emvField('00', '01');
    payload += emvField('01', amountText ? '12' : '11');
    payload += merchantInfo;
    payload += emvField('52', '0000');
    payload += emvField('53', '764');
    if (amountText) payload += emvField('54', amountText);
    payload += emvField('58', 'TH');
    payload += emvField('59', safeName);
    payload += emvField('60', 'BANGKOK');
    const crcBase = `${payload}6304`;
    return `${crcBase}${crc16Ccitt(crcBase)}`;
  }
  function generatePromptPayQrCanvas(promptPayID, amount = 0, options = {}) {
    const payload = buildPromptPayPayload(promptPayID, amount, options.shopName || 'FAKDU');
    if (!payload || typeof QRCode !== 'function') return null;
    const wrapper = document.createElement('div');
    new QRCode(wrapper, {
      text: payload,
      width: Number(options.width || 150),
      height: Number(options.height || 150)
    });
    const canvas = wrapper.querySelector('canvas');
    if (canvas) return canvas;
    const img = wrapper.querySelector('img');
    if (!img) return null;
    const fallbackCanvas = document.createElement('canvas');
    const w = Number(options.width || 150);
    const h = Number(options.height || 150);
    fallbackCanvas.width = w;
    fallbackCanvas.height = h;
    const ctx = fallbackCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    if (img.complete) ctx.drawImage(img, 0, 0, w, h);
    else img.onload = () => ctx.drawImage(img, 0, 0, w, h);
    return fallbackCanvas;
  }
  function isTransferMethod(method = '') {
    const value = String(method || '').toLowerCase();
    return value === 'transfer' || value === 'qr' || value === 'promptpay';
  }
  function isPromptPayDynamicEnabled() {
    return localStorage.getItem(LS_PROMPTPAY_DYNAMIC) === 'true';
  }
  function setPromptPayDynamicEnabled(enabled) {
    localStorage.setItem(LS_PROMPTPAY_DYNAMIC, enabled ? 'true' : 'false');
  }
  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read file failed'));
      reader.readAsDataURL(file);
    });
  }
  function loadImageFromDataUrl(dataUrl = '') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('invalid image'));
      img.src = String(dataUrl || '');
    });
  }
  async function optimizeImageFile(file, options = {}) {
    const maxWidth = Math.max(320, Number(options.maxWidth || 1024));
    const maxBytes = Math.max(80 * 1024, Number(options.maxBytes || 300 * 1024));
    const outputType = String(options.outputType || 'image/jpeg');
    const fallbackDataUrl = await readFileAsDataURL(file);
    if (!file.type || !file.type.startsWith('image/')) return fallbackDataUrl;

    try {
      const sourceImage = await loadImageFromDataUrl(fallbackDataUrl);
      const srcW = Number(sourceImage.naturalWidth || sourceImage.width || 0);
      const srcH = Number(sourceImage.naturalHeight || sourceImage.height || 0);
      if (!srcW || !srcH) return fallbackDataUrl;

      const scale = Math.min(1, maxWidth / srcW);
      const drawW = Math.max(1, Math.round(srcW * scale));
      const drawH = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = drawW;
      canvas.height = drawH;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return fallbackDataUrl;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, drawW, drawH);
      ctx.drawImage(sourceImage, 0, 0, drawW, drawH);

      if (outputType === 'image/png') {
        return canvas.toDataURL('image/png');
      }

      let quality = 0.86;
      let candidate = canvas.toDataURL(outputType, quality);
      while (candidate.length > maxBytes * 1.37 && quality > 0.5) {
        quality -= 0.08;
        candidate = canvas.toDataURL(outputType, quality);
      }
      return candidate.length < fallbackDataUrl.length ? candidate : fallbackDataUrl;
    } catch (_) {
      return fallbackDataUrl;
    }
  }
  function getUnitLabel(id) {
    return `${state.db.unitType || 'โต๊ะ'} ${id}`;
  }
  function getActorLabel() {
    if (IS_CLIENT_NODE) return 'client';
    if (state.isStaffMode) return 'staff';
    return state.isAdminLoggedIn ? 'admin' : 'staff';
  }
  function getCurrentProfileName() {
    if (IS_CLIENT_NODE) return getClientProfile().profileName;
    return state.db.shopName || 'FAKDU';
  }
  function getCurrentDeviceId() {
    return state.hwid || 'LOCAL';
  }
  function canManageOrders() {
    return !IS_CLIENT_NODE && !isRestrictedStaffMode();
  }
  function formatDurationFrom(startTs) {
    if (!startTs) return 'ยังไม่เริ่มจับเวลา';
    const diff = Math.max(0, Date.now() - startTs);
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const remain = mins % 60;
    if (hours > 0) return `${hours} ชม. ${remain} นาที`;
    return `${mins} นาที`;
  }
  function hashLike(text = '') {
    let h = 0;
    for (let i = 0; i < text.length; i += 1) h = ((h << 5) - h) + text.charCodeAt(i);
    return Math.abs(h).toString(36).toUpperCase();
  }
  function randomIdChunk(len = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const arr = new Uint32Array(len);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < len; i += 1) arr[i] = Math.floor(Math.random() * 0xffffffff);
    }
    let out = '';
    for (let i = 0; i < len; i += 1) out += chars[arr[i] % chars.length];
    return out;
  }
  function makeShopId() {
    return `SHOP-${randomIdChunk(8)}`;
  }
  function generateSyncKey(seed = '') {
    const entropy = `${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const numeric = hashLike(entropy).replace(/\D/g, '');
    const base = numeric.slice(0, 6).padEnd(6, '7');
    return base.slice(0, 6);
  }
  function generateSyncPin(shopId = '', syncVersion = 1) {
    const random = String(Math.floor(100000 + Math.random() * 900000));
    const binding = hashLike(`${shopId}-${syncVersion}-${random}`);
    const digits = binding.replace(/\D/g, '');
    if (digits.length >= 2) {
      return `${random.slice(0, 4)}${digits.slice(0, 2)}`;
    }
    return random;
  }
  function normalizeSyncPin(pin = '') {
    return String(pin || '').replace(/\D/g, '').slice(0, 6);
  }
  function readSyncPinFromUrl() {
    const params = new URLSearchParams(window.location.search || '');
    return normalizeSyncPin(params.get('pin') || params.get('syncPin') || '');
  }
  function ensureClientId() {
    let clientId = localStorage.getItem('FAKDU_CLIENT_ID') || '';
    if (!clientId) {
      clientId = `CLI-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      localStorage.setItem('FAKDU_CLIENT_ID', clientId);
    }
    return clientId;
  }
  function getClientProfile() {
    return {
      clientId: ensureClientId(),
      profileName: localStorage.getItem('FAKDU_CLIENT_PROFILE_NAME') || 'อุปกรณ์เสริม',
      avatar: localStorage.getItem('FAKDU_CLIENT_AVATAR') || ''
    };
  }
  function getPendingSyncVersion() {
    const raw = Number(localStorage.getItem(LS_PENDING_SYNC_VERSION) || 0);
    return raw > 0 ? raw : Number(state.db.sync.syncVersion || 1);
  }
  function getPendingMasterShopId() {
    return localStorage.getItem('FAKDU_PENDING_MASTER_SHOP_ID') || state.db.shopId || '';
  }
  function issueClientSessionToken({ shopId, clientId, syncVersion }) {
    const payload = `${shopId}|${clientId}|${syncVersion}|${Date.now()}|${Math.random().toString(36).slice(2, 10)}`;
    return `SESS-${hashLike(payload).padEnd(16, '0').slice(0, 16)}`;
  }

  function normalizeMenuItemForCloud(item = {}) {
    return {
      id: item.id || `ITM-${Date.now()}`,
      name: item.name || '-',
      price: Number(item.price || 0),
      addons: Array.isArray(item.addons) ? clone(item.addons) : [],
      hasImage: Boolean(item.img),
      imageVersion: Number(item.imageVersion || 0)
    };
  }

  function makeCloudSnapshotPayload() {
    return {
      shopId: state.db.shopId,
      masterDeviceId: state.db.sync.masterDeviceId || state.hwid || '',
      shopName: state.db.shopName,
      theme: state.db.theme,
      bgColor: state.db.bgColor,
      logo: state.db.logo,
      unitType: state.db.unitType,
      unitCount: state.db.unitCount,
      menuMetadata: state.db.items.map((item) => normalizeMenuItemForCloud(item)),
      units: state.db.units,
      carts: state.db.carts,
      sales: state.db.sales,
      settings: {
        bank: state.db.bank || '',
        ppay: state.db.ppay || '',
        qrOffline: state.db.qrOffline || '',
        soundEnabled: Boolean(state.db.soundEnabled)
      },
      syncSession: {
        syncVersion: Number(state.db.sync.syncVersion || 1),
        currentSyncPin: state.db.sync.currentSyncPin || '',
        approvedClients: state.db.sync.approvedClients || []
      },
      at: Date.now()
    };
  }

  function makeSyncMessageId() {
    return `MSG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  }
  function resolveFirebaseSyncApi() {
    if (state.firebaseSyncApi) return state.firebaseSyncApi;
    const factory = window.FakduSync && typeof window.FakduSync.resolveApi === 'function'
      ? window.FakduSync.resolveApi
      : (window.FakduFirebaseSync && typeof window.FakduFirebaseSync.resolveApi === 'function'
        ? window.FakduFirebaseSync.resolveApi
        : null);
    if (!factory) return null;
    try {
      state.firebaseSyncApi = factory();
      return state.firebaseSyncApi;
    } catch (error) {
      console.warn('Firebase sync unavailable', error);
      return null;
    }
  }
  function getClientStatus(client) {
    if (!client) return 'offline';
    const lastSeen = Number(client.lastSeen || 0);
    if (!lastSeen) return 'offline';
    return (Date.now() - lastSeen) <= 25000 ? 'online' : 'offline';
  }
  function openModal(id) {
    const el = qs(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    el.style.display = 'flex';
  }
  function closeModal(id) {
    const el = qs(id);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    el.style.display = 'none';
  }
  function resolveStaffModeFlag() {
    if (IS_CLIENT_NODE) return false;
    const params = new URLSearchParams(window.location.search || '');
    const mode = String(params.get('mode') || '').trim().toLowerCase();
    const role = String(params.get('role') || '').trim().toLowerCase();
    if (mode === 'staff' || mode === 'employee' || role === 'staff' || role === 'employee') {
      localStorage.setItem(LS_STAFF_MODE, 'true');
    }
    return localStorage.getItem(LS_STAFF_MODE) === 'true';
  }
  function isRestrictedStaffMode() {
    return !IS_CLIENT_NODE && state.isStaffMode;
  }
  function normalizeClientAccessMode(value, fallback = 'both') {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'both' || mode === 'all' || mode === 'staff') return 'both';
    if (mode === 'shop' || mode === 'checkout' || mode === 'bill') return 'shop';
    if (mode === 'customer' || mode === 'order') return 'customer';
    return fallback;
  }
  function getSelectedClientAccessMode() {
    return normalizeClientAccessMode('both', 'both');
  }
  function getClientSessionAccessMode() {
    const session = getStoredClientSession();
    return normalizeClientAccessMode(session?.accessMode || 'both', 'both');
  }
  function applyClientAccessModeUi() {
    if (!IS_CLIENT_NODE) return;
    const mode = getClientSessionAccessMode();
    const customerTab = qs('tab-customer');
    const shopTab = qs('tab-shop');
    if (customerTab) customerTab.classList.toggle('hidden', false);
    if (shopTab) shopTab.classList.toggle('hidden', false);
    if (mode === 'shop' && state.activeTab === 'customer') switchTab('shop', shopTab);
    if (mode === 'customer' && state.activeTab === 'shop') switchTab('customer', customerTab);
  }
  function applyStaffModeUi() {
    if (IS_CLIENT_NODE) return;
    const nav = document.querySelector('.top-nav');
    const manageTab = qs('tab-manage');
    const systemTab = qs('tab-system');
    const restricted = isRestrictedStaffMode();

    nav?.classList.toggle('staff-only-nav', restricted);
    if (manageTab) manageTab.classList.toggle('hidden', restricted);
    if (systemTab) systemTab.classList.toggle('hidden', restricted);
    const staffConnectPanel = qs('staff-connect-panel');
    if (staffConnectPanel) staffConnectPanel.classList.toggle('hidden', !restricted);

    if (restricted && (state.activeTab === 'manage' || state.activeTab === 'system')) {
      switchTab('customer', qs('tab-customer'));
    }
  }
  //* helpers close

  //* sound open
  function playSound(type = 'click') {
    if (!state.db.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!state.audioCtx) state.audioCtx = new AudioContext();
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(state.audioCtx.destination);
      if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(420, state.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(920, state.audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, state.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(state.audioCtx.currentTime + 0.22);
        return;
      }
      if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(190, state.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, state.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + 0.18);
        osc.start();
        osc.stop(state.audioCtx.currentTime + 0.18);
        return;
      }
      osc.type = 'sine';
      osc.frequency.setValueAtTime(620, state.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, state.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + 0.05);
      osc.start();
      osc.stop(state.audioCtx.currentTime + 0.06);
    } catch (_) {}
  }

  function showToast(message, type = 'click') {
    playSound(type);
    const el = qs('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'show';
    setTimeout(() => {
      if (el.className === 'show') el.className = '';
    }, 2800);
  }
  //* sound close

  //* normalize open
  function normalizeUnit(unit, id) {
    return {
      id,
      status: unit?.status || 'idle',
      startTime: unit?.startTime || null,
      lastActivityAt: unit?.lastActivityAt || null,
      checkoutRequested: Boolean(unit?.checkoutRequested),
      checkoutRequestedAt: unit?.checkoutRequestedAt || null,
      newItemsQty: Number(unit?.newItemsQty || 0),
      lastOrderBy: unit?.lastOrderBy || '',
      orders: Array.isArray(unit?.orders) ? unit.orders.map((order) => ({
        id: order.id || `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        itemId: order.itemId || null,
        name: order.name || '-',
        baseName: order.baseName || order.name || '-',
        qty: Number(order.qty || 1),
        price: Number(order.price || 0),
        total: Number(order.total || 0),
        addons: Array.isArray(order.addons) ? order.addons : [],
        redeemedByPoints: Boolean(order.redeemedByPoints),
        redeemPoints: Math.max(0, Number(order.redeemPoints || 0)),
        note: order.note || '',
        orderBy: order.orderBy || 'Master',
        source: order.source || 'master',
        createdAt: order.createdAt || Date.now()
      })) : []
    };
  }

  function normalizeDb(raw) {
    const merged = { ...clone(DEFAULT_DB), ...(raw || {}) };
    merged.recovery = { ...clone(DEFAULT_DB.recovery), ...(raw?.recovery || {}) };
    merged.sync = {
      ...clone(DEFAULT_DB.sync),
      ...(raw?.sync || {}),
      lastCheck: {
        ...clone(DEFAULT_DB.sync.lastCheck),
        ...(raw?.sync?.lastCheck || {})
      },
      clients: Array.isArray(raw?.sync?.clients) ? raw.sync.clients : [],
      approvals: Array.isArray(raw?.sync?.approvals) ? raw.sync.approvals : [],
      approvedClients: Array.isArray(raw?.sync?.approvedClients) ? raw.sync.approvedClients : [],
      clientSession: raw?.sync?.clientSession && typeof raw.sync.clientSession === 'object'
        ? clone(raw.sync.clientSession)
        : null
    };
    merged.items = Array.isArray(raw?.items) ? raw.items.map((item) => ({
      id: item.id || `ITM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: item.name || '',
      price: Number(item.price || 0),
      redeemPoints: Math.max(0, Number(item.redeemPoints || 0)),
      img: item.img || '',
      hasImage: Boolean(item.hasImage || item.img),
      imageVersion: Number(item.imageVersion || (item.img ? Date.now() : 0)),
      addons: Array.isArray(item.addons) ? item.addons.map((addon) => ({
        name: addon.name || '',
        price: Number(addon.price || 0)
      })) : []
    })) : [];
    merged.units = [];
    const maxCount = Math.max(1, Number(merged.unitCount || 4));
    for (let i = 1; i <= maxCount; i += 1) {
      const existing = Array.isArray(raw?.units) ? raw.units.find((u) => Number(u.id) === i) : null;
      merged.units.push(normalizeUnit(existing, i));
    }
    merged.unitCount = merged.units.length;
    merged.carts = typeof raw?.carts === 'object' && raw?.carts ? raw.carts : {};
    for (let i = 1; i <= merged.unitCount; i += 1) {
      if (!Array.isArray(merged.carts[i])) merged.carts[i] = [];
    }
    merged.sales = Array.isArray(raw?.sales) ? raw.sales : [];
    merged.members = normalizeMembers((raw?.members && typeof raw.members === 'object' && !Array.isArray(raw.members)) ? raw.members : {});
    merged.promotionConfig = {
      title: '',
      detail: '',
      pointPerBaht: 1 / MEMBER_BAHT_PER_POINT
    };
    merged.opLog = Array.isArray(raw?.opLog) ? raw.opLog : [];
    merged.fraudLogs = Array.isArray(raw?.fraudLogs) ? raw.fraudLogs : [];
    if (!merged.shopId) merged.shopId = makeShopId();
    if (!merged.sync.syncVersion || Number(merged.sync.syncVersion) < 1) merged.sync.syncVersion = 1;
    if (!merged.sync.masterDeviceId) merged.sync.masterDeviceId = state.hwid || '';
    if (!merged.sync.currentSyncPin) {
      const legacyKey = String(merged.sync.key || '');
      merged.sync.currentSyncPin = (legacyKey && legacyKey !== String(merged.shopId || ''))
        ? legacyKey
        : generateSyncPin(merged.shopId, merged.sync.syncVersion);
    }
    merged.sync.key = merged.sync.currentSyncPin;
    return merged;
  }
  //* normalize close

  function sanitizePhone(raw = '') {
    return String(raw || '').replace(/\D/g, '').slice(0, 10);
  }

  function normalizeMemberRecord(raw = {}, fallbackId = '') {
    const safeId = String(raw.id || fallbackId || `MEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    return {
      id: safeId,
      phone: sanitizePhone(raw.phone || ''),
      name: String(raw.name || '').trim(),
      points: Math.max(0, Number(raw.points || 0)),
      firstSeenAt: Number(raw.firstSeenAt || raw.createdAt || Date.now()),
      updatedAt: Number(raw.updatedAt || Date.now())
    };
  }

  function normalizeMembers(rawMembers) {
    const members = {};
    if (!rawMembers || typeof rawMembers !== 'object') return members;
    Object.entries(rawMembers).forEach(([legacyKey, value]) => {
      if (!value || typeof value !== 'object') return;
      const normalized = normalizeMemberRecord(value, value.id || legacyKey);
      members[normalized.id] = normalized;
    });
    return members;
  }

  function getMemberById(memberId = '') {
    return state.db.members[String(memberId || '')] || null;
  }

  function findMemberByPhone(phone = '') {
    const normalizedPhone = sanitizePhone(phone);
    if (!normalizedPhone || !state.db.members) return null;
    return Object.values(state.db.members).find((member) => sanitizePhone(member.phone) === normalizedPhone) || null;
  }

  function findMemberByName(name = '') {
    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized || !state.db.members) return null;
    return Object.values(state.db.members).find((member) => String(member.name || '').trim().toLowerCase() === normalized) || null;
  }

  function resolveMemberByKeyword(keyword = '') {
    const text = String(keyword || '').trim();
    if (!text) return null;
    const byPhone = findMemberByPhone(text);
    if (byPhone) return byPhone;
    return findMemberByName(text);
  }

  function renderCheckoutMemberHint(text = '', tone = 'default') {
    const hint = qs('checkout-member-hint');
    if (!hint) return;
    hint.textContent = text || 'ไม่กรอก = ลูกค้าทั่วไป';
    hint.className = 'text-[10px] font-bold mt-2';
    if (tone === 'success') {
      hint.classList.add('text-emerald-600');
      return;
    }
    if (tone === 'warn') {
      hint.classList.add('text-amber-600');
      return;
    }
    hint.classList.add('text-gray-400');
  }

  function markCheckoutMemberDirty() {
    state.checkoutMemberInputDirty = true;
  }

  function setCheckoutMemberPanelVisible(visible = false) {
    state.checkoutMemberPanelVisible = Boolean(visible);
    const fields = qs('checkout-member-fields');
    const label = qs('checkout-member-toggle-label');
    if (fields) fields.classList.toggle('hidden', !state.checkoutMemberPanelVisible);
    if (label) label.textContent = state.checkoutMemberPanelVisible ? 'ซ่อนช่องสมาชิก' : 'กดเพื่อกรอก';
  }

  function toggleCheckoutMemberSection() {
    setCheckoutMemberPanelVisible(!state.checkoutMemberPanelVisible);
    if (state.checkoutMemberPanelVisible) qs('checkout-member-keyword')?.focus();
  }

  function lookupCheckoutMember(rawKeyword = '') {
    const keywordInput = qs('checkout-member-keyword');
    if (!keywordInput) return null;
    const keyword = String(rawKeyword || keywordInput.value || '').trim();
    keywordInput.value = keyword;
    if (!keyword) {
      renderCheckoutMemberHint('ไม่กรอก = ลูกค้าทั่วไป');
      return null;
    }
    const member = resolveMemberByKeyword(keyword);
    if (!member) {
      renderCheckoutMemberHint('ยังไม่พบสมาชิก: พิมพ์ชื่อหรือเบอร์ แล้วปิดบิลเพื่อสมัครทันที', 'warn');
      return null;
    }
    renderCheckoutMemberHint(`สมาชิกเดิม: ${member.name || member.phone} (${formatMoney(member.points)} แต้ม)`, 'success');
    return member;
  }

  function applyCheckoutMemberLookup() {
    state.checkoutMemberInputDirty = false;
    lookupCheckoutMember(qs('checkout-member-keyword')?.value || '');
  }

  function resetCheckoutMemberInputs() {
    if (qs('checkout-member-keyword')) qs('checkout-member-keyword').value = '';
    state.checkoutMemberInputDirty = false;
    setCheckoutMemberPanelVisible(false);
    renderCheckoutMemberHint('ไม่กรอก = ลูกค้าทั่วไป');
  }

  //* save/load open
  async function saveDb({ render = true } = {}) {
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(async () => {
      const dbApi = resolveDbApi();
      await dbApi.save(state.db);
      if (render) renderAll();

    }, 30);
  }

  function logOperation(type, payload = {}) {
    const entry = {
      opId: `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      id: `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      shopId: state.db.shopId,
      clientId: payload.clientId || (IS_CLIENT_NODE ? getClientProfile().clientId : (state.db.sync.masterDeviceId || state.hwid || 'MASTER')),
      deviceId: payload.deviceId || getCurrentDeviceId(),
      profileName: payload.profileName || getCurrentProfileName(),
      role: payload.role || (IS_CLIENT_NODE ? 'client' : 'master'),
      tableId: payload.tableId || payload.unitId || null,
      type,
      payload: { ...payload, actor: getActorLabel() },
      timestamp: Date.now(),
      at: Date.now()
    };
    state.db.opLog.push(entry);
    if (state.db.opLog.length > 400) state.db.opLog = state.db.opLog.slice(-400);
    const writeTypes = new Set([
      'CREATE_MENU_ITEM',
      'UPDATE_MENU_ITEM',
      'DELETE_MENU_ITEM',
      'SEND_ORDER',
      'CLIENT_APPEND_ORDER',
      'CLIENT_APPEND_ORDER_REQUEST',
      'REQUEST_CHECKOUT',
      'CLIENT_REQUEST_CHECKOUT',
      'CHECKOUT_REQUEST_TOGGLE',
      'CONFIRM_PAYMENT'
    ]);
    if (writeTypes.has(type)) {
      const api = resolveFirebaseSyncApi();
      if (api && state.db.shopId) {
        api.writeOperation(state.db.shopId, entry).catch(() => {});
      }
    }
  }
  //* save/load close

  //* theme open
  function applyTheme() {
    if (!state.isPro && !TRIAL_LIMITS.themePalette.includes((state.db.theme || '').toLowerCase())) {
      state.db.theme = TRIAL_LIMITS.themePalette[0];
      if (qs('sys-theme')) qs('sys-theme').value = state.db.theme;
    }
    document.documentElement.style.setProperty('--primary', state.db.theme || '#800000');
    document.documentElement.style.setProperty('--bg', state.db.bgColor || '#f8fafc');
    document.body.style.background = state.db.bgColor || '#f8fafc';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', state.db.theme || '#800000');
    const logo = state.db.logo || qs('shop-logo')?.src;
    if (qs('shop-logo') && logo) qs('shop-logo').src = logo;
    if (qs('system-logo-preview')) qs('system-logo-preview').src = state.db.logo || qs('system-logo-preview').src;
    if (qs('display-shop-name')) qs('display-shop-name').textContent = state.db.shopName || 'FAKDU';
    const recoveryBox = qs('pro-recovery-setup');
    if (recoveryBox) recoveryBox.classList.toggle('hidden', !state.isPro);
    const forgotBtn = qs('btn-open-recovery');
    if (forgotBtn) {
      forgotBtn.disabled = !state.isPro;
      forgotBtn.classList.toggle('opacity-40', !state.isPro);
    }
  }
  //* theme close

  //* header and status open
  function updateMasterConnectionUi() {
    const dot = qs('online-status-dot');
    const chip = qs('shop-connection-text');
    const mini = qs('shop-status-mini');
    const systemChip = qs('master-online-chip');
    if (dot) {
      dot.classList.remove('bg-green-500', 'bg-red-500');
      const isOnline = navigator.onLine;
      dot.classList.add(isOnline ? 'bg-green-500' : 'bg-red-500');
      dot.title = isOnline ? 'Online' : 'Offline';
    }
    if (chip) {
      chip.textContent = 'OFFLINE-ONLY';
      chip.className = 'text-[10px] font-black px-2 py-0.5 rounded-full bg-white/90 text-amber-700';
    }
    if (mini) mini.textContent = 'บันทึกเฉพาะในเครื่อง';
    if (systemChip) {
      systemChip.textContent = 'LOCAL ONLY';
      systemChip.className = 'px-3 py-1.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700';
    }
  }

  function renderOnlineClientsUi() {
    return;
    const clients = state.db.sync.clients.filter((client) => client.approved && Number(client.sessionSyncVersion || 0) === Number(state.db.sync.syncVersion || 1));
    const onlineClients = clients.filter((client) => getClientStatus(client) === 'online');
    const strip = qs('header-client-avatars');
    const miniBar = qs('header-online-clients-mini');

    if (miniBar) {
      miniBar.innerHTML = onlineClients.slice(0, 3).map((client) => {
        const avatar = client.avatar
          ? `<img src="${client.avatar}" class="w-full h-full object-cover">`
          : `<span class="text-[10px] font-black text-gray-600">${escapeHtml((client.name || 'C').slice(0, 1).toUpperCase())}</span>`;
        return `<div title="${escapeHtml(client.name || client.clientId)}" class="w-6 h-6 rounded-full bg-white border overflow-hidden flex items-center justify-center shadow-sm">${avatar}</div>`;
      }).join('');
    }

    if (strip) {
      strip.classList.toggle('hidden', onlineClients.length === 0);
      strip.innerHTML = onlineClients.map((client) => {
        const avatar = client.avatar
          ? `<img src="${client.avatar}" class="w-full h-full object-cover">`
          : `<span class="text-[10px] font-black text-gray-700">${escapeHtml((client.name || 'C').slice(0, 1).toUpperCase())}</span>`;
        return `
          <div class="flex items-center gap-1.5 bg-white/85 rounded-full pr-2 pl-1 py-1 shadow-sm border border-white/80">
            <div class="w-5 h-5 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">${avatar}</div>
            <div class="text-[10px] font-black text-gray-700 max-w-[72px] truncate">${escapeHtml(client.name || client.clientId)}</div>
          </div>
        `;
      }).join('');
    }

    renderSyncSlots(onlineClients);
  }

  function renderSyncSlots(onlineClients) {
    const slots = [qs('sync-client-slot-1'), qs('sync-client-slot-2')];
    slots.forEach((slot, index) => {
      if (!slot) return;
      const client = onlineClients[index];
      if (!client) {
        slot.innerHTML = `${index + 1}`;
        slot.className = 'w-6 h-6 rounded-full border-2 border-white bg-gray-200 text-[10px] flex items-center justify-center overflow-hidden';
        return;
      }
      slot.className = 'w-6 h-6 rounded-full border-2 border-white bg-white text-[10px] flex items-center justify-center overflow-hidden shadow-sm';
      slot.innerHTML = client.avatar
        ? `<img src="${client.avatar}" class="w-full h-full object-cover">`
        : `<span class="font-black text-gray-700">${escapeHtml((client.name || 'C').slice(0, 1).toUpperCase())}</span>`;
    });
  }
  //* header and status close

  //* tab open
  function switchTab(id, element = null) {
    if (IS_CLIENT_NODE) {
      const accessMode = getClientSessionAccessMode();
      if (accessMode === 'shop' && id === 'customer') id = 'shop';
      if (accessMode === 'customer' && id === 'shop') id = 'customer';
    }
    if (isRestrictedStaffMode() && (id === 'manage' || id === 'system')) {
      showToast('โหมดพนักงานเข้าได้เฉพาะ ลูกค้า และ เช็คบิล', 'error');
      id = 'customer';
      element = qs('tab-customer');
    }
    state.activeTab = id;
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.add('hidden');
      screen.classList.remove('active');
    });
    const screen = qs(`screen-${id}`);
    if (screen) {
      screen.classList.remove('hidden');
      screen.classList.add('active');
    }
    document.querySelectorAll('.nav-tab').forEach((tab) => tab.classList.remove('active'));
    if (element?.classList) element.classList.add('active');
    else qs(`tab-${id}`)?.classList.add('active');
    if (id === 'customer') renderCustomerGrid();
    if (id === 'shop') renderShopQueue();
    if (id === 'manage') renderAnalytics();
    if (id === 'system') renderSystemPanels();
  }

  function attemptAdmin(target, element) {
    if (isRestrictedStaffMode()) {
      showToast('โหมดพนักงานไม่สามารถเข้าหลังร้าน/ระบบ', 'error');
      return;
    }
    switchTab(target, element);
  }

  function verifyAdminPin() {
    closeModal('modal-admin-pin');
    showToast('ระบบนี้ไม่ต้องใช้ Admin PIN แล้ว', 'success');
  }

  function adminLogout() {
    switchTab('customer', qs('tab-customer'));
    showToast('ระบบนี้ไม่ต้องล็อคแอดมินแล้ว', 'success');
  }
  //* tab close

  //* grid open
  const GRID_ZOOM_LEVELS = ['S', 'M', 'L'];
  const GRID_ZOOM_CLASS_MAP = {
    1: 'grid-size-s',
    2: 'grid-size-m',
    3: 'grid-size-l'
  };

  function bindGridZoomControls() {
    const zoomInBtn = qs('btn-grid-zoom-in');
    const zoomOutBtn = qs('btn-grid-zoom-out');
    const zoomCycleBtn = qs('btn-grid-zoom-cycle');
    if (zoomInBtn && !zoomInBtn.dataset.bound) {
      zoomInBtn.addEventListener('click', () => changeGridZoom(1));
      zoomInBtn.dataset.bound = 'true';
    }
    if (zoomOutBtn && !zoomOutBtn.dataset.bound) {
      zoomOutBtn.addEventListener('click', () => changeGridZoom(-1));
      zoomOutBtn.dataset.bound = 'true';
    }
    if (zoomCycleBtn && !zoomCycleBtn.dataset.bound) {
      zoomCycleBtn.addEventListener('click', () => {
        const next = state.gridZoom >= 3 ? 1 : state.gridZoom + 1;
        setGridZoom(next);
      });
      zoomCycleBtn.dataset.bound = 'true';
    }
  }

  function setGridZoom(level) {
    playSound('click');
    state.gridZoom = Math.max(1, Math.min(3, Number(level) || 2));
    updateGridZoomUi();
    renderCustomerGrid();
  }

  function changeGridZoom(direction) {
    setGridZoom(state.gridZoom + direction);
  }

  function updateGridZoomUi() {
    const text = qs('zoom-level-text');
    const cycleBtn = qs('btn-grid-zoom-cycle');
    const grid = qs('grid-units');
    const zoomLabel = GRID_ZOOM_LEVELS[state.gridZoom - 1] || 'M';
    if (text) text.textContent = zoomLabel;
    if (cycleBtn) {
      cycleBtn.textContent = zoomLabel;
      cycleBtn.dataset.size = zoomLabel;
      cycleBtn.setAttribute('aria-label', `ขนาดปัจจุบัน ${zoomLabel}`);
    }
    if (!grid) return;
    grid.dataset.size = zoomLabel;
    grid.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-size-s', 'grid-size-m', 'grid-size-l');
    grid.classList.add(`grid-cols-${state.gridZoom}`, GRID_ZOOM_CLASS_MAP[state.gridZoom] || 'grid-size-m');
  }

  function getUnitCardClass(unit) {
    const cart = state.db.carts[unit.id] || [];
    if (cart.length > 0) return 'unit-card--draft';
    if (unit.orders.length > 0 || unit.checkoutRequested) return 'unit-card--busy';
    return 'unit-card--idle';
  }

  function renderUnitItemThumbnails(rows = []) {
    const map = new Map(state.db.items.map((item) => [String(item.id), item]));
    const thumbs = [];
    rows.forEach((row) => {
      const match = map.get(String(row.itemId));
      if (match && match.img && !thumbs.some((entry) => entry.src === match.img)) {
        thumbs.push({ src: match.img, alt: match.name || row.baseName || row.name || 'เมนู' });
      }
    });
    const visible = thumbs.slice(0, 3);
    if (!visible.length) return '<div class="unit-item-thumbs"><span class="unit-item-thumb-fallback">🍽️</span></div>';
    return `<div class="unit-item-thumbs">${visible.map((thumb) => `<img src="${thumb.src}" alt="${escapeHtml(thumb.alt)}">`).join('')}</div>`;
  }

  function getUnitStatusMeta(unit) {
    const cart = state.db.carts[unit.id] || [];
    if (cart.length > 0) return { cls: 'status-draft', label: '' };
    if (unit.checkoutRequested) return { cls: 'status-active', label: '' };
    if (unit.orders.length > 0) return { cls: 'status-active', label: '' };
    return { cls: 'status-idle', label: 'ว่าง' };
  }

  function toggleCustomerGridCollapse() {
    state.customerGridCollapsed = !state.customerGridCollapsed;
    renderCustomerGrid();
  }

  function toggleShopQueueCollapse() {
    state.shopQueueCollapsed = !state.shopQueueCollapsed;
    renderShopQueue();
  }

  function renderCustomerGrid() {
    const grid = qs('grid-units');
    if (!grid) return;
    updateGridZoomUi();
    const toolbar = qs('customer-grid-toolbar');
    const toggleBtn = qs('btn-toggle-grid-collapse');
    const shouldCollapse = state.db.units.length > 12;
    if (toolbar && toggleBtn) {
      toolbar.classList.toggle('hidden', !shouldCollapse);
      toggleBtn.textContent = state.customerGridCollapsed ? `ดูทั้งหมด (${state.db.units.length})` : 'ย่อรายการ';
    }
    const unitsToRender = shouldCollapse && state.customerGridCollapsed ? state.db.units.slice(0, 12) : state.db.units;
    grid.innerHTML = unitsToRender.map((unit) => {
      const cart = state.db.carts[unit.id] || [];
      const total = unit.orders.reduce((sum, order) => sum + order.total, 0);
      const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
      const statusMeta = getUnitStatusMeta(unit);
      const statusText = statusMeta.label;
      const statusPillClass = statusMeta.cls === 'status-draft'
        ? 'bg-amber-100 text-amber-700'
        : statusMeta.cls === 'status-active'
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-gray-100 text-gray-500';
      const secondary = cart.length > 0
          ? `ตะกร้า ฿${formatMoney(cartTotal)}`
        : unit.orders.length > 0
          ? `ยอดรวม ฿${formatMoney(total)}`
          : '-';
      const thumbRows = cart.length > 0 ? cart : unit.orders;
      return `
        <button onclick="openTable(${unit.id})" class="unit-status-ring ${statusMeta.cls} unit-card-${(GRID_ZOOM_LEVELS[state.gridZoom - 1] || 'M').toLowerCase()} text-left p-4 rounded-[26px] border-2 shadow-sm transition active:scale-[0.98] ${getUnitCardClass(unit)}">
          <div class="unit-card-head flex items-start justify-between gap-2 mb-3">
            <div>
              <div class="unit-card-type text-[11px] font-bold text-gray-400 uppercase tracking-widest">${escapeHtml(state.db.unitType)}</div>
              <div class="unit-card-no font-black text-3xl text-gray-800 leading-none">${unit.id}</div>
            </div>
            <div class="text-right">
              ${statusText ? `<div class="unit-status-pill text-[11px] px-2 py-1 rounded-full font-black ${statusPillClass}" title="${statusMeta.label}">${statusText}</div>` : ''}
              ${unit.newItemsQty > 0 ? `<div class="unit-card-new text-[10px] mt-2 font-black text-red-500">+${unit.newItemsQty} ใหม่</div>` : ''}
            </div>
          </div>
          <div class="unit-card-secondary text-[12px] font-black text-gray-700 mb-1">${secondary}</div>
          ${renderUnitItemThumbnails(thumbRows)}
          <div class="unit-card-meta flex justify-end items-center text-[10px] text-gray-500 font-bold">
            <span>${unit.orders.length > 0 ? `${unit.orders.reduce((s, o) => s + o.qty, 0)} รายการ` : `${cart.length} ตะกร้า`}</span>
          </div>
        </button>
      `;
    }).join('');
  }
  //* grid close

  //* order open
  function openTable(id) {
    state.activeUnitId = Number(id);
    const unit = state.db.units.find((item) => item.id === Number(id));
    if (!unit) return;
    const title = qs('active-unit-id');
    if (title) title.textContent = id;
    renderOrderedItemsBar(unit);
    renderItemList();
    updateCartTotal();
    switchTab('order');
  }

  function renderOrderedItemsBar(unit) {
    const box = qs('ordered-items-bar');
    const list = qs('ordered-items-list');
    if (!box || !list) return;
    if (!unit || unit.orders.length === 0) {
      box.classList.add('hidden');
      list.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    list.innerHTML = unit.orders.map((order) => `
      <div class="flex justify-between gap-2">
        <span>${escapeHtml(order.name)} x${order.qty}</span>
        <span class="font-black">฿${formatMoney(order.total)}</span>
      </div>
    `).join('');
  }

  function renderItemList() {
    const list = qs('item-list');
    if (!list) return;
    if (state.db.items.length === 0) {
      list.innerHTML = `
        <div class="bg-white rounded-[24px] p-6 border text-center text-gray-400 font-bold">
          ยังไม่มีรายการเมนู<br><span class="text-[11px]">เข้าไปเพิ่มที่ หลังร้าน → จัดการร้าน</span>
        </div>
      `;
      return;
    }
    list.innerHTML = state.db.items.map((item, index) => `
      <button onclick="handleItemClickByIndex(${index})" class="w-full bg-white p-3 rounded-[24px] border shadow-sm flex gap-3 active:scale-[0.99]">
        ${item.img
          ? `<img src="${item.img}" class="w-20 h-20 rounded-[18px] object-cover bg-gray-100">`
          : `<div class="w-20 h-20 rounded-[18px] bg-gray-100 flex items-center justify-center text-3xl">🍽️</div>`}
        <div class="flex-1 text-left min-w-0">
          <div class="flex justify-between gap-2 items-start">
            <div class="font-black text-lg text-gray-800 truncate">${escapeHtml(item.name)}</div>
            <div class="font-black theme-text text-xl whitespace-nowrap">฿${formatMoney(item.price)}</div>
          </div>
          <div class="mt-2 text-[11px] text-gray-500 font-bold">${item.addons?.length ? `มีรายการเสริม ${item.addons.length} ตัวเลือก` : 'แตะเพื่อใส่ตะกร้า'}</div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            ${item.addons?.length ? '<div class="inline-flex px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black">+ Add-on</div>' : ''}
            ${Number(item.redeemPoints || 0) > 0 ? `<div class="inline-flex px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black">แลก ${formatMoney(item.redeemPoints)} แต้ม</div>` : ''}
          </div>
        </div>
      </button>
    `).join('');
  }

  function handleItemClick(itemId) {
    const item = state.db.items.find((row) => String(row.id) === String(itemId));
    if (!item || !state.activeUnitId) return;
    playSound('click');
    if (item.addons?.length) {
      state.pendingAddonItem = item;
      state.currentAddonQty = 1;
      if (qs('addon-modal-name')) qs('addon-modal-name').textContent = item.name;
      if (qs('addon-modal-price')) qs('addon-modal-price').textContent = formatMoney(item.price);
      if (qs('addon-qty-display')) qs('addon-qty-display').textContent = '1';
      const options = qs('addon-options-list');
      if (options) {
        options.innerHTML = item.addons.map((addon, index) => `
          <label class="flex items-center justify-between gap-2 bg-gray-50 rounded-xl p-3 border cursor-pointer">
            <div>
              <div class="font-black text-gray-800">${escapeHtml(addon.name)}</div>
              <div class="text-[11px] text-gray-500 font-bold">+฿${formatMoney(addon.price)}</div>
            </div>
            <input type="checkbox" class="addon-checkbox w-5 h-5" data-name="${escapeHtml(addon.name)}" data-price="${Number(addon.price || 0)}" value="${index}">
          </label>
        `).join('');
      }
      openModal('modal-addon-select');
      return;
    }
    addToCartActual(item, [], 1);
  }

  function adjustAddonQty(delta) {
    state.currentAddonQty += delta;
    if (state.currentAddonQty < 1) state.currentAddonQty = 1;
    if (qs('addon-qty-display')) qs('addon-qty-display').textContent = String(state.currentAddonQty);
    playSound('click');
  }

  function confirmAddonSelection() {
    if (!state.pendingAddonItem) return;
    const addons = [...document.querySelectorAll('.addon-checkbox:checked')].map((checkbox) => ({
      name: checkbox.getAttribute('data-name') || '',
      price: Number(checkbox.getAttribute('data-price') || 0)
    }));
    addToCartActual(state.pendingAddonItem, addons, state.currentAddonQty);
    state.pendingAddonItem = null;
    state.currentAddonQty = 1;
    closeModal('modal-addon-select');
  }

  function addToCartActual(item, addons = [], qty = 1) {
    if (!state.activeUnitId) return;
    const unitCart = state.db.carts[state.activeUnitId] || [];
    const addonNames = addons.map((addon) => addon.name).join(', ');
    const addonPrice = addons.reduce((sum, addon) => sum + Number(addon.price || 0), 0);
    const linePrice = Number(item.price || 0) + addonPrice;
    const lineName = addonNames ? `${item.name} (${addonNames})` : item.name;
    const existing = unitCart.find((row) => row.name === lineName && row.price === linePrice);
    if (existing) {
      existing.qty += qty;
      existing.total = existing.qty * existing.price;
    } else {
      unitCart.push({
        id: `CART-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        itemId: item.id,
        baseName: item.name,
        name: lineName,
        price: linePrice,
        qty,
        total: qty * linePrice,
        addons: clone(addons),
        createdAt: Date.now()
      });
    }
    state.db.carts[state.activeUnitId] = unitCart;
    logOperation('ADD_TO_CART', { unitId: state.activeUnitId, itemId: item.id, qty, addons });
    updateCartTotal();
    saveDb({ render: true, sync: true });
    showToast('ใส่ตะกร้าแล้ว', 'success');
  }

  function updateCartTotal() {
    const cart = state.activeUnitId ? (state.db.carts[state.activeUnitId] || []) : [];
    const total = cart.reduce((sum, row) => sum + row.total, 0);
    const qty = cart.reduce((sum, row) => sum + row.qty, 0);
    if (qs('cart-total')) qs('cart-total').textContent = formatMoney(total);
    if (qs('cart-count')) qs('cart-count').textContent = String(qty);
    const sendBtn = qs('btn-send-order');
    if (sendBtn) {
      const enabled = qty > 0;
      sendBtn.disabled = !enabled;
      sendBtn.classList.toggle('is-disabled', !enabled);
      sendBtn.classList.toggle('is-ready', enabled);
    }
  }

  function handleItemClickByIndex(index) {
    const item = state.db.items[index];
    if (!item) return;
    handleItemClick(item.id);
  }

  function reviewCart() {
    openReviewCartModal();
  }

  function openReviewCartModal() {
    const cart = state.activeUnitId ? (state.db.carts[state.activeUnitId] || []) : [];
    if (!cart.length) return showToast('ตะกร้าว่าง', 'error');
    if (qs('review-unit-id')) qs('review-unit-id').textContent = String(state.activeUnitId);
    const list = qs('review-list');
    if (list) {
      list.innerHTML = cart.map((row, index) => `
        <div class="py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="font-black text-gray-800 leading-tight break-words">${escapeHtml(row.name)}</div>
              <div class="text-[11px] text-gray-500 font-bold mt-1">฿${formatMoney(row.price)} / รายการ</div>
            </div>
            <div class="font-black theme-text text-right shrink-0">฿${formatMoney(row.total)}</div>
          </div>
          <div class="mt-3 inline-flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-2 py-1">
            <button onclick="editCartItem(${index}, -1)" class="w-8 h-8 rounded-lg bg-white border border-gray-200 font-black text-gray-700">−</button>
            <span class="font-black text-base min-w-[24px] text-center">${row.qty}</span>
            <button onclick="editCartItem(${index}, 1)" class="w-8 h-8 rounded-lg bg-white border border-gray-200 font-black text-gray-700">+</button>
          </div>
        </div>
      `).join('');
    }
    const total = cart.reduce((sum, row) => sum + row.total, 0);
    if (qs('review-total-price')) qs('review-total-price').textContent = formatMoney(total);
    openModal('modal-review');
  }

  function editCartItem(index, delta) {
    const cart = state.activeUnitId ? (state.db.carts[state.activeUnitId] || []) : [];
    const item = cart[index];
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart.splice(index, 1);
    } else {
      item.total = item.qty * item.price;
    }
    state.db.carts[state.activeUnitId] = cart;
    updateCartTotal();
    openReviewCartModal();
    saveDb({ render: true, sync: false });
  }

  async function confirmOrderSend() {
    const unit = state.db.units.find((row) => row.id === Number(state.activeUnitId));
    const cart = state.db.carts[state.activeUnitId] || [];
    if (!unit || !cart.length) return showToast('ไม่มีรายการส่ง', 'error');
    if (IS_CLIENT_NODE) {
      const session = getStoredClientSession();
      if (!session?.clientSessionToken) return showToast('ยังไม่ได้รับสิทธิ์จากเครื่องหลัก', 'error');
      const profile = getClientProfile();
      const action = {
        type: 'APPEND_ORDER',
        opId: `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        shopId: session.shopId,
        syncVersion: Number(session.syncVersion || 1),
        clientId: profile.clientId,
        clientSessionToken: session.clientSessionToken,
        profileName: profile.profileName,
        unitId: state.activeUnitId,
        items: clone(cart)
      };
      await enqueueClientOp(action);
      await flushClientOpQueue();
      logOperation('CLIENT_APPEND_ORDER_REQUEST', { unitId: state.activeUnitId, profileName: profile.profileName, clientId: profile.clientId, role: 'client' });
      state.db.carts[state.activeUnitId] = [];
      closeModal('modal-review');
      renderOrderedItemsBar(unit);
      updateCartTotal();
      saveDb({ render: true, sync: false });
      showToast(navigator.onLine ? 'ส่งออร์เดอร์ไปเครื่องหลักแล้ว' : 'บันทึกคิวไว้แล้ว จะซิงก์เมื่อออนไลน์', navigator.onLine ? 'success' : 'click');
      switchTab('shop', qs('tab-shop'));
      return;
    }
    if (!unit.startTime) unit.startTime = Date.now();
    unit.lastActivityAt = Date.now();
    unit.status = 'active';
    unit.checkoutRequested = false;
    unit.checkoutRequestedAt = null;
    unit.lastOrderBy = 'Master';

    cart.forEach((row) => {
      const copy = {
        id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        itemId: row.itemId,
        baseName: row.baseName,
        name: row.name,
        qty: row.qty,
        price: row.price,
        total: row.total,
        addons: clone(row.addons || []),
        redeemedByPoints: false,
        redeemPoints: 0,
        source: 'master',
        orderBy: 'Master',
        createdAt: Date.now()
      };
      unit.orders.push(copy);
      unit.newItemsQty += row.qty;
    });

    logOperation('SEND_ORDER', { unitId: state.activeUnitId, lines: clone(cart) });
    state.db.carts[state.activeUnitId] = [];
    closeModal('modal-review');
    renderOrderedItemsBar(unit);
    updateCartTotal();
    saveDb({ render: true, sync: true });
    showToast('ส่งออร์เดอร์แล้ว', 'success');
    switchTab('shop', qs('tab-shop'));
  }
  //* order close

  //* queue and checkout open
  function renderShopQueue() {
    const queue = qs('shop-queue');
    const count = qs('shop-request-count');
    if (!queue) return;
    const activeUnits = state.db.units
      .filter((unit) => unit.orders.length > 0 || (state.db.carts[unit.id] || []).length > 0)
      .sort((a, b) => (b.lastActivityAt || b.checkoutRequestedAt || b.startTime || 0) - (a.lastActivityAt || a.checkoutRequestedAt || a.startTime || 0));
    if (count) count.textContent = `${activeUnits.length} รายการ`;
    const queueToolbar = qs('shop-queue-toolbar');
    const queueToggle = qs('btn-toggle-queue-collapse');
    const shouldCollapse = activeUnits.length > 10;
    if (queueToolbar && queueToggle) {
      queueToolbar.classList.toggle('hidden', !shouldCollapse);
      queueToggle.textContent = state.shopQueueCollapsed ? `ดูทั้งหมด (${activeUnits.length})` : 'ย่อรายการ';
    }
    const queueRows = shouldCollapse && state.shopQueueCollapsed ? activeUnits.slice(0, 10) : activeUnits;
    if (!activeUnits.length) {
      queue.innerHTML = '<div class="bg-white p-6 rounded-[24px] border text-center text-gray-400 font-bold">ยังไม่มีคิวเช็คบิล</div>';
      return;
    }
    queue.innerHTML = queueRows.map((unit) => {
      const statusMeta = getUnitStatusMeta(unit);
      const cart = state.db.carts[unit.id] || [];
      const hasDraft = cart.length > 0;
      const total = unit.orders.reduce((sum, row) => sum + row.total, 0);
      const waitStart = unit.lastActivityAt || unit.checkoutRequestedAt || unit.startTime;
      const waitText = unit.checkoutRequested
        ? `รอ ${formatDurationFrom(unit.checkoutRequestedAt || waitStart)}`
        : `กำลังใช้งาน ${formatDurationFrom(waitStart)}`;
      const checkoutActionLabel = hasDraft
        ? 'ไปส่งออร์เดอร์'
        : IS_CLIENT_NODE
          ? 'ดูสถานะ'
          : (unit.checkoutRequested ? 'เปิดบิล' : 'ดูรายการ');
      const checkoutAction = hasDraft ? `openTable(${unit.id})` : `openCheckout(${unit.id})`;
      const checkoutRequestBtn = hasDraft
        ? `<button onclick="markCheckoutRequest(${unit.id})" class="bg-amber-50 text-amber-700 border border-amber-200 px-4 py-3 rounded-2xl font-black text-sm active:scale-95 opacity-60 pointer-events-none">ขอเช็คบิล</button>`
        : IS_CLIENT_NODE
          ? `<button onclick="markCheckoutRequest(${unit.id})" class="bg-amber-50 text-amber-700 border border-amber-200 px-4 py-3 rounded-2xl font-black text-sm active:scale-95 ${unit.checkoutRequested ? 'opacity-60 pointer-events-none' : ''}">${unit.checkoutRequested ? 'ขอเช็คบิลแล้ว' : 'ขอเช็คบิล'}</button>`
          : '';
      const thumbRows = hasDraft ? cart : unit.orders;
      const orderSummary = thumbRows.map((row) => `${row.baseName || row.name} x${row.qty}`).join(', ');

      return `
        <div class="unit-status-ring ${statusMeta.cls} bg-white p-4 rounded-[24px] border-2 shadow-sm relative ${getUnitCardClass(unit)}">
          ${unit.newItemsQty > 0 ? `<div class="absolute -top-2 -left-2 bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-full shadow border-2 border-white">+${unit.newItemsQty}</div>` : ''}
          <div class="flex items-start justify-between gap-3 mb-2">
            <div>
              <div class="font-black text-2xl text-gray-800">${getUnitLabel(unit.id)}</div>
              <div class="text-[11px] font-bold text-amber-600 leading-tight">${waitText}</div>
            </div>
            <div class="text-right">
              <div class="font-black text-xl text-gray-800">฿${formatMoney(total)}</div>
              <div class="text-[10px] text-gray-400 font-bold">${formatDurationFrom(unit.startTime)}</div>
            </div>
          </div>

          <div class="text-[11px] text-gray-500 font-bold mb-2 truncate">${orderSummary}</div>

          ${renderUnitItemThumbnails(thumbRows)}
          <div class="flex gap-2">
            <button onclick="${checkoutAction}" class="flex-1 bg-slate-900 text-white py-3 rounded-2xl font-black text-sm active:scale-95">${checkoutActionLabel}</button>
            ${checkoutRequestBtn}
          </div>
        </div>
      `;
    }).join('');
  }

  async function markCheckoutRequest(unitId) {
    const unit = state.db.units.find((row) => row.id === Number(unitId));
    if (!unit) return;
    if (IS_CLIENT_NODE && unit.checkoutRequested) {
      showToast('ส่งคำขอเช็คบิลแล้ว รอเครื่องหลักดำเนินการ', 'click');
      return;
    }
    if (IS_CLIENT_NODE) {
      const session = getStoredClientSession();
      if (!session?.clientSessionToken) return showToast('ยังไม่ได้รับสิทธิ์จากเครื่องหลัก', 'error');
      const profile = getClientProfile();
      const action = {
        type: 'REQUEST_CHECKOUT',
        opId: `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        shopId: session.shopId,
        syncVersion: Number(session.syncVersion || 1),
        clientId: profile.clientId,
        clientSessionToken: session.clientSessionToken,
        profileName: profile.profileName,
        unitId
      };
      await enqueueClientOp(action);
      await flushClientOpQueue();
      showToast(navigator.onLine ? 'ส่งคำขอเช็คบิลไปเครื่องหลักแล้ว' : 'บันทึกคำขอไว้แล้ว จะซิงก์เมื่อออนไลน์', navigator.onLine ? 'success' : 'click');
      return;
    }
    if (!IS_CLIENT_NODE && unit.checkoutRequested && !canManageOrders()) {
      showToast('ต้องเข้าโหมดแอดมินก่อนจึงยกเลิกคำขอเช็คบิลได้', 'error');
      return;
    }
    unit.checkoutRequested = !unit.checkoutRequested;
    unit.checkoutRequestedAt = unit.checkoutRequested ? Date.now() : null;
    logOperation('CHECKOUT_REQUEST_TOGGLE', {
      unitId,
      unitLabel: getUnitLabel(unit.id),
      value: unit.checkoutRequested
    });
    saveDb({ render: true, sync: true });
  }

  function openCheckout(unitId) {
    const unit = state.db.units.find((row) => row.id === Number(unitId));
    if (!unit) return;
    state.activeUnitId = Number(unitId);
    unit.newItemsQty = 0;
    const list = qs('checkout-item-list');
    const total = unit.orders.reduce((sum, row) => sum + row.total, 0);
    state.redeemDraft = [];
    state.currentCheckoutTotal = total;
    if (qs('checkout-unit-id')) qs('checkout-unit-id').textContent = String(unit.id);
    if (qs('checkout-total')) qs('checkout-total').textContent = formatMoney(total);
    resetCheckoutMemberInputs();
    if (list) {
      list.innerHTML = unit.orders.map((row, index) => `
        <div class="flex justify-between items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <div class="font-black text-gray-800 truncate">${escapeHtml(row.name)}</div>
            <div class="text-[10px] text-gray-400 font-bold mt-1">${thaiDate(row.createdAt)}${row.redeemedByPoints ? ` • แลก ${formatMoney(row.redeemPoints || 0)} แต้ม/ชิ้น` : ''}</div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="font-black">x${row.qty}</div>
            <div class="font-black w-16 text-right">฿${formatMoney(row.total)}</div>
            ${canManageOrders() ? `<button onclick="deleteOrderItem(${index})" class="w-8 h-8 rounded-lg bg-red-50 text-red-500 font-black">×</button>` : ''}
          </div>
        </div>
      `).join('');
    }
    updateQrDisplay();
    openModal('modal-checkout');
    const paymentButtons = qs('checkout-payment-buttons');
    if (paymentButtons) paymentButtons.classList.toggle('hidden', IS_CLIENT_NODE);
    renderShopQueue();
  }

  function getCheckoutResolvedMember() {
    const keyword = String(qs('checkout-member-keyword')?.value || '').trim();
    if (!keyword) return null;
    return resolveMemberByKeyword(keyword);
  }

  function openRedeemPointsModal() {
    const member = getCheckoutResolvedMember();
    if (!member) return showToast('กรุณากรอกเบอร์โทรหรือชื่อสมาชิกก่อนกดแลกแต้ม', 'error');
    const redeemable = state.db.items.filter((item) => Number(item.redeemPoints || 0) > 0);
    if (!redeemable.length) {
      showToast('ยังไม่มีเมนูที่ตั้งค่าแลกแต้ม', 'error');
      return;
    }
    state.redeemDraft = [];
    const balanceEl = qs('redeem-member-balance');
    if (balanceEl) balanceEl.textContent = `แต้มคงเหลือ: ${formatMoney(member.points || 0)}`;
    const list = qs('redeem-menu-list');
    if (list) {
      list.innerHTML = redeemable.map((item) => `
        <div class="bg-gray-50 border rounded-xl p-3">
          <div class="flex justify-between items-start gap-2">
            <div class="min-w-0">
              <div class="font-black text-sm text-gray-800 truncate">${escapeHtml(item.name)}</div>
              <div class="text-[10px] text-gray-500 font-bold">ปกติ ฿${formatMoney(item.price)} • แลก ${formatMoney(item.redeemPoints)} แต้ม</div>
            </div>
            <input id="redeem-qty-${escapeHtml(item.id)}" type="number" min="0" step="1" value="0" class="w-16 border rounded-lg p-1.5 text-center font-black text-sm" />
          </div>
        </div>
      `).join('');
    }
    openModal('modal-redeem-points');
  }

  function applyRedeemPointsSelection() {
    const member = getCheckoutResolvedMember();
    if (!member) return showToast('ไม่พบสมาชิกสำหรับแลกแต้ม', 'error');
    const unit = state.db.units.find((row) => row.id === Number(state.activeUnitId));
    if (!unit) return;
    const redeemable = state.db.items.filter((item) => Number(item.redeemPoints || 0) > 0);
    if (!redeemable.length) return showToast('ยังไม่มีเมนูแลกแต้ม', 'error');

    const picked = [];
    let totalNeed = 0;
    redeemable.forEach((item) => {
      const qty = Math.max(0, Math.floor(Number(qs(`redeem-qty-${item.id}`)?.value || 0)));
      if (!qty) return;
      const points = Math.max(0, Number(item.redeemPoints || 0));
      const lineNeed = points * qty;
      totalNeed += lineNeed;
      picked.push({ item, qty, points, lineNeed });
    });
    if (!picked.length) return showToast('ยังไม่ได้เลือกเมนูแลกแต้ม', 'error');
    if (totalNeed > Number(member.points || 0)) return showToast('แต้มไม่พอ', 'error');

    picked.forEach(({ item, qty, points }) => {
      unit.orders.push({
        id: `ORD-RDM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        itemId: item.id,
        name: `${item.name} (แลกแต้ม)`,
        qty,
        price: 0,
        total: 0,
        addons: [],
        createdAt: Date.now(),
        redeemedByPoints: true,
        redeemPoints: points
      });
    });
    logOperation('ADD_REDEEM_ITEMS', {
      unitId: unit.id,
      memberId: member.id,
      totalPoints: totalNeed,
      lines: picked.map((row) => ({ itemId: row.item.id, qty: row.qty, points: row.points }))
    });
    closeModal('modal-redeem-points');
    saveDb({ render: true, sync: true });
    openCheckout(unit.id);
    showToast(`เพิ่มเมนูแลกแต้มให้ ${member.name || member.phone || 'สมาชิก'} แล้ว (${formatMoney(totalNeed)} แต้ม)`, 'success');
  }

  function updateQrDisplay() {
    const offlineImg = qs('qr-offline-img');
    const genArea = qs('qr-gen-area');
    const status = qs('qr-status-text');
    if (!offlineImg || !genArea || !status) return;
    genArea.innerHTML = '';
    status.textContent = '';
    const isDynamicEnabled = isPromptPayDynamicEnabled();
    offlineImg.classList.add('hidden');
    genArea.classList.add('hidden');

    if (!isDynamicEnabled) {
      if (state.db.qrOffline) {
        offlineImg.src = state.db.qrOffline;
        offlineImg.classList.remove('hidden');
        status.textContent = state.db.bank && state.db.ppay ? `${state.db.bank} • ${state.db.ppay} (Static)` : 'ใช้ QR ที่ร้านอัปไว้ (Static)';
        return;
      }
      genArea.classList.remove('hidden');
      genArea.innerHTML = '<div class="text-xs text-gray-400 font-bold text-center">ยังไม่มี QR แบบภาพนิ่ง<br>กรุณาอัปโหลดในหน้าระบบ</div>';
      status.textContent = 'โหมด Static: ยังไม่มี QR ภาพนิ่ง';
      return;
    }

    const payload = buildPromptPayPayload(state.db.ppay, state.currentCheckoutTotal, state.db.shopName);
    const qrCanvas = generatePromptPayQrCanvas(state.db.ppay, state.currentCheckoutTotal, {
      width: 150,
      height: 150,
      shopName: state.db.shopName
    });
    genArea.classList.remove('hidden');
    if (qrCanvas && payload) {
      genArea.appendChild(qrCanvas);
      status.textContent = `${state.db.bank || 'พร้อมเพย์'} • ${state.db.ppay} (Dynamic)`;
      return;
    }

    if (payload && navigator.onLine) {
      const onlineQr = document.createElement('img');
      onlineQr.className = 'w-full h-full object-cover';
      onlineQr.alt = 'PromptPay QR';
      onlineQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
      onlineQr.onerror = () => {
        genArea.innerHTML = '<div class="text-xs text-gray-400 font-bold text-center">ไม่สามารถโหลด QR ออนไลน์ได้</div>';
      };
      genArea.appendChild(onlineQr);
      status.textContent = `${state.db.bank || 'พร้อมเพย์'} • ${state.db.ppay} (Dynamic/Online)`;
      return;
    }
    genArea.innerHTML = '<div class="text-xs text-gray-400 font-bold text-center">ยังไม่สามารถสร้าง QR Dynamic ได้<br>ตรวจสอบพร้อมเพย์/อินเทอร์เน็ต</div>';
    status.textContent = state.db.ppay && !navigator.onLine ? 'โหมด Dynamic ต้องใช้อินเทอร์เน็ตสำหรับ fallback' : 'ไม่มี QR พร้อมใช้งาน';
  }

  function deleteOrderItem(index) {
    if (!canManageOrders()) {
      showToast('เฉพาะเครื่องหลักที่เข้าโหมดแอดมินเท่านั้นที่ลบออร์เดอร์ได้', 'error');
      return;
    }
    const unit = state.db.units.find((row) => row.id === Number(state.activeUnitId));
    if (!unit) return;
    const removed = unit.orders.splice(index, 1);
    if (removed.length) {
      logOperation('DELETE_ORDER_ITEM', {
        unitId: unit.id,
        unitLabel: getUnitLabel(unit.id),
        deletedAt: Date.now(),
        item: removed[0]
      });
    }
    if (!unit.orders.length) {
      unit.status = 'idle';
      unit.startTime = null;
      unit.lastActivityAt = null;
      unit.checkoutRequested = false;
      unit.checkoutRequestedAt = null;
      unit.newItemsQty = 0;
    }
    saveDb({ render: true, sync: true });
    if (!unit.orders.length) {
      closeModal('modal-checkout');
      showToast('ลบรายการแล้ว โต๊ะว่างแล้ว', 'success');
      return;
    }
    openCheckout(unit.id);
  }

  function confirmPayment(method) {
    if (IS_CLIENT_NODE) {
      showToast('อุปกรณ์เสริมดูสถานะบิลได้อย่างเดียว ให้ปิดบิลที่เครื่องหลัก', 'error');
      return;
    }
    const unit = state.db.units.find((row) => row.id === Number(state.activeUnitId));
    if (!unit || !unit.orders.length) return;
    const total = unit.orders.reduce((sum, row) => sum + row.total, 0);
    const usedPoints = unit.orders.reduce((sum, row) => {
      if (!row || !row.redeemedByPoints) return sum;
      return sum + Math.max(0, Number(row.redeemPoints || 0)) * Math.max(1, Number(row.qty || 1));
    }, 0);
    const memberKeyword = String(qs('checkout-member-keyword')?.value || '').trim();
    let memberSnapshot = null;
    if (memberKeyword) {
      const normalizedPhone = sanitizePhone(memberKeyword);
      const existing = resolveMemberByKeyword(memberKeyword);
      const nowMs = Date.now();
      const nextMember = normalizeMemberRecord({
        id: existing?.id || '',
        phone: normalizedPhone || existing?.phone || '',
        name: normalizedPhone ? (existing?.name || normalizedPhone) : (existing?.name || memberKeyword),
        points: existing?.points || 0,
        firstSeenAt: existing?.firstSeenAt || nowMs,
        updatedAt: nowMs
      });
      const currentPoints = Number(nextMember.points || 0);
      if (usedPoints > currentPoints) {
        return showToast('แต้มสมาชิกไม่พอสำหรับรายการแลกแต้ม', 'error');
      }
      nextMember.points = currentPoints - usedPoints;
      const paidAmountForPoint = Math.max(0, total);
      const earnedPoints = Math.floor(paidAmountForPoint / MEMBER_BAHT_PER_POINT);
      nextMember.points = Number(nextMember.points || 0) + earnedPoints;
      state.db.members[nextMember.id] = nextMember;
      memberSnapshot = {
        id: nextMember.id,
        phone: nextMember.phone,
        name: nextMember.name,
        usedPoints,
        earnedPoints
      };
      const api = resolveFirebaseSyncApi();
      if (api && state.db.shopId) {
        const payload = { ...nextMember, shopId: state.db.shopId };
        if (typeof api.upsertMember === 'function') api.upsertMember(state.db.shopId, payload).catch(() => {});
        else if (typeof api.writeMember === 'function') api.writeMember(state.db.shopId, payload).catch(() => {});
      }
    }
    const timestamp = new Date();
    state.db.sales.push({
      id: `SALE-${Date.now()}`,
      unitId: unit.id,
      unitType: state.db.unitType,
      items: clone(unit.orders),
      total,
      method,
      member: memberSnapshot,
      usedPoints,
      date: getLocalYYYYMMDD(timestamp),
      time: getTimeHHMM(timestamp),
      startedAt: unit.startTime,
      closedAt: Date.now()
    });
    logOperation('CONFIRM_PAYMENT', { unitId: unit.id, total, method });
    state.db.carts[unit.id] = [];
    unit.orders = [];
    unit.status = 'idle';
    unit.startTime = null;
    unit.lastActivityAt = null;
    unit.checkoutRequested = false;
    unit.checkoutRequestedAt = null;
    unit.newItemsQty = 0;
    unit.lastOrderBy = '';
    closeModal('modal-checkout');
    saveDb({ render: true, sync: true });
    const paidText = method === 'transfer' ? 'ปิดบิล (โอน/QR) แล้ว' : 'ปิดบิล (เงินสด) แล้ว';
    const usedText = memberSnapshot?.usedPoints ? ` ใช้ ${memberSnapshot.usedPoints} แต้ม` : '';
    const pointText = memberSnapshot?.earnedPoints ? ` +${memberSnapshot.earnedPoints} แต้ม` : '';
    showToast(`${paidText}${usedText}${pointText}`, 'success');
    if (state.activeTab === 'shop') renderShopQueue();
    if (state.activeTab === 'manage') renderAnalytics();
  }
  //* queue and checkout close

  //* analytics open
  function switchManageSub(name, element) {
    state.activeManageSub = name;
    document.querySelectorAll('.manage-tab').forEach((tab) => {
      tab.classList.remove('active', 'bg-white', 'shadow-sm', 'text-gray-800');
      tab.classList.add('text-gray-500');
    });
    element?.classList?.remove('text-gray-500');
    element?.classList?.add('active', 'bg-white', 'shadow-sm', 'text-gray-800');
    if (qs('sub-dash')) qs('sub-dash').classList.toggle('hidden', name !== 'dash');
    if (qs('sub-menu')) qs('sub-menu').classList.toggle('hidden', name !== 'menu');
    if (name === 'menu') {
      renderAdminLists();
      const activeMenuBtn = qs(state.activeMenuManageSub === 'redeem' ? 'menu-manage-tab-redeem' : 'menu-manage-tab-menu');
      switchMenuManageTab(state.activeMenuManageSub, activeMenuBtn);
    }
    if (name === 'dash') renderAnalytics();
  }

  function switchDashTab(name, element) {
    state.activeDashSub = name;
    document.querySelectorAll('.dash-sub-tab').forEach((tab) => {
      tab.classList.remove('active', 'bg-white', 'shadow-sm', 'text-gray-800');
      tab.classList.add('text-gray-500');
    });
    element?.classList?.remove('text-gray-500');
    element?.classList?.add('active', 'bg-white', 'shadow-sm', 'text-gray-800');
    if (qs('dash-history')) qs('dash-history').classList.toggle('hidden', name !== 'history');
    if (qs('dash-top')) qs('dash-top').classList.toggle('hidden', name !== 'top');
    renderAnalytics();
  }

  function calculateSalesBuckets() {
    let today = 0;
    let week = 0;
    let month = 0;
    const todayStr = getLocalYYYYMMDD();
    const todayObj = new Date(todayStr);
    const itemCounts = {};

    state.db.sales.forEach((sale) => {
      const saleDateObj = new Date(sale.date);
      const diffDays = Math.floor((todayObj - saleDateObj) / 86400000);
      if (sale.date === todayStr) today += Number(sale.total || 0);
      if (diffDays >= 0 && diffDays < 7) week += Number(sale.total || 0);
      if (diffDays >= 0 && diffDays < 30) month += Number(sale.total || 0);
      (sale.items || []).forEach((row) => {
        const base = row.baseName || (row.name || '').split(' (')[0] || 'ไม่ระบุ';
        itemCounts[base] = (itemCounts[base] || 0) + Number(row.qty || 0);
      });
    });

    return { today, week, month, itemCounts };
  }

  function formatDisplayDate(date) {
    return new Date(date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
  }

  function getSalesCompareData(mode = 'today') {
    const today = new Date(getLocalYYYYMMDD());
    const dayMs = 86400000;
    let currentStart = new Date(today);
    let currentEnd = new Date(today);
    let previousStart = new Date(today);
    let previousEnd = new Date(today);
    let currentLabel = 'วันนี้';
    let previousLabel = 'เมื่อวาน';
    let title = 'เปรียบเทียบรายได้วันนี้ vs เมื่อวาน';
    if (mode === 'week') {
      currentStart = new Date(today.getTime() - (6 * dayMs));
      previousStart = new Date(today.getTime() - (13 * dayMs));
      previousEnd = new Date(today.getTime() - (7 * dayMs));
      currentLabel = '7 วันล่าสุด';
      previousLabel = '7 วันก่อนหน้า';
      title = 'เปรียบเทียบรายได้ 7 วันล่าสุด vs 7 วันก่อนหน้า';
    } else if (mode === 'month') {
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      currentStart = currentMonthStart;
      previousStart = prevMonthStart;
      previousEnd = prevMonthEnd;
      currentLabel = 'เดือนนี้';
      previousLabel = 'เดือนก่อน';
      title = 'เปรียบเทียบรายได้เดือนนี้ vs เดือนก่อน';
    } else {
      previousStart = new Date(today.getTime() - dayMs);
      previousEnd = new Date(today.getTime() - dayMs);
    }
    const toStr = (date) => getLocalYYYYMMDD(date);
    const currentStartStr = toStr(currentStart);
    const currentEndStr = toStr(currentEnd);
    const previousStartStr = toStr(previousStart);
    const previousEndStr = toStr(previousEnd);
    const sumSales = (start, end) => state.db.sales
      .filter((sale) => sale.date >= start && sale.date <= end)
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const currentTotal = sumSales(currentStartStr, currentEndStr);
    const previousTotal = sumSales(previousStartStr, previousEndStr);

    const percent = previousTotal > 0
      ? ((currentTotal - previousTotal) / previousTotal) * 100
      : (currentTotal > 0 ? 100 : 0);
    return {
      mode,
      currentStartStr,
      currentEndStr,
      currentTotal,
      previousTotal,
      percent,
      currentLabel,
      previousLabel,
      title,
      rangeText: `${formatDisplayDate(previousStart)} - ${formatDisplayDate(currentEnd)}`
    };
  }

  function getTopItemsByDateRange(start, end, limit = 5) {
    const counts = {};
    state.db.sales
      .filter((sale) => sale.date >= start && sale.date <= end)
      .forEach((sale) => {
        (sale.items || []).forEach((row) => {
          const base = row.baseName || (row.name || '').split(' (')[0] || 'ไม่ระบุ';
          counts[base] = (counts[base] || 0) + Number(row.qty || 0);
        });
      });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  function renderSalesCompareChart(data, targetId) {
    const chart = qs(targetId);
    if (!chart) return;
    const max = Math.max(data.currentTotal, data.previousTotal, 1);
    const currentPct = Math.max(8, Math.round((data.currentTotal / max) * 100));
    const previousPct = Math.max(8, Math.round((data.previousTotal / max) * 100));
    chart.innerHTML = `
      <div class="sales-compare-col">
        <div class="text-[11px] font-bold text-gray-500">${data.previousLabel}</div>
        <div class="text-lg font-black text-blue-700">฿${formatMoney(data.previousTotal)}</div>
        <div class="sales-compare-bar-wrap"><div class="sales-compare-bar previous" style="height:${previousPct}%"></div></div>
      </div>
      <div class="sales-compare-col">
        <div class="text-[11px] font-bold text-gray-500">${data.currentLabel}</div>
        <div class="text-lg font-black text-emerald-700">฿${formatMoney(data.currentTotal)}</div>
        <div class="sales-compare-bar-wrap"><div class="sales-compare-bar current" style="height:${currentPct}%"></div></div>
      </div>
    `;
  }

  function openSalesInsight(mode = 'today') {
    const data = getSalesCompareData(mode);
    const isUp = (data.currentTotal - data.previousTotal) >= 0;
    if (qs('sales-insight-title')) qs('sales-insight-title').textContent = `📈 ${data.title}`;
    if (qs('sales-insight-range')) qs('sales-insight-range').textContent = `ช่วง: ${data.rangeText}`;
    if (qs('sales-insight-change')) {
      const chip = qs('sales-insight-change');
      chip.textContent = `${isUp ? '+' : '-'}${Math.abs(data.percent).toFixed(1)}%`;
      chip.className = `inline-flex text-xs font-black px-3 py-1.5 rounded-full mb-4 ${isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`;
    }
    renderSalesCompareChart(data, 'sales-insight-chart');
    const topBox = qs('sales-insight-top-items');
    if (topBox) {
      const topItems = getTopItemsByDateRange(data.currentStartStr, data.currentEndStr, 5);
      topBox.innerHTML = topItems.length
        ? topItems.map(([name, qty], idx) => `<div class="flex items-center justify-between bg-white rounded-xl p-2 border"><span class="font-black text-gray-700">${idx + 1}. ${escapeHtml(name)}</span><span class="font-black text-gray-500">x${qty}</span></div>`).join('')
        : '<div class="text-[11px] text-gray-400 font-bold">ยังไม่มียอดขาย</div>';
    }
    openModal('modal-sales-insight');
  }

  function renderSalesCompare() {
    const data = getSalesCompareData(state.activeSalesCompare);
    const cardId = state.activeSalesCompare === 'week' ? 'card-stat-week' : state.activeSalesCompare === 'month' ? 'card-stat-month' : 'card-stat-today';
    document.querySelectorAll('.sales-summary-card').forEach((card) => {
      card.classList.remove('is-active');
      card.setAttribute('aria-selected', 'false');
    });
    qs(cardId)?.classList?.add('is-active');
    qs(cardId)?.setAttribute('aria-selected', 'true');
    const title = qs('sales-compare-title');
    const range = qs('sales-compare-range');
    const chip = qs('sales-compare-change');
    const chart = qs('sales-compare-chart');
    if (title) title.textContent = data.title;
    if (range) range.textContent = `ช่วงเวลา: ${data.rangeText}`;
    const diff = data.currentTotal - data.previousTotal;
    const isUp = diff >= 0;
    if (chip) {
      const percentText = `${isUp ? '+' : '-'}${Math.abs(data.percent).toFixed(1)}%`;
      chip.textContent = percentText;
      chip.className = `text-xs font-black px-3 py-1.5 rounded-full ${isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`;
    }
    if (chart) renderSalesCompareChart(data, 'sales-compare-chart');
  }

  function selectSalesCompareMode(mode, element) {


    state.activeSalesCompare = mode;
    document.querySelectorAll('.sales-summary-card').forEach((card) => {
      card.classList.remove('is-active');
      card.setAttribute('aria-selected', 'false');
    });
    element?.classList?.add('is-active');
    element?.setAttribute('aria-selected', 'true');
    renderSalesCompare();
    openSalesInsight(mode);
  }

  function getSearchDateRange() {
    const today = getLocalYYYYMMDD();
    const startInput = qs('search-start');
    const endInput = qs('search-end');
    let start = startInput?.value || '';
    let end = endInput?.value || '';
    if (!start && !end) {
      start = today;
      end = today;
      if (startInput) startInput.value = today;
      if (endInput) endInput.value = today;
    } else {
      start = start || end;
      end = end || start;
      if (start > end) [start, end] = [end, start];
      if (startInput) startInput.value = start;
      if (endInput) endInput.value = end;
    }
    return { start, end };
  }

  function getSalesBySelectedRange() {
    const { start, end } = getSearchDateRange();
    return state.db.sales.filter((sale) => sale.date >= start && sale.date <= end);
  }

  function syncCustomSearchUiMode() {
    const startInput = qs('search-start');
    const endInput = qs('search-end');
    const proLockNote = qs('search-pro-lock-note');
    const locked = !state.isPro;
    if (startInput) startInput.disabled = locked;
    if (endInput) endInput.disabled = locked;
    if (proLockNote) proLockNote.classList.toggle('hidden', !locked);
  }

  function renderAnalytics() {
    const { today, week, month } = calculateSalesBuckets();
    if (qs('stat-today')) qs('stat-today').textContent = formatMoney(today);
    if (qs('stat-week')) qs('stat-week').textContent = formatMoney(week);
    if (qs('stat-month')) qs('stat-month').textContent = formatMoney(month);
    const cashTotal = state.db.sales.reduce((sum, sale) => !isTransferMethod(sale.method) ? sum + Number(sale.total || 0) : sum, 0);
    const transferTotal = state.db.sales.reduce((sum, sale) => isTransferMethod(sale.method) ? sum + Number(sale.total || 0) : sum, 0);
    const grandTotal = cashTotal + transferTotal;
    if (qs('stat-grand-total')) qs('stat-grand-total').textContent = formatMoney(grandTotal);
    if (qs('stat-cash-total')) qs('stat-cash-total').textContent = formatMoney(cashTotal);
    if (qs('stat-transfer-total')) qs('stat-transfer-total').textContent = formatMoney(transferTotal);
    renderSalesCompare();

    const filteredSales = getSalesBySelectedRange();
    const filteredItemCounts = {};
    let filteredAmount = 0;
    filteredSales.forEach((sale) => {
      filteredAmount += Number(sale.total || 0);
      (sale.items || []).forEach((row) => {
        const base = row.baseName || (row.name || '').split(' (')[0] || 'ไม่ระบุ';
        filteredItemCounts[base] = (filteredItemCounts[base] || 0) + Number(row.qty || 0);
      });
    });
    if (qs('search-total')) qs('search-total').textContent = formatMoney(filteredAmount);

    const history = qs('sales-history');
    if (history) {
      if (!filteredSales.length) {
        history.innerHTML = '<div class="py-8 text-center text-gray-400 font-bold">ยังไม่มีประวัติยอดขาย</div>';
      } else {
        history.innerHTML = [...filteredSales].reverse().slice(0, 60).map((sale) => `
          <div class="py-3 flex justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="font-black text-gray-800">${sale.date} <span class="text-gray-400 ml-1">${sale.time}</span></div>
              <div class="text-[10px] text-gray-400 font-bold mt-1 truncate">${(sale.items || []).map((row) => `${row.baseName || row.name} x${row.qty}`).join(', ')}</div>
            </div>
            <div class="text-right shrink-0">
              <div class="font-black theme-text text-lg">฿${formatMoney(sale.total)}</div>
              <div class="text-[10px] text-gray-500 font-black">${isTransferMethod(sale.method) ? '📱 โอน/QR' : '💵 เงินสด'}</div>
            </div>
          </div>
        `).join('');
      }
    }

    const topBox = qs('top-items-list');
    if (topBox) {
      const top = Object.entries(filteredItemCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const topDisplay = top;
      if (!topDisplay.length) {
        topBox.innerHTML = '<div class="py-8 text-center text-gray-400 font-bold">ยังไม่มียอดฮิต</div>';
      } else {
        topBox.innerHTML = topDisplay.map(([name, qty], idx) => `
          <div class="flex justify-between items-center bg-gray-50 p-3 rounded-2xl border">
            <div class="font-black text-gray-800">${idx + 1}. ${escapeHtml(name)}</div>
            <div class="text-[10px] font-black px-2 py-1 rounded-full bg-white border text-gray-500">${qty} ครั้ง</div>
          </div>
        `).join('');
      }
    }

  }

  function calculateCustomSalesRealtime() {
    getSearchDateRange();
    renderAnalytics();
  }

  function clearSales() {
    if (IS_CLIENT_NODE) return showToast('รีเซ็ตยอดขายได้เฉพาะเครื่องหลัก', 'error');
    if (!canManageOrders()) return showToast('ต้องเข้าโหมดแอดมินก่อนรีเซ็ตยอดขาย', 'error');
    openModal('modal-clear-sales-confirm');
  }

  function cancelClearSalesConfirm() {
    closeModal('modal-clear-sales-confirm');
  }

  function confirmClearSalesAction() {
    closeModal('modal-clear-sales-confirm');
    state.db.sales = [];
    logOperation('CLEAR_SALES');
    saveDb({ render: true, sync: true });
    showToast('ล้างยอดขายทั้งหมดแล้ว', 'success');
  }
  //* analytics close

  //* menu open
  function renderAdminLists() {
    const list = qs('admin-menu-list');
    if (qs('menu-count')) qs('menu-count').textContent = String(state.db.items.length);
    renderRedeemManagementList();
    if (!list) return;
    if (!state.db.items.length) {
      list.innerHTML = '<div class="bg-gray-50 border rounded-[24px] p-6 text-center text-gray-400 font-bold">ยังไม่มีเมนูในระบบ</div>';
      return;
    }
    list.innerHTML = state.db.items.map((item) => `
      <div class="bg-gray-50 border rounded-[24px] p-4">
        <div class="flex gap-4">
          ${item.img ? `<img src="${item.img}" class="w-20 h-20 rounded-[18px] object-cover bg-white border">` : '<div class="w-20 h-20 rounded-[18px] bg-white border flex items-center justify-center text-2xl">🍱</div>'}
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-start gap-3">
              <div class="min-w-0">
                <div class="font-black text-lg text-gray-800 truncate">${escapeHtml(item.name)}</div>
                <div class="text-[11px] text-gray-500 font-bold mt-1">฿${formatMoney(item.price)}</div>
                ${Number(item.redeemPoints || 0) > 0 ? `<div class="text-[10px] text-emerald-700 font-black mt-1">แลก ${formatMoney(item.redeemPoints)} แต้ม</div>` : ''}
              </div>
              <div class="flex gap-2 shrink-0">
                <button onclick="editItem('${item.id}')" class="px-3 py-2 rounded-xl bg-white border text-blue-600 text-xs font-black">แก้ไข</button>
                <button onclick="deleteItem('${item.id}')" class="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-black">ลบ</button>
              </div>
            </div>
            <div class="mt-3 text-[11px] text-gray-500 font-bold">${item.addons?.length ? `เสริม ${item.addons.map((addon) => `${addon.name}+${addon.price}`).join(', ')}` : 'ไม่มีรายการเสริม'}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderRedeemManagementList() {
    const configBox = qs('redeem-config-list');
    const eligibleCountEl = qs('redeem-eligible-count');
    const disabledCountEl = qs('redeem-disabled-count');
    if (!configBox) return;
    const eligibleItems = state.db.items
      .filter((item) => Number(item.redeemPoints || 0) > 0)
      .sort((a, b) => Number(a.redeemPoints || 0) - Number(b.redeemPoints || 0));
    const disabledItems = state.db.items
      .filter((item) => Number(item.redeemPoints || 0) <= 0)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    if (eligibleCountEl) eligibleCountEl.textContent = formatMoney(eligibleItems.length);
    if (disabledCountEl) disabledCountEl.textContent = formatMoney(disabledItems.length);

    const sortedItems = [...eligibleItems, ...disabledItems];
    configBox.innerHTML = sortedItems.length
      ? sortedItems.map((item) => {
        const checked = Number(item.redeemPoints || 0) > 0;
        return `
        <div class="border rounded-xl p-3 ${checked ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-200'}">
          <div class="flex items-center justify-between gap-2">
            <label class="inline-flex items-center gap-2 min-w-0 cursor-pointer">
              <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleRedeemEligibility('${escapeHtml(item.id)}', this.checked)" class="w-4 h-4 accent-emerald-600">
              <span class="font-black text-sm ${checked ? 'text-emerald-900' : 'text-gray-800'} truncate">${escapeHtml(item.name)}</span>
            </label>
            <div class="text-[10px] font-black ${checked ? 'text-emerald-700' : 'text-gray-500'}">${checked ? 'เปิดสิทธิ์แล้ว' : 'ยังไม่เปิดสิทธิ์'}</div>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <input
              id="redeem-point-input-${escapeHtml(item.id)}"
              type="number"
              min="1"
              value="${Math.max(1, Math.floor(Number(item.redeemPoints || 0) || 1))}"
              class="w-24 border rounded-lg px-2 py-1.5 text-sm font-black text-center ${checked ? 'bg-white' : 'bg-gray-100'}"
              ${checked ? '' : 'disabled'}
            />
            <span class="text-[10px] font-black text-gray-500">แต้ม/ชิ้น</span>
            <button onclick="saveRedeemEligibility('${escapeHtml(item.id)}')" class="ml-auto px-3 py-1.5 rounded-lg text-[10px] font-black ${checked ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}" ${checked ? '' : 'disabled'}>
              บันทึกแต้ม
            </button>
          </div>
        </div>`;
      }).join('')
      : '<div class="bg-gray-50 border rounded-xl p-3 text-xs font-bold text-gray-400 text-center">ยังไม่มีเมนูในระบบ</div>';
  }

  function applyItemRedeemPoints(itemId, redeemPoints) {
    if (!canManageOrders()) return showToast('ต้องเข้าโหมดแอดมินก่อน', 'error');
    const target = state.db.items.find((row) => String(row.id) === String(itemId));
    if (!target) return showToast('ไม่พบเมนู', 'error');
    target.redeemPoints = Math.max(0, Math.floor(Number(redeemPoints || 0)));
    logOperation('UPDATE_MENU_ITEM', { itemId: target.id, redeemPoints: target.redeemPoints });
    saveDb({ render: true, sync: true });
    return true;
  }

  function quickEnableRedeemItem(itemId) {
    const target = state.db.items.find((row) => String(row.id) === String(itemId));
    if (!target) return showToast('ไม่พบเมนู', 'error');
    if (!applyItemRedeemPoints(itemId, 10)) return;
    showToast(`เปิดสิทธิ์แลกแต้มให้ ${target.name} แล้ว`, 'success');
  }

  function quickEditRedeemItem(itemId) {
    const target = state.db.items.find((row) => String(row.id) === String(itemId));
    if (!target) return showToast('ไม่พบเมนู', 'error');
    const points = Math.max(1, Number(target.redeemPoints || 1));
    if (!points) return showToast('แต้มต้องมากกว่า 0 (หากต้องการปิดสิทธิ์ ให้กดปุ่มลบสิทธิ์)', 'error');
    if (!applyItemRedeemPoints(itemId, points)) return;
    showToast(`อัปเดตแต้มของ ${target.name} แล้ว`, 'success');
  }

  function quickDisableRedeemItem(itemId) {
    const target = state.db.items.find((row) => String(row.id) === String(itemId));
    if (!target) return showToast('ไม่พบเมนู', 'error');
    if (!applyItemRedeemPoints(itemId, 0)) return;
    showToast(`ลบสิทธิ์แลกแต้มของ ${target.name} แล้ว`, 'success');
  }

  function toggleRedeemEligibility(itemId, checked) {
    const input = qs(`redeem-point-input-${itemId}`);
    if (!checked) {
      if (!applyItemRedeemPoints(itemId, 0)) return;
      showToast('ปิดสิทธิ์แลกแต้มแล้ว', 'success');
      return;
    }
    const points = Math.max(1, Math.floor(Number(input?.value || 1)));
    if (!applyItemRedeemPoints(itemId, points)) return;
    showToast(`เปิดสิทธิ์แลกแต้ม ${formatMoney(points)} แต้ม/ชิ้น`, 'success');
  }

  function saveRedeemEligibility(itemId) {
    const input = qs(`redeem-point-input-${itemId}`);
    const points = Math.max(1, Math.floor(Number(input?.value || 0)));
    if (!points) return showToast('แต้มต้องมากกว่า 0', 'error');
    if (!applyItemRedeemPoints(itemId, points)) return;
    showToast(`บันทึกแต้ม ${formatMoney(points)} แต้ม/ชิ้นแล้ว`, 'success');
  }

  function openMenuModal(itemId = null) {
    state.tempAddons = [];
    state.tempImg = '';
    if (qs('form-menu-id')) qs('form-menu-id').value = '';
    if (qs('form-menu-name')) qs('form-menu-name').value = '';
    if (qs('form-menu-price')) qs('form-menu-price').value = '';
    if (qs('form-menu-redeem-points')) qs('form-menu-redeem-points').value = '0';
    if (qs('form-menu-preview')) {
      qs('form-menu-preview').classList.add('hidden');
      qs('form-menu-preview').src = '';
    }
    const title = document.querySelector('#modal-menu-form h3');
    if (title) title.textContent = itemId ? 'แก้ไขรายการเมนู' : 'เพิ่มรายการเมนู';

    if (itemId) {
      const item = state.db.items.find((row) => String(row.id) === String(itemId));
      if (!item) return;
      if (qs('form-menu-id')) qs('form-menu-id').value = String(item.id);
      if (qs('form-menu-name')) qs('form-menu-name').value = item.name;
      if (qs('form-menu-price')) qs('form-menu-price').value = String(item.price);
      if (qs('form-menu-redeem-points')) qs('form-menu-redeem-points').value = String(Math.max(0, Number(item.redeemPoints || 0)));
      state.tempAddons = clone(item.addons || []);
      state.tempImg = item.img || '';
      if (state.tempImg && qs('form-menu-preview')) {
        qs('form-menu-preview').src = state.tempImg;
        qs('form-menu-preview').classList.remove('hidden');
      }
    }
    renderAddonFields();
    openModal('modal-menu-form');
  }

  function editItem(itemId) {
    openMenuModal(itemId);
  }

  function addAddonField() {
    state.tempAddons.push({ name: '', price: 0 });
    renderAddonFields();
  }

  function removeAddonField(index) {
    state.tempAddons.splice(index, 1);
    renderAddonFields();
  }

  function updateAddonField(index, field, value) {
    if (!state.tempAddons[index]) return;
    state.tempAddons[index][field] = field === 'price' ? Number(value || 0) : value;
  }

  function renderAddonFields() {
    const box = qs('addon-fields-container');
    if (!box) return;
    if (!state.tempAddons.length) {
      box.innerHTML = '<div class="text-[11px] text-gray-400 font-bold">ยังไม่มี add-on</div>';
      return;
    }
    box.innerHTML = state.tempAddons.map((addon, index) => `
      <div class="grid grid-cols-[1fr,110px,44px] gap-2">
        <input value="${escapeHtml(addon.name)}" oninput="updateAddonField(${index}, 'name', this.value)" placeholder="ชื่อ add-on" class="border p-3 rounded-xl text-sm font-bold outline-none bg-white">
        <input value="${Number(addon.price || 0)}" oninput="updateAddonField(${index}, 'price', this.value)" type="number" placeholder="ราคา" class="border p-3 rounded-xl text-sm font-bold outline-none bg-white text-center">
        <button onclick="removeAddonField(${index})" class="bg-red-50 border border-red-100 rounded-xl text-red-500 font-black">×</button>
      </div>
    `).join('');
  }

  function saveMenuItem() {
    const id = qs('form-menu-id')?.value?.trim();
    const name = qs('form-menu-name')?.value?.trim();
    const price = Number(qs('form-menu-price')?.value || 0);
    const redeemPoints = Math.max(0, Number(qs('form-menu-redeem-points')?.value || 0));
    if (!name || price <= 0) return showToast('กรอกชื่อและราคาก่อน', 'error');
    const addons = state.tempAddons.filter((addon) => addon.name?.trim()).map((addon) => ({
      name: addon.name.trim(),
      price: Number(addon.price || 0)
    }));
    if (id) {
      const target = state.db.items.find((row) => String(row.id) === String(id));
      if (!target) return showToast('ไม่พบเมนูที่ต้องการแก้', 'error');
      const originalImage = target.img || '';
      target.name = name;
      target.price = price;
      target.redeemPoints = redeemPoints;
      target.addons = addons;
      if (state.tempImg) target.img = state.tempImg;
      target.hasImage = Boolean(target.img);
      if ((target.img || '') !== originalImage) target.imageVersion = Date.now();
      else target.imageVersion = Number(target.imageVersion || 0);
      logOperation('UPDATE_MENU_ITEM', { itemId: target.id });
    } else {
      const imageVersion = state.tempImg ? Date.now() : 0;
      state.db.items.push({
        id: `ITM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        price,
        redeemPoints,
        img: state.tempImg || '',
        hasImage: Boolean(state.tempImg),
        imageVersion,
        addons
      });
      logOperation('CREATE_MENU_ITEM', { name, price });
    }
    closeModal('modal-menu-form');
    saveDb({ render: true, sync: true });
    showToast('บันทึกเมนูแล้ว', 'success');
  }

  function deleteItem(itemId) {
    if (!confirm('ลบเมนูนี้ใช่ไหม?')) return;
    state.db.items = state.db.items.filter((row) => String(row.id) !== String(itemId));
    logOperation('DELETE_MENU_ITEM', { itemId });
    saveDb({ render: true, sync: true });
    showToast('ลบเมนูแล้ว', 'success');
  }

  function updateUnits() {
    const parsed = Number(qs('config-unit-count')?.value || state.db.unitCount || 4);
    const safeParsed = Number.isFinite(parsed) ? parsed : Number(state.db.unitCount || 4);
    const rawCount = Math.min(200, Math.max(1, Math.floor(safeParsed)));
    const count = rawCount;
    const type = qs('config-unit-type')?.value || 'โต๊ะ';
    forceRebuildUnits(count, type);
    saveDb({ render: true, sync: true });
    showToast('อัปเดตจำนวนโต๊ะ/คิวแล้ว', 'success');
  }

  function forceRebuildUnits(count, type) {
    const nextUnits = [];
    const nextCarts = {};
    for (let i = 1; i <= count; i += 1) {
      const existing = state.db.units.find((unit) => Number(unit.id) === i);
      nextUnits.push(normalizeUnit(existing, i));
      nextCarts[i] = Array.isArray(state.db.carts[i]) ? state.db.carts[i] : [];
    }
    state.db.unitType = type;
    state.db.unitCount = count;
    state.db.units = nextUnits;
    state.db.carts = nextCarts;
    const activeId = Number(state.activeUnitId || 0);
    if (!activeId || activeId > count) {
      state.activeUnitId = count > 0 ? 1 : null;
      if (state.activeTab === 'order') {
        switchTab('customer', qs('tab-customer'));
      }
    }
    logOperation('REBUILD_UNITS', { count, type });
  }
  //* menu close

  //* system open
  function loadSettingsToForm() {
    if (qs('sys-shop-name')) qs('sys-shop-name').value = state.db.shopName || '';
    if (qs('sys-theme')) qs('sys-theme').value = state.db.theme || '#800000';
    if (qs('sys-bg')) qs('sys-bg').value = state.db.bgColor || '#f8fafc';
    if (qs('sys-bank')) qs('sys-bank').value = state.db.bank || '';
    if (qs('sys-ppay')) qs('sys-ppay').value = state.db.ppay || '';
    if (qs('config-unit-type')) qs('config-unit-type').value = state.db.unitType || 'โต๊ะ';
    if (qs('config-unit-count')) qs('config-unit-count').value = String(state.db.unitCount || 4);
    if (qs('sys-promptpay-dynamic')) qs('sys-promptpay-dynamic').checked = isPromptPayDynamicEnabled();
    if (qs('system-logo-preview') && state.db.logo) qs('system-logo-preview').src = state.db.logo;
    updateRecoveryStateLabels();
    renderMemberAdminPanel();
  }

  function saveSystemSettings() {
    state.db.shopName = qs('sys-shop-name')?.value?.trim() || 'FAKDU';
    state.db.theme = qs('sys-theme')?.value || '#800000';
    state.db.bgColor = qs('sys-bg')?.value || '#f8fafc';
    state.db.bank = qs('sys-bank')?.value?.trim() || '';
    state.db.ppay = qs('sys-ppay')?.value?.trim() || '';
    if (!state.db.shopId) state.db.shopId = makeShopId();
    logOperation('SAVE_SYSTEM_SETTINGS', { shopName: state.db.shopName });
    applyTheme();
    saveDb({ render: true, sync: true });
    showToast('บันทึกการตั้งค่าแล้ว', 'success');
  }

  function getSortedMembers() {
    return Object.values(state.db.members || {}).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }

  function resetMemberForm() {
    if (qs('member-form-id')) qs('member-form-id').value = '';
    if (qs('member-form-name')) qs('member-form-name').value = '';
    if (qs('member-form-phone')) qs('member-form-phone').value = '';
    if (qs('member-form-points')) qs('member-form-points').value = '';
  }

  function editMemberFromSystem(memberId = '') {
    const member = getMemberById(memberId);
    if (!member) return;
    if (qs('member-form-id')) qs('member-form-id').value = member.id;
    if (qs('member-form-name')) qs('member-form-name').value = member.name || '';
    if (qs('member-form-phone')) qs('member-form-phone').value = member.phone || '';
    if (qs('member-form-points')) qs('member-form-points').value = String(Number(member.points || 0));
    qs('member-form-name')?.focus();
  }

  function deleteMemberFromSystem(memberId = '') {
    const member = getMemberById(memberId);
    if (!member) return;
    if (!confirm(`ลบสมาชิก ${member.name || member.phone || member.id} ?`)) return;
    delete state.db.members[member.id];
    logOperation('DELETE_MEMBER', { memberId: member.id });
    saveDb({ render: true, sync: true });
    resetMemberForm();
    showToast('ลบสมาชิกแล้ว', 'success');
  }

  function saveMemberFromSystem() {
    const editId = String(qs('member-form-id')?.value || '').trim();
    const phone = sanitizePhone(qs('member-form-phone')?.value || '');
    const name = String(qs('member-form-name')?.value || '').trim();
    const points = Math.max(0, Number(qs('member-form-points')?.value || 0));
    if (!name && !phone) return showToast('กรอกชื่อหรือเบอร์โทรอย่างน้อย 1 อย่าง', 'error');
    const duplicatePhone = phone
      ? getSortedMembers().find((member) => member.id !== editId && sanitizePhone(member.phone) === phone)
      : null;
    if (duplicatePhone) return showToast('เบอร์นี้มีในระบบแล้ว', 'error');
    const existing = editId ? getMemberById(editId) : null;
    const nowMs = Date.now();
    const next = normalizeMemberRecord({
      id: existing?.id || editId || '',
      phone,
      name: name || existing?.name || phone,
      points,
      firstSeenAt: existing?.firstSeenAt || nowMs,
      updatedAt: nowMs
    });
    state.db.members[next.id] = next;
    logOperation(existing ? 'UPDATE_MEMBER' : 'CREATE_MEMBER', { memberId: next.id });
    saveDb({ render: true, sync: true });
    resetMemberForm();
    showToast(existing ? 'อัปเดตสมาชิกแล้ว' : 'เพิ่มสมาชิกแล้ว', 'success');
  }

  function renderMemberAdminPanel() {
    const members = getSortedMembers();
    const count = members.length;
    const totalPoints = members.reduce((sum, member) => sum + Number(member.points || 0), 0);
    if (qs('member-total-count')) qs('member-total-count').textContent = formatMoney(count);
    if (qs('member-total-points')) qs('member-total-points').textContent = formatMoney(totalPoints);
    const list = qs('member-admin-list');
    if (!list) return;
    if (!members.length) {
      list.innerHTML = '<div class="bg-gray-50 border rounded-xl p-3 text-xs font-bold text-gray-400 text-center">ยังไม่มีสมาชิก</div>';
      return;
    }
    list.innerHTML = members.map((member) => `
      <div class="bg-gray-50 border rounded-xl p-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-black text-sm text-slate-800 truncate">${escapeHtml(member.name || '-')}</div>
          <div class="text-[10px] font-bold text-gray-500 truncate">${escapeHtml(member.phone || 'ไม่มีเบอร์โทร')}</div>
          <div class="text-[10px] font-black text-emerald-600 mt-1">แต้ม ${formatMoney(member.points || 0)}</div>
        </div>
        <div class="flex flex-col gap-1 shrink-0">
          <button onclick="editMemberFromSystem('${escapeHtml(member.id)}')" class="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-[10px] font-black">แก้ไข</button>
          <button onclick="deleteMemberFromSystem('${escapeHtml(member.id)}')" class="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-[10px] font-black">ลบ</button>
        </div>
      </div>
    `).join('');
  }

  async function handleImage(event, type) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    let result = '';
    try {
      const typeConfig = {
        logo: { maxWidth: 760, maxBytes: 260 * 1024 },
        qr: { maxWidth: 1100, maxBytes: 420 * 1024, outputType: 'image/png' },
        temp: { maxWidth: 960, maxBytes: 320 * 1024 }
      };
      result = await optimizeImageFile(file, typeConfig[type] || {});
    } catch (_) {
      result = await readFileAsDataURL(file);
    }

    if (type === 'logo') {
      state.db.logo = result;
      if (qs('system-logo-preview')) qs('system-logo-preview').src = result;
      if (qs('shop-logo')) qs('shop-logo').src = result;
      saveDb({ render: false, sync: true });
      return;
    }
    if (type === 'qr') {
      state.db.qrOffline = result;
      saveDb({ render: false, sync: true });
      showToast('อัปเดต QR Offline แล้ว', 'success');
      return;
    }
    if (type === 'temp') {
      state.tempImg = result;
      if (qs('form-menu-preview')) {
        qs('form-menu-preview').src = result;
        qs('form-menu-preview').classList.remove('hidden');
      }
    }
  }

  async function exportBackup() {
    const dbApi = resolveDbApi();
    const raw = dbApi.exportData ? await dbApi.exportData(state.db) : JSON.stringify(state.db, null, 2);
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FAKDU_Backup_${getLocalYYYYMMDD()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('สร้างไฟล์ Backup แล้ว', 'success');
  }

  async function importBackup(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!confirm('ข้อมูลในเครื่องจะถูกแทนที่ด้วยไฟล์ backup นี้ ยืนยันหรือไม่?')) return;
    const text = await file.text();
    try {
      const dbApi = resolveDbApi();
      const imported = dbApi.importData ? await dbApi.importData(text) : JSON.parse(text);
      state.db = normalizeDb(imported);
      await resolveDbApi().save(state.db);
      loadSettingsToForm();
      applyTheme();
      renderAll();
      applyStaffModeUi();
      showToast('กู้คืนข้อมูลสำเร็จ', 'success');
    } catch (error) {
      console.error(error);
      showToast('ไฟล์ Backup ไม่ถูกต้อง', 'error');
    }
  }

  function renderSystemPanels() {
    loadSettingsToForm();
    updateSyncUi();
    renderClientApprovalList();
    updateSyncCheckStatusUi();
    renderMemberAdminPanel();
  }
  //* system close

  //* recovery open
  function updateRecoveryStateLabels() {
    const hasRecoveryData = Boolean(
      state.db.recovery.phone
      && state.db.recovery.color
      && state.db.recovery.animal
    );
    if (qs('recovery-phone-state-2')) qs('recovery-phone-state-2').textContent = hasRecoveryData ? '' : 'ยังไม่ตั้งค่า';
    if (qs('recovery-color-state-2')) qs('recovery-color-state-2').textContent = hasRecoveryData ? '' : 'ยังไม่ตั้งค่า';
    if (qs('recovery-animal-state-2')) qs('recovery-animal-state-2').textContent = hasRecoveryData ? '' : 'ยังไม่ตั้งค่า';
  }

  function saveRecoveryData() {
    const phone = qs('setup-rec-phone')?.value?.trim() || '';
    const color = qs('setup-rec-color')?.value || '';
    const animal = qs('setup-rec-animal')?.value || '';
    if (!phone || !color || !animal) return showToast('กรอกข้อมูลช่วยจำให้ครบ', 'error');
    state.db.recovery = { phone, color, animal };
    logOperation('SAVE_RECOVERY');
    updateRecoveryStateLabels();
    closeModal('modal-recovery-setup');
    saveDb({ render: false, sync: false });
    if (qs('setup-rec-phone')) qs('setup-rec-phone').value = '';
    if (qs('setup-rec-color')) qs('setup-rec-color').selectedIndex = 0;
    if (qs('setup-rec-animal')) qs('setup-rec-animal').selectedIndex = 0;
    showToast('บันทึกข้อมูลช่วยจำแล้ว', 'success');
  }

  function executeRecovery() {
    const phone = qs('rec-ans-phone')?.value?.trim() || '';
    const color = qs('rec-ans-color')?.value || '';
    const animal = qs('rec-ans-animal')?.value || '';
    if (!phone || !color || !animal) return showToast('ตอบให้ครบก่อน', 'error');
    const ok = phone === state.db.recovery.phone && color === state.db.recovery.color && animal === state.db.recovery.animal;
    if (!ok) {
      state.db.fraudLogs.push({ type: 'RECOVERY_FAIL', at: Date.now() });
      saveDb({ render: false, sync: false });
      return showToast('ข้อมูลช่วยจำไม่ตรง', 'error');
    }
    closeModal('modal-recovery');
    if (qs('rec-ans-phone')) qs('rec-ans-phone').value = '';
    if (qs('rec-ans-color')) qs('rec-ans-color').selectedIndex = 0;
    if (qs('rec-ans-animal')) qs('rec-ans-animal').selectedIndex = 0;
    saveDb({ render: false, sync: false });
    showToast('รีเซ็ต PIN เป็น 1234 แล้ว', 'success');
  }
  //* recovery close

  //* pro/vault open
  async function syncProStatus() {
    state.isPro = true;
    state.db.licenseActive = true;
    syncCustomSearchUiMode();
  }

  async function validateProKey() {
    await syncProStatus();
    applyTheme();
    closeModal('modal-pro-unlock');
    saveDb({ render: true, sync: false });
    showToast('ระบบนี้เปิดใช้ฟรีทุกฟีเจอร์แล้ว', 'success');
  }

  function handleLockedFeatureClick() {
    showToast('ฟีเจอร์นี้เปิดใช้งานแล้ว', 'success');
  }

  function openProModal() {
    showToast('ระบบนี้เปิดใช้ฟรีทุกฟีเจอร์แล้ว', 'success');
  }

  function applyTrialUiGuards() {
    const unitInput = qs('config-unit-count');
    if (unitInput) unitInput.removeAttribute('max');
    const addMenuBtn = qs('btn-add-menu-item');
    if (addMenuBtn) addMenuBtn.disabled = false;
    const backupBtn = qs('btn-export-backup');
    if (backupBtn) backupBtn.disabled = false;
  }
  //* pro/vault close

  //* sync open
  async function dispatchIncomingSyncMessage(msg) {
    if (!msg?.type) return;
    if (msg.originDeviceId && msg.originDeviceId === state.hwid) return;
    const msgId = String(msg.id || '');
    if (msgId) {
      if (state.processedSyncMessages.has(msgId)) return;
      state.processedSyncMessages.add(msgId);
      if (state.processedSyncMessages.size > 400) {
        const oldest = state.processedSyncMessages.values().next().value;
        if (oldest) state.processedSyncMessages.delete(oldest);
      }
    }

    if (msg.type === 'CLIENT_HEARTBEAT') handleClientHeartbeat(msg.client);
    if (msg.type === 'CLIENT_ACTION') handleClientAction(msg.action);
    if (msg.type === 'CLIENT_SYNC_CHECK_ACK') handleClientSyncAck(msg.payload);
    if (msg.type === 'MASTER_SNAPSHOT') handleMasterSnapshot(msg.payload);
    if (msg.type === 'MASTER_APPROVAL') handleMasterApproval(msg.payload);
    if (msg.type === 'MASTER_ACTION_ACK') handleMasterActionAck(msg.payload);
    if (msg.type === 'MASTER_SYNC_ROTATED') handleMasterSyncRotated(msg.payload);
    if (msg.type === 'CLIENT_IMAGE_SYNC_REQUEST') handleClientImageSyncRequest(msg.payload);
    if (msg.type === 'MASTER_MENU_IMAGES') handleMasterMenuImages(msg.payload);
  }

  async function emitSyncMessage(msg = {}, { withFirebase = true } = {}) {
    const payload = {
      ...msg,
      id: msg.id || makeSyncMessageId(),
      originDeviceId: state.hwid,
      sentAt: Date.now()
    };
    try {
      state.syncChannel?.postMessage(payload);
    } catch (_) {}
    if (withFirebase) {
      const api = resolveFirebaseSyncApi();
      if (api && state.db.shopId) {
        try { await api.send(state.db.shopId, payload); } catch (_) {}
      }
    }
  }

  async function syncMasterMetaToFirebase() {
    if (IS_CLIENT_NODE || !state.db.shopId) return;
    const api = resolveFirebaseSyncApi();
    if (!api) return;
    const clientSessions = state.db.sync.clients.reduce((acc, client) => {
      if (!client?.approved || !client.clientId || !client.clientSessionToken) return acc;
      acc[client.clientId] = {
        clientSessionToken: client.clientSessionToken,
        sessionSyncVersion: Number(client.sessionSyncVersion || state.db.sync.syncVersion || 1),
        approvedAt: Number(client.lastSeen || Date.now())
      };
      return acc;
    }, {});
    const buildPayload = () => ({
      shopId: state.db.shopId,
      shopName: state.db.shopName || 'FAKDU',
      masterDeviceId: state.db.sync.masterDeviceId || state.hwid || '',
      currentSyncPin: state.db.sync.currentSyncPin || '',
      syncVersion: Number(state.db.sync.syncVersion || 1),
      approvedClients: state.db.sync.approvedClients || [],
      clientSessions
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await api.writeSyncMeta(state.db.shopId, buildPayload());
        return;
      } catch (error) {
        const isCollision = String(error?.code || error?.message || '') === 'PIN_COLLISION';
        if (!isCollision) return;
        state.db.sync.currentSyncPin = generateSyncPin(state.db.shopId, state.db.sync.syncVersion);
        state.db.sync.key = state.db.sync.currentSyncPin;
        updateSyncUi();
        if (attempt === 2) showToast('PIN ซ้ำหลายครั้ง กรุณาลองใหม่', 'error');
      }
    }
  }

  async function ensureCloudSnapshotAndOperations() {
    if (IS_CLIENT_NODE || !state.db.shopId) return;
    const api = resolveFirebaseSyncApi();
    if (!api) return;
    try {
      const existing = typeof api.readSnapshot === 'function'
        ? await api.readSnapshot(state.db.shopId)
        : null;
      if (!existing || typeof existing !== 'object') {
        await api.writeSnapshot(state.db.shopId, makeCloudSnapshotPayload());
      }
    } catch (_) {}
    try {
      await api.writeOperation(state.db.shopId, {
        type: 'SYNC_STRUCTURE_READY',
        shopId: state.db.shopId,
        deviceId: getCurrentDeviceId(),
        profileName: getCurrentProfileName(),
        role: getActorLabel()
      });
    } catch (_) {}
  }

  async function bindSyncChannel() {
    try {
      if (state.syncChannel) state.syncChannel.close();
      state.syncChannel = new BroadcastChannel(`FAKDU_SYNC_${state.db.shopId || 'DEFAULT'}`);
      state.syncChannel.onmessage = (event) => {
        dispatchIncomingSyncMessage(event.data || {});
      };
    } catch (error) {
      console.warn('BroadcastChannel unavailable', error);
    }

    if (state.stopFirebaseListener) {
      try { state.stopFirebaseListener(); } catch (_) {}
      state.stopFirebaseListener = null;
    }
    if (state.stopJoinRequestListener) {
      try { state.stopJoinRequestListener(); } catch (_) {}
      state.stopJoinRequestListener = null;
    }
    if (state.stopClientApproveListener) {
      try { state.stopClientApproveListener(); } catch (_) {}
      state.stopClientApproveListener = null;
    }
    if (state.stopOperationListener) {
      try { state.stopOperationListener(); } catch (_) {}
      state.stopOperationListener = null;
    }
    const api = resolveFirebaseSyncApi();
    if (api && state.db.shopId) {
      const minTs = Date.now() - 4000;
      try {
        state.stopFirebaseListener = api.listen(state.db.shopId, minTs, (msg) => dispatchIncomingSyncMessage(msg));
      } catch (_) {
        state.stopFirebaseListener = null;
      }
      if (!IS_CLIENT_NODE && typeof api.listenJoinRequests === 'function') {
        try {
          state.stopJoinRequestListener = api.listenJoinRequests(state.db.sync.currentSyncPin, (client) => handleClientAccessRequest(client));
        } catch (_) {
          state.stopJoinRequestListener = null;
        }
      }
      if (!IS_CLIENT_NODE && typeof api.listenOperations === 'function') {
        try {
          state.stopOperationListener = api.listenOperations(state.db.shopId, minTs, (action) => handleClientAction(action));
        } catch (_) {
          state.stopOperationListener = null;
        }
      }
      if (IS_CLIENT_NODE && typeof api.listenClientApprovalStatus === 'function') {
        const clientId = getClientProfile().clientId;
        if (clientId) {
          try {
            const pendingPin = String(localStorage.getItem('FAKDU_PENDING_CLIENT_PIN') || state.db.sync.currentSyncPin || '');
            const pendingRequestId = String(localStorage.getItem(LS_PENDING_PAIR_REQUEST_ID) || '');
            if (pendingPin && pendingPin.length === 6) {
              state.stopClientApproveListener = api.listenClientApprovalStatus(pendingPin, clientId, pendingRequestId, (payload) => {
                const isApproved = payload?.approved === true;
                const isRejected = payload?.approved === false && String(payload?.status || '').toLowerCase() === 'rejected';
                if (!isApproved && !isRejected) return;
                handleMasterApproval({
                  clientId,
                  approved: isApproved,
                  syncKey: payload?.pin || payload?.syncKey || pendingPin || state.db.sync.currentSyncPin,
                  shopId: payload?.shopId || state.db.shopId,
                  syncVersion: Number(payload?.sessionSyncVersion || payload?.syncVersion || state.db.sync.syncVersion || 1),
                  clientSessionToken: payload?.clientSessionToken || payload?.signed_token || '',
                  profileName: payload?.profileName || ''
                });
              });
            }
          } catch (_) {
            state.stopClientApproveListener = null;
          }
        }
      }
    }
    if (!IS_CLIENT_NODE) {
      await syncMasterMetaToFirebase();
      await ensureCloudSnapshotAndOperations();
    }
  }

  function broadcastSnapshot() {
    try {
      const payload = makeCloudSnapshotPayload();
      emitSyncMessage({
        type: 'MASTER_SNAPSHOT',
        payload
      });
      const api = resolveFirebaseSyncApi();
      if (api && state.db.shopId) api.writeSnapshot(state.db.shopId, payload).catch(() => {});
      localStorage.setItem(`${LS_SNAPSHOT_PREFIX}${state.db.shopId || 'DEFAULT'}`, JSON.stringify(payload));
    } catch (_) {}
  }

  function applyMasterSnapshot(payload) {
    if (!payload || !IS_CLIENT_NODE) return;
    if (!isClientSessionValid()) return;
 
    const session = getStoredClientSession();
    if (session && Number(payload.syncVersion || 0) > Number(session.syncVersion || 0)) {
      invalidateClientSession('เครื่องหลักเปลี่ยน PIN แล้ว กรุณาขออนุมัติใหม่');
      return;
    }
 

    if (payload.shopId && state.db.shopId && payload.shopId !== state.db.shopId) return;
    if (payload.shopId) state.db.shopId = payload.shopId;
    if (payload.masterDeviceId) state.db.sync.masterDeviceId = payload.masterDeviceId;
    state.db.shopName = payload.shopName || state.db.shopName;
    state.db.theme = payload.theme || state.db.theme;
    state.db.bgColor = payload.bgColor || state.db.bgColor;
    state.db.logo = payload.logo || state.db.logo;
    state.db.unitType = payload.unitType || state.db.unitType;
    if (payload.syncVersion) state.db.sync.syncVersion = Number(payload.syncVersion || state.db.sync.syncVersion || 1);
    if (payload.syncPin) {
      state.db.sync.currentSyncPin = payload.syncPin;
      state.db.sync.key = payload.syncPin;
    }
    if (Array.isArray(payload.approvedClients)) state.db.sync.approvedClients = payload.approvedClients;
    if (payload.syncSession && typeof payload.syncSession === 'object') {
      state.db.sync.syncVersion = Number(payload.syncSession.syncVersion || state.db.sync.syncVersion || 1);
      state.db.sync.currentSyncPin = payload.syncSession.currentSyncPin || state.db.sync.currentSyncPin;
      state.db.sync.key = state.db.sync.currentSyncPin;
      if (Array.isArray(payload.syncSession.approvedClients)) {
        state.db.sync.approvedClients = payload.syncSession.approvedClients;
      }
    }
    if (Array.isArray(payload.menuMetadata)) {
      const currentMap = new Map(state.db.items.map((item) => [item.id, item]));
      state.db.items = payload.menuMetadata.map((item) => {
        const existing = currentMap.get(item.id) || {};
        return {
          id: item.id,
          name: item.name,
          price: Number(item.price || 0),
          addons: Array.isArray(item.addons) ? item.addons : [],
          imageVersion: Number(item.imageVersion || 0),
          hasImage: Boolean(item.hasImage),
          img: existing.img || ''
        };
      });
      requestMissingMenuImages();
    } else if (Array.isArray(payload.items)) {
      state.db.items = payload.items;
    }
    if (Array.isArray(payload.units)) {
      state.db.units = payload.units.map((unit, index) => normalizeUnit(unit, index + 1));
      state.db.unitCount = state.db.units.length;
    }
    if (payload.carts && typeof payload.carts === 'object') state.db.carts = payload.carts;
    if (Array.isArray(payload.sales)) state.db.sales = payload.sales;
    if (payload.settings && typeof payload.settings === 'object') {
      state.db.bank = payload.settings.bank || state.db.bank;
      state.db.ppay = payload.settings.ppay || state.db.ppay;
      state.db.qrOffline = payload.settings.qrOffline || state.db.qrOffline;
      state.db.soundEnabled = Boolean(payload.settings.soundEnabled);
    }
    saveDb({ render: true, sync: false });
  }

  function handleMasterSnapshot(payload) {
    applyMasterSnapshot(payload);
  }

  async function pullSnapshotFromCloud(shopId = '') {
    if (!IS_CLIENT_NODE || !shopId) return false;
    const api = resolveFirebaseSyncApi();
    if (!api || typeof api.readSnapshot !== 'function') return false;
    try {
      const snapshot = await api.readSnapshot(shopId);
      if (!snapshot || typeof snapshot !== 'object') return false;
      applyMasterSnapshot(snapshot);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function handleMasterApproval(payload) {
    if (!IS_CLIENT_NODE || !payload?.clientId) return;
    console.log('[FAKDU][SYNC] client received approval update', payload);
    const clientId = localStorage.getItem('FAKDU_CLIENT_ID') || '';
    if (!clientId || payload.clientId !== clientId) return;
    if (payload.approved) {
      localStorage.setItem(LS_FORCE_CLIENT_MODE, 'true');
      localStorage.setItem('FAKDU_CLIENT_APPROVED', 'true');
      if (payload.syncKey) localStorage.setItem('FAKDU_PENDING_CLIENT_PIN', payload.syncKey);
      if (payload.shopId) localStorage.setItem('FAKDU_PENDING_MASTER_SHOP_ID', payload.shopId);
      const sessionPayload = {
        shopId: payload.shopId || state.db.shopId || '',
        clientId,
        profileName: payload.profileName || getClientProfile().profileName,
        clientSessionToken: payload.clientSessionToken || '',
        syncVersion: Number(payload.syncVersion || 1),
        accessMode: normalizeClientAccessMode(payload.accessMode || 'both')
      };
      await persistClientSession(sessionPayload);
      state.db.sync.clientSession = {
        shopId: sessionPayload.shopId || state.db.shopId || '',
        clientId,
        clientSessionToken: sessionPayload.clientSessionToken || '',
        syncVersion: Number(sessionPayload.syncVersion || 1),
        accessMode: normalizeClientAccessMode(sessionPayload.accessMode || 'both')
      };
      applyClientAccessModeUi();
      if (sessionPayload.shopId) {
        await pullSnapshotFromCloud(sessionPayload.shopId);
        await requestMissingMenuImages();
      }
      localStorage.setItem(LS_PENDING_SYNC_VERSION, String(Number(payload.syncVersion || 1)));
      await clearClientOpQueue();
      flushClientOpQueue();
      redirectToClientPage('เครื่องหลักอนุมัติแล้ว');
      return;
    }
    await invalidateClientSession('เครื่องหลักปฏิเสธคำขอ');
  }

  function startSyncPollingFallback() {
    clearInterval(state.syncPollTimer);
    state.syncPollTimer = setInterval(() => {
      if (!IS_CLIENT_NODE) return;
      const key = `${LS_SNAPSHOT_PREFIX}${state.db.shopId || localStorage.getItem('FAKDU_PENDING_MASTER_SHOP_ID') || 'DEFAULT'}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        applyMasterSnapshot(JSON.parse(raw));
      } catch (_) {}
    }, 1200);
  }

  function getStoredClientSession() {
    try {
      const raw = localStorage.getItem('FAKDU_CLIENT_SESSION');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function redirectToClientPage(reason = '') {
    if (/client\.html$/i.test(window.location.pathname || '')) return;
    console.log('[FAKDU][SYNC] redirect to client page', { reason, path: window.location.pathname });
    if (reason) showToast(reason, 'success');
    showToast('โหมดอุปกรณ์เสริมถูกปิดในรุ่น Offline-only', 'error');
  }

  async function persistClientSession(session = null) {
    if (session && typeof session === 'object') {
      localStorage.setItem('FAKDU_CLIENT_SESSION', JSON.stringify(session));
    } else {
      localStorage.removeItem('FAKDU_CLIENT_SESSION');
    }
    const dbApi = resolveDbApi();
    if (dbApi && typeof dbApi.saveClientSession === 'function') {
      try {
        await dbApi.saveClientSession(session && typeof session === 'object' ? session : null);
      } catch (_) {}
    }
    if (dbApi && typeof dbApi.saveClientShopId === 'function') {
      try {
        await dbApi.saveClientShopId(session?.shopId || '');
      } catch (_) {}
    }
  }

  async function hydrateClientSessionFromDb() {
    if (!IS_CLIENT_NODE) return;
    if (getStoredClientSession()?.clientSessionToken) return;
    const dbApi = resolveDbApi();
    if (!dbApi || typeof dbApi.loadClientSession !== 'function') return;
    try {
      const dbSession = await dbApi.loadClientSession();
      if (dbSession && dbSession.clientSessionToken) {
        localStorage.setItem('FAKDU_CLIENT_SESSION', JSON.stringify(dbSession));
      }
    } catch (_) {}
  }

  async function hydrateAppliedOperationsFromDb() {
    if (!IS_CLIENT_NODE) return;
    const dbApi = window.FakduDB;
    if (!dbApi || typeof dbApi.loadClientAppliedOperations !== 'function') return;
    try {
      const applied = await dbApi.loadClientAppliedOperations();
      if (Array.isArray(applied)) {
        applied.slice(-1000).forEach((opId) => {
          if (opId) state.processedOperationIds.add(String(opId));
        });
      }
    } catch (_) {}
  }

  function persistAppliedOperationsToDb() {
    if (!IS_CLIENT_NODE) return;
    const dbApi = window.FakduDB;
    if (!dbApi || typeof dbApi.saveClientAppliedOperations !== 'function') return;
    if (state.appliedOpsPersistTimer) clearTimeout(state.appliedOpsPersistTimer);
    state.appliedOpsPersistTimer = setTimeout(() => {
      const compact = Array.from(state.processedOperationIds).slice(-1000);
      dbApi.saveClientAppliedOperations(compact).catch(() => {});
    }, 250);
  }

  function isClientSessionValid() {
    const session = getStoredClientSession();
    if (!session) return false;
    if (!session.clientSessionToken || !session.clientId || !session.shopId) return false;
    session.accessMode = normalizeClientAccessMode(session.accessMode || 'both');
    return Number(session.syncVersion || 0) === Number(state.db.sync.syncVersion || session.syncVersion || 1);
  }

  async function verifyClientSessionAgainstCloud() {
    if (!IS_CLIENT_NODE) return true;
    const session = getStoredClientSession();
    if (!session?.clientSessionToken || !session?.shopId || !session?.clientId) return false;
    const api = resolveFirebaseSyncApi();
    if (!api || typeof api.readSyncMeta !== 'function') return true;
    try {
      const meta = await api.readSyncMeta(session.shopId);
      const cloudVersion = Number(meta?.syncVersion || 0);
      const cloudToken = String(meta?.clientSessions?.[session.clientId]?.clientSessionToken || '');
      const versionMismatch = cloudVersion > 0 && Number(session.syncVersion || 0) !== cloudVersion;
      const tokenMismatch = !!cloudToken && cloudToken !== String(session.clientSessionToken || '');
      if (versionMismatch || tokenMismatch) {
        await invalidateClientSession('PIN เปลี่ยนหรือ session หมดอายุ ต้องเชื่อมใหม่');
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  function getClientQueueStorageApi() {
    if (window.FakduDB && typeof window.FakduDB.loadClientQueue === 'function' && typeof window.FakduDB.saveClientQueue === 'function') {
      return window.FakduDB;
    }
    return null;
  }

  async function loadMenuImageCache() {
    const key = `${LS_MENU_IMAGE_CACHE_PREFIX}${state.db.shopId || 'DEFAULT'}`;
    const dbApi = resolveDbApi();
    if (dbApi && typeof dbApi.loadMenuImageCache === 'function') {
      try {
        return await dbApi.loadMenuImageCache(state.db.shopId || 'DEFAULT');
      } catch (_) {}
    }
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  async function saveMenuImageCache(cache = {}) {
    const safeCache = cache && typeof cache === 'object' ? cache : {};
    const key = `${LS_MENU_IMAGE_CACHE_PREFIX}${state.db.shopId || 'DEFAULT'}`;
    const dbApi = resolveDbApi();
    if (dbApi && typeof dbApi.saveMenuImageCache === 'function') {
      try {
        await dbApi.saveMenuImageCache(state.db.shopId || 'DEFAULT', safeCache);
      } catch (_) {}
    }
    localStorage.setItem(key, JSON.stringify(safeCache));
  }

  async function applyMenuImagesFromPayload(payload = {}) {
    if (!IS_CLIENT_NODE || !Array.isArray(payload.items)) return;
    const cache = await loadMenuImageCache();
    payload.items.forEach((item) => {
      if (!item?.id || !item?.img) return;
      cache[item.id] = {
        img: item.img,
        imageVersion: Number(item.imageVersion || Date.now())
      };
    });
    await saveMenuImageCache(cache);
    state.db.items = state.db.items.map((item) => {
      const fromCache = cache[item.id];
      if (!fromCache) return item;
      if (Number(fromCache.imageVersion || 0) < Number(item.imageVersion || 0)) return item;
      return {
        ...item,
        img: fromCache.img || '',
        imageVersion: Number(item.imageVersion || fromCache.imageVersion || 0),
        hasImage: Boolean(fromCache.img)
      };
    });
    saveDb({ render: true, sync: false });
  }

  async function requestMenuImagesFromMaster(itemIds = []) {
    if (!IS_CLIENT_NODE || !isClientSessionValid()) return;
    const session = getStoredClientSession();
    if (!session?.clientSessionToken) return;
    emitSyncMessage({
      type: 'CLIENT_IMAGE_SYNC_REQUEST',
      payload: {
        shopId: session.shopId,
        clientId: session.clientId,
        clientSessionToken: session.clientSessionToken,
        syncVersion: Number(session.syncVersion || 1),
        itemIds: Array.isArray(itemIds) ? itemIds : []
      }
    });
  }

  async function requestMissingMenuImages() {
    if (!IS_CLIENT_NODE || !isClientSessionValid()) return;
    const cache = await loadMenuImageCache();
    const missing = state.db.items
      .filter((item) => item.hasImage)
      .filter((item) => {
        const cached = cache[item.id];
        if (!cached?.img) return true;
        return Number(cached.imageVersion || 0) < Number(item.imageVersion || 0);
      })
      .map((item) => item.id);
    if (missing.length) requestMenuImagesFromMaster(missing);
  }

  async function loadClientOpQueue() {
    const dbApi = getClientQueueStorageApi();
    if (dbApi) {
      try { return await dbApi.loadClientQueue(); } catch (_) {}
    }
    try {
      const raw = localStorage.getItem(LS_CLIENT_OP_QUEUE);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  async function saveClientOpQueue(queue) {
    const safeQueue = Array.isArray(queue) ? queue : [];
    const dbApi = getClientQueueStorageApi();
    if (dbApi) {
      try {
        await dbApi.saveClientQueue(safeQueue);
        return;
      } catch (_) {}
    }
    localStorage.setItem(LS_CLIENT_OP_QUEUE, JSON.stringify(safeQueue));
  }

  async function enqueueClientOp(action) {
    const queue = await loadClientOpQueue();
    queue.push(action);
    await saveClientOpQueue(queue);
    return queue.length;
  }

  async function removeQueuedClientOp(opId = '') {
    if (!opId) return;
    const queue = await loadClientOpQueue();
    const next = queue.filter((row) => String(row?.opId || '') !== String(opId));
    await saveClientOpQueue(next);
  }

  async function clearClientOpQueue() {
    await saveClientOpQueue([]);
  }

  async function getClientQueueLength() {
    const queue = await loadClientOpQueue();
    return queue.length;
  }

  async function flushClientOpQueue() {
    if (!IS_CLIENT_NODE || !isClientSessionValid() || !navigator.onLine) return;
    const queue = await loadClientOpQueue();
    if (!queue.length) return;
    const api = resolveFirebaseSyncApi();
    for (const action of queue) {
      try {
        if (api && state.db.shopId) {
          await api.writeOperation(state.db.shopId, action);
        }
        emitSyncMessage({ type: 'CLIENT_ACTION', action });
      } catch (_) {
        break;
      }
    }
  }

  async function invalidateClientSession(reason = '') {
    localStorage.setItem('FAKDU_CLIENT_APPROVED', 'false');
    await persistClientSession(null);
    localStorage.removeItem('FAKDU_PENDING_CLIENT_PIN');
    localStorage.removeItem(LS_PENDING_PAIR_REQUEST_ID);
    localStorage.removeItem(LS_FORCE_CLIENT_MODE);
    await clearClientOpQueue();
    if (window.FakduDB && typeof window.FakduDB.clearClientAppliedOperations === 'function') {
      try { await window.FakduDB.clearClientAppliedOperations(); } catch (_) {}
    }
    state.db.sync.clientSession = null;
    saveDb({ render: true, sync: false });
    if (reason) showToast(reason, 'error');
  }

  function broadcastClientAccessRequest() {
    if (!IS_CLIENT_NODE) return;
    const pendingPin = localStorage.getItem('FAKDU_PENDING_CLIENT_PIN') || '';
    const pendingShopId = localStorage.getItem('FAKDU_PENDING_MASTER_SHOP_ID') || '';
    const pendingRequestId = localStorage.getItem(LS_PENDING_PAIR_REQUEST_ID) || '';
    if (!pendingPin || !pendingRequestId) return;
    const profile = getClientProfile();
    try {
      const api = resolveFirebaseSyncApi();
      if (api) {
        api.writeJoinRequest(pendingPin, {
          clientId: profile.clientId,
          profileName: profile.profileName,
          avatar: profile.avatar,
          pin: pendingPin,
          shopId: pendingShopId,
          syncVersion: getPendingSyncVersion(),
          requestId: pendingRequestId
        }).catch(() => {});
      }
    } catch (_) {}
  }

  async function broadcastClientHeartbeat() {
    if (!IS_CLIENT_NODE) return;
    const session = getStoredClientSession();
    if (!session?.clientSessionToken) return;
    const profile = getClientProfile();
    const pendingOps = await getClientQueueLength();
    try {
      emitSyncMessage({
        type: 'CLIENT_HEARTBEAT',
        client: {
          clientId: profile.clientId,
          profileName: profile.profileName,
          avatar: profile.avatar,
          clientSessionToken: session.clientSessionToken,
          pendingOps,
          syncVersion: Number(session.syncVersion || 1),
          lastSyncAt: Date.now()
        }
      });
    } catch (_) {}
  }

  function handleClientHeartbeat(client) {
    if (!client?.clientId || !client?.clientSessionToken) return;
    let target = state.db.sync.clients.find((row) => row.clientId === client.clientId);
    if (!target || !target.approved) return;
    if (target.clientSessionToken !== client.clientSessionToken) return;
    if (Number(target.sessionSyncVersion || 0) !== Number(state.db.sync.syncVersion || 1)) return;
    target.name = client.profileName || client.name || target.name;
    target.profileName = target.name;
    target.avatar = client.avatar || target.avatar;
    target.lastSeen = Date.now();
    target.lastSyncAt = client.lastSyncAt || target.lastSyncAt;
    target.pendingOps = Number(client.pendingOps || 0);
    renderOnlineClientsUi();
    renderClientApprovalList();
  }

  function handleClientAccessRequest(client) {
    const clientId = String(client?.clientId || client?.child_machine_id || '').trim();
    if (!clientId) return;

    const normalized = {
      clientId,
      profileName: client?.profileName || client?.child_name || client?.name || '',
      name: client?.profileName || client?.child_name || client?.name || '',
      avatar: client?.avatar || client?.child_avatar || '',
      pin: String(client?.pin || ''),
      requestId: String(client?.requestId || ''),
      shopId: String(client?.shopId || ''),
      syncVersion: Number(client?.syncVersion || state.db.sync.syncVersion || 1),
      requestedMode: normalizeClientAccessMode(client?.accessMode || client?.requestedMode || 'both'),
      status: String(client?.status || 'pending').toLowerCase(),
      requestedAt: Number(client?.created_at || client?.requestedAt || Date.now())
    };

    if (normalized.shopId && String(normalized.shopId) !== String(state.db.shopId || '')) return;
    if (normalized.status !== 'pending') return;

    const activePin = String(state.db.sync.currentSyncPin || '');
    if (normalized.pin && activePin && normalized.pin !== activePin) return;

    const activeVersion = Number(state.db.sync.syncVersion || 1);
    if (normalized.syncVersion !== activeVersion) return;


    const existing = state.db.sync.approvals.find((row) => row.clientId === clientId);
    const isNewRequest = !existing;

    console.log('[FAKDU][SYNC] master received pairing request', {
      clientId: normalized.clientId,
      profileName: normalized.profileName,
      pin: normalized.pin,
      shopId: normalized.shopId,
      syncVersion: normalized.syncVersion,
      requestId: normalized.requestId,
      isNewRequest
    });

    if (existing) {
      existing.requestedAt = Date.now();
      existing.profileName = normalized.profileName || existing.profileName || existing.name;
      existing.name = existing.profileName;
      existing.avatar = normalized.avatar || existing.avatar || '';
      existing.pin = normalized.pin || existing.pin || '';
      existing.requestId = normalized.requestId || existing.requestId || '';
      existing.syncVersion = normalized.syncVersion || existing.syncVersion || activeVersion;
      existing.requestedMode = normalizeClientAccessMode(normalized.requestedMode || existing.requestedMode || 'both');
      existing.status = 'pending';
    } else {
      state.db.sync.approvals.unshift({
        clientId: normalized.clientId,
        profileName: normalized.profileName || `Client ${state.db.sync.approvals.length + 1}`,
        name: normalized.profileName || `Client ${state.db.sync.approvals.length + 1}`,
        avatar: normalized.avatar || '',
        pin: normalized.pin || activePin,
        requestId: normalized.requestId || '',
        syncVersion: normalized.syncVersion || activeVersion,
        requestedMode: normalizeClientAccessMode(normalized.requestedMode || 'both'),
        requestedAt: normalized.requestedAt || Date.now(),
        status: 'pending'
      });
    }

    const api = resolveFirebaseSyncApi();
    if (api && state.db.shopId && typeof api.upsertClient === 'function') {
      api.upsertClient(state.db.shopId, {
        clientId: normalized.clientId,
        profileName: normalized.profileName || normalized.clientId,
        avatar: normalized.avatar || '',
        approved: false,
        status: 'pending',
        pin: normalized.pin || activePin,
        requestId: normalized.requestId || '',
        syncVersion: normalized.syncVersion || activeVersion,
        accessMode: normalizeClientAccessMode(normalized.requestedMode || 'both'),
        requestedAt: Date.now()
      }).catch(() => {});
    }

    renderClientApprovalList();
    updateApprovalInboxUi();
    renderIncomingClientRequestPopup();
    saveDb({ render: false, sync: false });

    if (!IS_CLIENT_NODE) openMasterApprovalModal();
    showToast('มีคำขออุปกรณ์เสริมใหม่', 'click');
  }

  function handleClientAction(action) {
    if (!action?.type) return;
    const opId = String(action.opId || action.id || '');
    if (opId) {
      if (state.processedOperationIds.has(opId)) return;
      state.processedOperationIds.add(opId);
      if (state.processedOperationIds.size > 600) {
        const oldest = state.processedOperationIds.values().next().value;
        if (oldest) state.processedOperationIds.delete(oldest);
      }
      persistAppliedOperationsToDb();
    }
    if (String(action.shopId || '') !== String(state.db.shopId || '')) return;
    const client = state.db.sync.clients.find((row) => row.clientId === action.clientId);
    if (!client || !client.approved) return;
    if (String(client.clientSessionToken || '') !== String(action.clientSessionToken || '')) return;
    if (Number(client.sessionSyncVersion || 0) !== Number(state.db.sync.syncVersion || 1)) return;
    if (action.type === 'REQUEST_CHECKOUT') {
      const unit = state.db.units.find((row) => row.id === Number(action.unitId));
      if (!unit) return;
      unit.checkoutRequested = true;
      unit.checkoutRequestedAt = Date.now();
      unit.lastActivityAt = Date.now();
      logOperation('CLIENT_REQUEST_CHECKOUT', action);
      saveDb({ render: true, sync: false });
      try {
        emitSyncMessage({
          type: 'MASTER_ACTION_ACK',
          payload: {
            clientId: action.clientId,
            clientSessionToken: action.clientSessionToken,
            opId: action.opId || '',
            syncVersion: Number(state.db.sync.syncVersion || 1)
          }
        });
      } catch (_) {}
      return;
    }
    if (action.type === 'APPEND_ORDER') {
      const unit = state.db.units.find((row) => row.id === Number(action.unitId));
      if (!unit || !Array.isArray(action.items) || !action.items.length) return;
      if (!unit.startTime) unit.startTime = Date.now();
      unit.status = 'active';
      unit.lastActivityAt = Date.now();
      action.items.forEach((row) => {
        unit.orders.push({
          id: row.id || `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          itemId: row.itemId || null,
          baseName: row.baseName || row.name,
          name: row.name,
          qty: Number(row.qty || 1),
          price: Number(row.price || 0),
          total: Number(row.total || 0),
          addons: Array.isArray(row.addons) ? row.addons : [],
          redeemedByPoints: Boolean(row.redeemedByPoints),
          redeemPoints: Math.max(0, Number(row.redeemPoints || 0)),
          source: 'client',
          orderBy: action.profileName || action.clientName || action.clientId || 'Client',
          createdAt: row.createdAt || Date.now()
        });
        unit.newItemsQty += Number(row.qty || 0);
      });
      logOperation('CLIENT_APPEND_ORDER', action);
      saveDb({ render: true, sync: false });
      try {
        emitSyncMessage({
          type: 'MASTER_ACTION_ACK',
          payload: {
            clientId: action.clientId,
            clientSessionToken: action.clientSessionToken,
            opId: action.opId || '',
            syncVersion: Number(state.db.sync.syncVersion || 1)
          }
        });
      } catch (_) {}
    }
  }

  function handleClientSyncAck(payload) {
    if (!payload?.clientId) return;
    const client = state.db.sync.clients.find((row) => row.clientId === payload.clientId);
    if (!client) return;
    client.lastSyncAt = Date.now();
    client.pendingOps = Number(payload.pendingOps || 0);
    renderOnlineClientsUi();
  }

  function handleMasterActionAck(payload) {
    if (!IS_CLIENT_NODE || !payload?.clientId || !payload?.opId) return;
    const session = getStoredClientSession();
    if (!session?.clientId || payload.clientId !== session.clientId) return;
    if (String(payload.clientSessionToken || '') !== String(session.clientSessionToken || '')) return;
    removeQueuedClientOp(payload.opId);
  }

  function handleMasterSyncRotated(payload) {
    if (!IS_CLIENT_NODE || !payload?.shopId) return;
    const session = getStoredClientSession();
    if (!session?.shopId || session.shopId !== payload.shopId) return;
    if (Number(session.syncVersion || 0) < Number(payload.syncVersion || 0)) {
      invalidateClientSession('รหัสเชื่อมต่อถูกเปลี่ยน กรุณาเชื่อมต่อใหม่');
    }
  }

  function handleClientImageSyncRequest(payload) {
    if (IS_CLIENT_NODE || !payload?.clientId || !payload?.clientSessionToken) return;
    const client = state.db.sync.clients.find((row) => row.clientId === payload.clientId);
    if (!client || !client.approved) return;
    if (String(client.clientSessionToken || '') !== String(payload.clientSessionToken || '')) return;
    if (Number(client.sessionSyncVersion || 0) !== Number(state.db.sync.syncVersion || 1)) return;
    const requestedIds = Array.isArray(payload.itemIds) ? new Set(payload.itemIds) : null;
    const items = state.db.items
      .filter((item) => item.img && (!requestedIds || requestedIds.has(item.id)))
      .map((item) => ({
        id: item.id,
        imageVersion: Number(item.imageVersion || 0),
        img: item.img
      }));
    emitSyncMessage({
      type: 'MASTER_MENU_IMAGES',
      payload: {
        shopId: state.db.shopId,
        syncVersion: Number(state.db.sync.syncVersion || 1),
        targetClientId: client.clientId,
        items
      }
    });
  }

  function handleMasterMenuImages(payload) {
    if (!IS_CLIENT_NODE || !payload?.shopId) return;
    const profile = getClientProfile();
    if (payload.targetClientId && payload.targetClientId !== profile.clientId) return;
    if (String(payload.shopId || '') !== String(state.db.shopId || '')) return;
    const session = getStoredClientSession();
    if (!session?.clientSessionToken) return;
    if (Number(payload.syncVersion || 0) !== Number(session.syncVersion || 0)) return;
    applyMenuImagesFromPayload(payload);
  }

  function renderClientApprovalList() {
    const box = qs('client-approval-list');
    const count = qs('client-approval-count');
    const modalCount = qs('client-approval-modal-count');
    const modalBox = qs('client-approval-modal-list');
    const total = state.db.sync.approvals.length;
    if (count) count.textContent = `${total} รายการ`;
    if (modalCount) modalCount.textContent = `${total} รายการ`;
    const emptyHtml = '<div class="bg-gray-50 rounded-2xl border p-4 text-[11px] text-gray-400 font-bold">ยังไม่มีคำขอเข้าอุปกรณ์เสริม</div>';
    const contentHtml = state.db.sync.approvals.map((item) => `
      <div class="bg-white rounded-2xl border p-4 shadow-sm flex items-center gap-3">
        <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
          ${item.avatar ? `<img src="${item.avatar}" class="w-full h-full object-cover">` : `<span class="font-black text-gray-600">${escapeHtml((item.name || 'C').slice(0, 1).toUpperCase())}</span>`}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-black text-gray-800 truncate">${escapeHtml(item.profileName || item.name || item.clientId)}</div>
          <div class="text-[10px] text-gray-400 font-bold">PIN ${escapeHtml(item.pin || '-')} • ${thaiDate(item.requestedAt)} • โหมดใช้งาน ลูกค้า + เช็คบิล</div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button onclick="approveClientWithMode('${item.clientId}', 'both')" class="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black">อนุมัติ (2 โหมด)</button>
          <button onclick="rejectClient('${item.clientId}')" class="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-black">ปฏิเสธ</button>
        </div>
      </div>
    `).join('');
    if (box) box.innerHTML = total ? contentHtml : emptyHtml;
    if (modalBox) modalBox.innerHTML = total ? contentHtml : emptyHtml;
    updateApprovalInboxUi();
    renderIncomingClientRequestPopup();
  }

  function renderIncomingClientRequestPopup() {
    const modal = qs('modal-client-request-popup');
    const nameEl = qs('client-request-popup-name');
    const metaEl = qs('client-request-popup-meta');
    const avatarEl = qs('client-request-popup-avatar');
    const totalEl = qs('client-request-popup-total');
    if (!modal || !nameEl || !metaEl || !avatarEl) return;

    const pending = Array.isArray(state.db.sync.approvals) ? state.db.sync.approvals : [];
    const total = pending.length;
    if (totalEl) totalEl.textContent = total > 1 ? `ยังเหลืออีก ${total - 1} คำขอ` : 'คำขอเดียวในคิว';
    if (!total) {
      closeModal('modal-client-request-popup');
      return;
    }
    const item = pending[0];
    const label = item.profileName || item.name || item.clientId || 'อุปกรณ์เสริม';
    nameEl.textContent = label;
    metaEl.textContent = `PIN ${item.pin || '-'} • ${thaiDate(item.requestedAt || Date.now())} • โหมดใช้งาน ลูกค้า + เช็คบิล`;
    avatarEl.innerHTML = item.avatar
      ? `<img src="${item.avatar}" class="w-full h-full object-cover">`
      : `<span class="font-black text-gray-600 text-xl">${escapeHtml((label || 'C').slice(0, 1).toUpperCase())}</span>`;
  }

  function approveNextClientRequest() {
    const item = Array.isArray(state.db.sync.approvals) ? state.db.sync.approvals[0] : null;
    if (!item?.clientId) return;
    approveClientWithMode(item.clientId, 'both');
  }

  function rejectNextClientRequest() {
    const item = Array.isArray(state.db.sync.approvals) ? state.db.sync.approvals[0] : null;
    if (!item?.clientId) return;
    rejectClient(item.clientId);
  }

  function updateApprovalInboxUi() {
    const badge = qs('client-approval-badge');
    if (!badge) return;
    const total = Number(state.db.sync.approvals.length || 0);
    badge.textContent = String(total > 99 ? '99+' : total);
    badge.classList.toggle('hidden', total <= 0);
  }

  function openMasterApprovalModal() {
    renderIncomingClientRequestPopup();
    try {
      console.log('[FAKDU][SYNC] master opening approval popup');
      openModal('modal-client-request-popup');
    } catch (error) {
      console.warn('[FAKDU][SYNC] failed to open approval popup, request remains in inbox', error);
    }
  }

  function openApprovalInbox() {
    renderClientApprovalList();
    openModal('modal-client-approvals');
  }

  function approveClient(clientId) {
    return approveClientWithMode(clientId, null);
  }

  function approveClientWithMode(clientId, forcedMode = null) {

    const approval = state.db.sync.approvals.find((row) => row.clientId === clientId);
    if (!approval) return;
    const approvedMode = normalizeClientAccessMode(forcedMode || approval.requestedMode || 'both', 'both');

    console.log('[FAKDU][SYNC] master approve request', { clientId, approvedMode, approval });

    if (Number(approval.syncVersion || 0) !== Number(state.db.sync.syncVersion || 1)) {
      state.db.sync.approvals = state.db.sync.approvals.filter((row) => row.clientId !== clientId);
      renderClientApprovalList();
      updateApprovalInboxUi();
      showToast('คำขอนี้หมดอายุแล้ว (syncVersion ไม่ตรง)', 'error');
      saveDb({ render: false, sync: false });
      return;
    }

    let client = state.db.sync.clients.find((row) => row.clientId === clientId);
    if (!client) {
      client = {
        clientId,
        profileName: approval.profileName || approval.name || clientId,
        name: approval.profileName || approval.name || clientId,
        avatar: approval.avatar || '',
        approved: true,
        clientSessionToken: issueClientSessionToken({
          shopId: state.db.shopId,
          clientId,
          syncVersion: state.db.sync.syncVersion
        }),
        sessionSyncVersion: Number(state.db.sync.syncVersion || 1),
        lastSeen: Date.now(),
        lastSyncAt: null,
        pendingOps: 0,
        accessMode: approvedMode
      };
      state.db.sync.clients.push(client);
    } else {
      client.approved = true;
      client.profileName = approval.profileName || approval.name || client.profileName || client.name || clientId;
      client.name = client.profileName;
      client.avatar = approval.avatar || client.avatar || '';
      client.clientSessionToken = issueClientSessionToken({
        shopId: state.db.shopId,
        clientId,
        syncVersion: state.db.sync.syncVersion
      });
      client.sessionSyncVersion = Number(state.db.sync.syncVersion || 1);
      client.lastSeen = Date.now();
      client.accessMode = approvedMode;
    }

    state.db.sync.approvedClients = state.db.sync.clients
      .filter((row) => row.approved)
      .map((row) => ({
        clientId: row.clientId,
        profileName: row.profileName || row.name || row.clientId,
        sessionSyncVersion: Number(row.sessionSyncVersion || state.db.sync.syncVersion || 1),
        accessMode: normalizeClientAccessMode(row.accessMode || 'both')
      }));

    const api = resolveFirebaseSyncApi();
    if (api) {
      if (typeof api.approveClient === 'function') {
        api.approveClient(state.db.sync.currentSyncPin, client.clientId, {
          requestId: approval.requestId || '',
          approvedAt: Date.now(),
          approvedBy: state.hwid || state.db.sync.masterDeviceId || 'MASTER',
          shopId: state.db.shopId,
          pin: state.db.sync.currentSyncPin,
          child_machine_id: client.clientId,
          profileName: client.profileName || client.name || client.clientId,
          clientSessionToken: client.clientSessionToken,
          signed_token: client.clientSessionToken,
          sessionSyncVersion: Number(client.sessionSyncVersion || state.db.sync.syncVersion || 1),
          accessMode: approvedMode
        }).catch(() => {});
      }
      if (state.db.shopId && typeof api.upsertClient === 'function') {
        api.upsertClient(state.db.shopId, {
          clientId: client.clientId,
          profileName: client.profileName || client.name || client.clientId,
          avatar: client.avatar || '',
          approved: true,
          status: 'approved',
          pin: state.db.sync.currentSyncPin,
          requestId: approval.requestId || '',
          clientSessionToken: client.clientSessionToken,
          sessionSyncVersion: Number(client.sessionSyncVersion || state.db.sync.syncVersion || 1),
          accessMode: approvedMode,
          approvedAt: Date.now(),
          approvedBy: state.hwid || state.db.sync.masterDeviceId || 'MASTER'
        }).catch(() => {});
      }
    }

    state.db.sync.approvals = state.db.sync.approvals.filter((row) => row.clientId !== clientId);
    logOperation('APPROVE_CLIENT', { clientId, requestId: approval.requestId || '' });

    renderClientApprovalList();
    updateApprovalInboxUi();
    if (!state.db.sync.approvals.length) closeModal('modal-client-approvals');
    if (!state.db.sync.approvals.length) closeModal('modal-client-request-popup');

    renderOnlineClientsUi();
    saveDb({ render: false, sync: true });
    showToast('อนุมัติอุปกรณ์เสริมแล้ว (ใช้งานได้ 2 โหมด: ลูกค้า + เช็คบิล)', 'success');
  }

  function rejectClient(clientId) {
    console.log('[FAKDU][SYNC] master reject request', { clientId });
    const approval = state.db.sync.approvals.find((row) => row.clientId === clientId);
    if (!approval) return;

    state.db.sync.approvals = state.db.sync.approvals.filter((row) => row.clientId !== clientId);
    logOperation('REJECT_CLIENT', { clientId, requestId: approval.requestId || '' });

    const api = resolveFirebaseSyncApi();
    if (api) {
      if (typeof api.rejectClient === 'function') {
        api.rejectClient(state.db.sync.currentSyncPin, clientId, {
          requestId: String(approval?.requestId || ''),
          rejectedAt: Date.now(),
          rejectedBy: state.hwid || state.db.sync.masterDeviceId || 'MASTER',
          shopId: state.db.shopId,
          pin: state.db.sync.currentSyncPin,
          child_machine_id: clientId
        }).catch(() => {});
      }
      if (state.db.shopId && typeof api.upsertClient === 'function') {
        api.upsertClient(state.db.shopId, {
          clientId,
          approved: false,
          status: 'rejected',
          pin: state.db.sync.currentSyncPin,
          requestId: String(approval?.requestId || ''),
          rejectedAt: Date.now(),
          rejectedBy: state.hwid || state.db.sync.masterDeviceId || 'MASTER'
        }).catch(() => {});
      }
    }

    renderClientApprovalList();
    updateApprovalInboxUi();
    if (!state.db.sync.approvals.length) closeModal('modal-client-approvals');
    if (!state.db.sync.approvals.length) closeModal('modal-client-request-popup');

    saveDb({ render: false, sync: false });
    syncMasterMetaToFirebase();
    showToast('ปฏิเสธคำขอแล้ว', 'click');
  }

  function updateSyncUi() {
    const qrArea = qs('sync-qr-area');
    if (qrArea) {
      qrArea.innerHTML = '';
      const employeeUrl = buildEmployeeLinkUrl();
      if (typeof QRCode === 'function') {
        new QRCode(qrArea, {
          text: employeeUrl,
          width: 110,
          height: 110
        });
      } else {
        qrArea.innerHTML = `
          <div class="text-center px-2">
            <div class="text-[9px] text-gray-500 font-black mb-1">สร้าง QR ไม่สำเร็จ</div>
            <a href="${escapeHtml(employeeUrl)}" class="text-[9px] font-black text-blue-600 underline break-all">เปิดลิงก์แทน</a>
          </div>
        `;
      }
    }
    renderOnlineClientsUi();
  }

  function setSyncButtonState(mode) {
    const btn = qs('btn-manual-sync');
    if (!btn) return;
    btn.classList.remove('animate-pulse', 'bg-white', 'text-blue-600', 'bg-green-500', 'bg-red-500', 'text-white', 'bg-amber-400', 'text-amber-900');
    if (mode === 'loading') {
      btn.classList.add('animate-pulse', 'bg-amber-400', 'text-amber-900');
      return;
    }
    if (mode === 'success') {
      btn.classList.add('bg-green-500', 'text-white');
      return;
    }
    if (mode === 'error') {
      btn.classList.add('bg-red-500', 'text-white');
      return;
    }
    btn.classList.add('bg-white', 'text-blue-600');
  }

  function updateSyncCheckStatusUi() {
    const text = qs('sync-check-status-text');
    const hint = qs('sync-check-status-hint');
    if (text) text.textContent = state.db.sync.lastCheck.text || 'ยังไม่ได้ตรวจ';
    if (hint) hint.textContent = state.db.sync.lastCheck.hint || '';
  }

  function triggerSyncCheck() {
    console.log('[FAKDU][SYNC] triggerSyncCheck invoked (post-pair verification flow only)');
    const onlineClients = state.db.sync.clients.filter((client) => client.approved && getClientStatus(client) === 'online');
    setSyncButtonState('loading');
    state.db.sync.lastCheck = {
      status: 'loading',
      text: 'กำลังตรวจความตรงกัน...',
      hint: 'กำลังเช็คสถานะอุปกรณ์เสริมและรายการค้างส่ง',
      at: Date.now()
    };
    updateSyncCheckStatusUi();

    clearTimeout(state.syncButtonResetTimer);
    setTimeout(() => {
      if (!onlineClients.length) {
        state.db.sync.lastCheck = {
          status: 'error',
          text: 'ยังยืนยัน Sync จริงไม่ได้',
          hint: 'ยังไม่มีอุปกรณ์เสริมออนไลน์ ให้เชื่อมต่ออุปกรณ์เสริมก่อนแล้วค่อยเช็คอีกครั้ง',
          at: Date.now()
        };
        setSyncButtonState('error');
        updateSyncCheckStatusUi();
        state.syncButtonResetTimer = setTimeout(() => setSyncButtonState('idle'), 10000);
        saveDb({ render: false, sync: false });
        return;
      }
      const hasPendingCart = Object.values(state.db.carts).some((cart) => Array.isArray(cart) && cart.length > 0);
      const hasRed = onlineClients.some((client) => Number(client.pendingOps || 0) > 0);
      const ok = !hasRed && !hasPendingCart;
      if (ok) {
        state.db.sync.lastCheck = {
          status: 'success',
          text: 'ข้อมูลตรงกันแล้ว',
          hint: `ตรวจแล้ว ${onlineClients.length} เครื่อง`,
          at: Date.now()
        };
        setSyncButtonState('success');
      } else {
        state.db.sync.lastCheck = {
          status: 'error',
          text: 'พบข้อมูลยังไม่ตรงกัน',
          hint: 'ให้ร้านตรวจสอบอุปกรณ์เสริมหรือรายการที่ยังค้างด้วยตนเอง',
          at: Date.now()
        };
        setSyncButtonState('error');
      }
      updateSyncCheckStatusUi();
      state.syncButtonResetTimer = setTimeout(() => setSyncButtonState('idle'), 10000);
      saveDb({ render: false, sync: false });
    }, 1300);
  }

  function requestNewSyncKey() {
    if (state.activeTab !== 'system') {
      showToast('รีเซ็ต PIN ได้เฉพาะหน้าโหมดระบบ', 'error');
      return;
    }
    openModal('modal-sync-key-confirm');
  }

  async function confirmNewSyncKey() {
    if (state.activeTab !== 'system') {
      closeModal('modal-sync-key-confirm');
      showToast('รีเซ็ต PIN ได้เฉพาะหน้าโหมดระบบ', 'error');
      return;
    }
    const today = getLocalYYYYMMDD();
    const sameDay = String(state.db.sync.keyResetDate || '') === String(today);
    const usedToday = sameDay ? Number(state.db.sync.keyResetCount || 0) : 0;
    if (usedToday >= 3) {
      closeModal('modal-sync-key-confirm');
      showToast('ครบ 3 ครั้งแล้ว', 'error');
      return;
    }
    closeModal('modal-sync-key-confirm');
    state.db.sync.keyResetDate = today;
    state.db.sync.keyResetCount = usedToday + 1;
    state.db.sync.syncVersion = Number(state.db.sync.syncVersion || 1) + 1;
    state.db.sync.currentSyncPin = generateSyncPin(state.db.shopId, state.db.sync.syncVersion);
    state.db.sync.key = state.db.sync.currentSyncPin;
    state.db.sync.approvals = [];
    state.db.sync.clients = state.db.sync.clients.map((client) => ({
      ...client,
      approved: false,
      clientSessionToken: '',
      sessionSyncVersion: Number(state.db.sync.syncVersion || 1)
    }));
    state.db.sync.approvedClients = [];
    localStorage.removeItem('FAKDU_CLIENT_SESSION');
    logOperation('RESET_SYNC_KEY', { syncVersion: state.db.sync.syncVersion });
    const api = resolveFirebaseSyncApi();
    if (api && state.db.shopId) api.clearClientSessions(state.db.shopId).catch(() => {});
    try {
      emitSyncMessage({
        type: 'MASTER_SYNC_ROTATED',
        payload: {
          shopId: state.db.shopId,
          syncVersion: Number(state.db.sync.syncVersion || 1)
        }
      });
    } catch (_) {}
    updateSyncUi();
    saveDb({ render: false, sync: true });
    await syncMasterMetaToFirebase();
    await bindSyncChannel();
    showToast('สร้างรหัสใหม่แล้ว', 'success');
  }
  //* sync close

  //* scanner open
  async function openClientScanner() {
    console.log('[FAKDU][SYNC] openClientScanner');
    openModal('modal-client-scanner');
    try {
      if (state.qrScanner) await closeClientScanner(true);
      const onDecoded = (decodedText) => {
        console.log('[FAKDU][SYNC] QR scan success raw payload', decodedText);
        let parsedPin = '';
        try {
          const data = JSON.parse(decodedText);
          parsedPin = normalizeSyncPin(data.pin || '');
          const parsedMode = normalizeClientAccessMode(data.accessMode || data.mode || 'both');
          if (parsedPin && qs('manual-pin')) qs('manual-pin').value = parsedPin;
          if (parsedPin && qs('manual-pin-visible')) qs('manual-pin-visible').value = parsedPin;
          if (qs('client-access-mode')) qs('client-access-mode').value = parsedMode;
        } catch (_) {
          parsedPin = normalizeSyncPin(decodedText);
          if (parsedPin && qs('manual-pin')) qs('manual-pin').value = parsedPin;
          if (parsedPin && qs('manual-pin-visible')) qs('manual-pin-visible').value = parsedPin;
        }
        closeClientScanner();
        showToast('สแกนสำเร็จ กำลังส่งคำขอ...', 'success');
        if (!parsedPin || parsedPin.length !== 6) {
          showToast('QR ไม่มี PIN ที่ถูกต้อง', 'error');
          return;
        }
        submitClientAccessRequest();
      };

      if (window.Html5Qrcode) {
        state.qrScanner = new Html5Qrcode('qr-reader-index');
        const cameras = await Html5Qrcode.getCameras().catch(() => []);
        const preferredCamera = cameras.find((cam) => /back|rear|environment/i.test(cam.label || ''))?.id || cameras[0]?.id || { facingMode: 'environment' };
        await state.qrScanner.start(
          preferredCamera,
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
          onDecoded
        );
        return;
      }

      if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
        showToast('อุปกรณ์นี้ยังใช้สแกน QR ไม่ได้', 'error');
        return;
      }
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const holder = qs('qr-reader-index');
      if (!holder) throw new Error('QR holder not found');
      holder.innerHTML = '';
      const video = document.createElement('video');
      video.setAttribute('playsinline', 'true');
      video.autoplay = true;
      video.muted = true;
      video.className = 'w-full rounded-xl border';
      holder.appendChild(video);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      let stopped = false;
      let rafId = 0;
      const scanLoop = async () => {
        if (stopped) return;
        try {
          const result = await detector.detect(video);
          const value = String(result?.[0]?.rawValue || '');
          if (value) {
            stopped = true;
            onDecoded(value);
            return;
          }
        } catch (_) {}
        rafId = requestAnimationFrame(scanLoop);
      };
      rafId = requestAnimationFrame(scanLoop);
      state.qrScanner = {
        isScanning: true,
        async stop() {
          if (stopped) return;
          stopped = true;
          if (rafId) cancelAnimationFrame(rafId);
          stream.getTracks().forEach((track) => track.stop());
          try { video.pause(); } catch (_) {}
        },
        async clear() {
          holder.innerHTML = '';
        }
      };
    } catch (error) {
      console.error(error);
      showToast('เปิดกล้องไม่ได้', 'error');
    }
  }

  async function closeClientScanner(keepModal = false) {
    try {
      if (state.qrScanner) {
        if (state.qrScanner.isScanning) await state.qrScanner.stop().catch(() => {});
        await state.qrScanner.clear().catch(() => {});
      }
    } finally {
      state.qrScanner = null;
      if (!keepModal) closeModal('modal-client-scanner');
    }
  }

  async function submitClientAccessRequest() {
    const rawPin = qs('manual-pin')?.value?.trim() || readSyncPinFromUrl();
    const pin = normalizeSyncPin(rawPin);
    const accessMode = getSelectedClientAccessMode();
    localStorage.setItem('FAKDU_CLIENT_ACCESS_MODE', accessMode);
    console.log('[FAKDU][SYNC] submitClientAccessRequest start', {
      rawPin,
      normalizedPin: pin,
      accessMode
    });
    if (pin.length !== 6) return showToast('PIN ต้องเป็นตัวเลข 6 หลัก', 'error');
    if (qs('manual-pin')) qs('manual-pin').value = pin;

    const api = resolveFirebaseSyncApi();
    if (!api) return showToast('รุ่นนี้ปิดการเชื่อมต่อออนไลน์', 'error');
    const profile = getClientProfile();
    let resolvedShopId = '';
    let serverVersion = 0;
    let allowDirectPairRequest = false;
    const requestId = `${profile.clientId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const pinMeta = typeof api.readSyncPin === 'function' ? await api.readSyncPin(pin) : null;
      if (!pinMeta || !pinMeta.pin) {
        allowDirectPairRequest = true;
        resolvedShopId = String(localStorage.getItem('FAKDU_PENDING_MASTER_SHOP_ID') || '');
        serverVersion = Number(localStorage.getItem(LS_PENDING_SYNC_VERSION) || state.db.sync.syncVersion || 1);
      } else {
        resolvedShopId = String(pinMeta.shopId || localStorage.getItem('FAKDU_PENDING_MASTER_SHOP_ID') || '');
        serverVersion = Number(pinMeta.syncVersion || localStorage.getItem(LS_PENDING_SYNC_VERSION) || 0);
        if (serverVersion <= 0) serverVersion = Number(state.db.sync.syncVersion || 1);
        localStorage.setItem('FAKDU_PENDING_MASTER_SHOP_ID', resolvedShopId);
        localStorage.setItem(LS_PENDING_SYNC_VERSION, String(serverVersion));
      }
      const sendJoinRequest = typeof api.sendJoinRequest === 'function'
        ? api.sendJoinRequest.bind(api)
        : api.writeJoinRequest.bind(api);
      await sendJoinRequest(pin, {
        requestId,
        clientId: profile.clientId,
        child_machine_id: profile.clientId,
        child_name: profile.profileName,
        child_avatar: profile.avatar,
        profileName: profile.profileName,
        avatar: profile.avatar,
        pin,
        accessMode,
        shopId: resolvedShopId,
        syncVersion: serverVersion
      });
      console.log('[FAKDU][SYNC] pairing request created', {
        shopId: resolvedShopId || '(pending)',
        clientId: profile.clientId,
        syncVersion: serverVersion || getPendingSyncVersion()
      });
    } catch (error) {
      console.warn('PIN verification failed', error);
      showToast('รุ่นนี้ปิดการตรวจสอบออนไลน์', 'error');
      return;
    }
    if (allowDirectPairRequest) {
      showToast('รุ่นนี้ปิด flow การจับคู่อุปกรณ์', 'error');
    }
    localStorage.setItem('FAKDU_PENDING_CLIENT_PIN', pin);
    localStorage.setItem('FAKDU_PENDING_MASTER_SHOP_ID', resolvedShopId);
    localStorage.setItem(LS_PENDING_PAIR_REQUEST_ID, requestId);
    showToast('ส่งคำขอแล้ว รอเครื่องหลักอนุมัติ', 'click');
    try {
      const approvedPayload = await new Promise((resolve, reject) => {
        let timeoutId = null;
        const listenApprovalStatus = typeof api.listenClientApprovalStatus === 'function'
          ? api.listenClientApprovalStatus.bind(api)
          : api.listenClient.bind(api);
        const stop = listenApprovalStatus(pin, profile.clientId, requestId, (payload) => {
          console.log('[FAKDU][SYNC] client approval listener update', payload);
          if (!payload) return;
          if (payload.approved === false || payload.status === 'rejected') return reject(new Error('rejected'));
          if (!payload.approved) return;
          const approvedVersion = Number(payload.sessionSyncVersion || payload.syncVersion || 0);
          if (serverVersion > 0 && approvedVersion > 0 && approvedVersion !== serverVersion) return;
          if (!payload.clientSessionToken && !payload.signed_token) return;
          clearTimeout(timeoutId);
          try { stop(); } catch (_) {}
          resolve(payload);
        });
        timeoutId = setTimeout(() => {
          try { stop(); } catch (_) {}
          reject(new Error('timeout'));
        }, 120000);
      });
      const sessionPayload = {
        shopId: resolvedShopId || String(approvedPayload.shopId || ''),
        clientId: profile.clientId,
        profileName: profile.profileName,
        clientSessionToken: approvedPayload.clientSessionToken || approvedPayload.signed_token || '',
        syncVersion: Number(approvedPayload.sessionSyncVersion || approvedPayload.syncVersion || serverVersion || 1)
      };
      await persistClientSession(sessionPayload);
      localStorage.setItem('FAKDU_CLIENT_APPROVED', 'true');
      localStorage.setItem(LS_FORCE_CLIENT_MODE, 'true');
      localStorage.removeItem(LS_PENDING_PAIR_REQUEST_ID);
      redirectToClientPage();
    } catch (error) {
      if (error?.message === 'rejected') {
        showToast('เครื่องหลักปฏิเสธคำขอ', 'error');
      } else {
        showToast('ยังไม่อนุมัติ (หมดเวลารอ)', 'error');
      }
    }
  }
  //* scanner close

  //* client profile open
  async function handleClientImage(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (file.size > (8 * 1024 * 1024)) {
      showToast('รูปใหญ่เกินไป (ไม่เกิน 8MB)', 'error');
      return;
    }
    let data = '';
    try {
      data = await optimizeImageFile(file, {
        maxWidth: 420,
        maxBytes: CLIENT_AVATAR_MAX_BYTES,
        outputType: 'image/jpeg'
      });
    } catch (_) {
      data = await readFileAsDataURL(file);
    }
    localStorage.setItem('FAKDU_CLIENT_AVATAR', data);
    if (qs('client-avatar')) qs('client-avatar').src = data;
    if (isClientSessionValid()) broadcastClientHeartbeat();
    else broadcastClientAccessRequest();
    showToast('อัปเดตรูปอุปกรณ์เสริมแล้ว', 'success');
  }

  function saveClientSettings() {
    const name = (qs('sys-client-name')?.value || '').trim();
    if (!name) return showToast('กรอกชื่อโปรไฟล์ก่อน', 'error');
    localStorage.setItem('FAKDU_CLIENT_PROFILE_NAME', name);
    if (qs('client-device-name')) qs('client-device-name').textContent = name;
    if (isClientSessionValid()) broadcastClientHeartbeat();
    else broadcastClientAccessRequest();
    showToast('บันทึกโปรไฟล์แล้ว', 'success');
  }

  async function clientLogout() {
    await persistClientSession(null);
    localStorage.removeItem('FAKDU_CLIENT_APPROVED');
    localStorage.removeItem('FAKDU_PENDING_CLIENT_PIN');
    localStorage.removeItem('FAKDU_PENDING_MASTER_SHOP_ID');
    localStorage.removeItem(LS_PENDING_SYNC_VERSION);
    localStorage.removeItem(LS_FORCE_CLIENT_MODE);
    localStorage.removeItem(LS_PENDING_PAIR_REQUEST_ID);
    await clearClientOpQueue();
    if (window.FakduDB && typeof window.FakduDB.clearClientAppliedOperations === 'function') {
      try { await window.FakduDB.clearClientAppliedOperations(); } catch (_) {}
    }
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('fakdu-')).map((key) => caches.delete(key)));
      }
    } catch (_) {}
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
    } catch (_) {}
    window.location.href = 'index.html';
  }
  //* client profile close

  //* install open
  function isInstalledAppContext() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.startsWith('android-app://');
    } catch (_) {
      return false;
    }
  }

  function isInstallBannerDismissed() {
    return localStorage.getItem(LS_INSTALL_BANNER_DISMISSED) === 'true';
  }

  function syncInstallBannerVisibility() {
    const banner = qs('pwa-install-banner');
    if (!banner) return;

    const shouldShow = Boolean(state.deferredInstallPrompt) &&
      !isInstallBannerDismissed() &&
      !isInstalledAppContext();

    banner.classList.toggle('hidden', !shouldShow);
  }

  function dismissPWAInstallBanner() {
    localStorage.setItem(LS_INSTALL_BANNER_DISMISSED, 'true');
    syncInstallBannerVisibility();
  }

  function installPWA() {
    if (!state.deferredInstallPrompt) {
      showToast('ยังติดตั้งไม่ได้ในตอนนี้', 'error');
      return;
    }
    localStorage.removeItem(LS_INSTALL_BANNER_DISMISSED);
    state.deferredInstallPrompt.prompt();
    state.deferredInstallPrompt.userChoice.finally(() => {
      state.deferredInstallPrompt = null;
      syncInstallBannerVisibility();
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    syncInstallBannerVisibility();
  });

  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    localStorage.removeItem(LS_DEFERRED_INSTALL);
    localStorage.removeItem(LS_INSTALL_BANNER_DISMISSED);
    syncInstallBannerVisibility();
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', syncInstallBannerVisibility);
  //* install close

  async function fallbackCopyText(text = '') {
    const input = document.createElement('textarea');
    input.value = String(text || '');
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);
    input.focus();
    input.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(input);
    return ok;
  }

  async function copyTextTwoLayer(text = '') {
    const safeText = String(text || '').trim();
    if (!safeText) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(safeText);
        return true;
      } catch (_) {}
    }
    try {
      return await fallbackCopyText(safeText);
    } catch (_) {
      return false;
    }
  }

  async function copyUnlockShopId() {
    const shopId = String(state.db.shopId || '').trim();
    if (!shopId) return showToast('ไม่พบ SHOP ID', 'error');
    const copied = await copyTextTwoLayer(shopId);
    if (!copied) return showToast('คัดลอกไม่สำเร็จ กรุณาคัดลอกเอง', 'error');
    showToast('คัดลอก SHOP ID แล้ว', 'success');
  }

  function syncModalPinToHiddenInput() {
    const hiddenPinInput = qs('manual-pin');
    if (!hiddenPinInput) return '';
    hiddenPinInput.value = readSyncPinFromUrl();
    return hiddenPinInput.value;
  }

  function openStaffLinkModal() {
    if (isRestrictedStaffMode()) {
      showToast('โหมดเชื่อมต่ออยู่ที่เครื่องพนักงาน', 'click');
      return;
    }
    updateSyncUi();
    openModal('modal-staff-link');
  }

  async function submitClientAccessRequestFromModal() {
    syncModalPinToHiddenInput();
    return submitClientAccessRequest();
  }

  function buildEmployeeLinkUrl() {
    let employeeUrl = '';
    const current = new URL(window.location.href);
    const pagePath = current.pathname || '/';
    employeeUrl = `${current.origin}${pagePath}?mode=staff`;
    const pin = normalizeSyncPin(state.db.sync.currentSyncPin || '');
    if (pin) employeeUrl += `&pin=${encodeURIComponent(pin)}`;
    return employeeUrl;
  }

  async function copyEmployeeLink() {
    let employeeUrl = '';
    try {
      const response = await fetch('/api/employee-link', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        employeeUrl = String(payload?.employee_url || '').trim();
      }
    } catch (_) {}

    if (!employeeUrl) {
      employeeUrl = buildEmployeeLinkUrl();
    } else {
      const pin = normalizeSyncPin(state.db.sync.currentSyncPin || '');
      if (pin) {
        const parsed = new URL(employeeUrl, window.location.origin);
        parsed.searchParams.set('pin', pin);
        employeeUrl = parsed.toString();
      }
    }

    const copied = await copyTextTwoLayer(employeeUrl);
    if (!copied) return showToast('คัดลอกลิงก์ไม่สำเร็จ', 'error');
    showToast('คัดลอกลิงก์เครื่องพนักงานแล้ว', 'success');
  }

  //* timers open
  function startLiveTimers() {
    clearInterval(state.liveTick);
    state.liveTick = setInterval(() => {
      document.querySelectorAll('.admin-timer').forEach((el) => {
        const start = Number(el.getAttribute('data-start') || 0);
        if (start) el.textContent = formatDurationFrom(start);
      });
      renderOnlineClientsUi();
      if (IS_CLIENT_NODE) {
        const tick = Date.now();
        if ((tick - state.lastClientHeartbeatAt) >= HEARTBEAT_INTERVAL_MS) {
          if (isClientSessionValid()) {
            if ((tick - state.lastCloudSessionCheckAt) >= HEARTBEAT_INTERVAL_MS) {
              verifyClientSessionAgainstCloud();
              state.lastCloudSessionCheckAt = tick;
            }
            broadcastClientHeartbeat();
            flushClientOpQueue();
          }
          else broadcastClientAccessRequest();
          state.lastClientHeartbeatAt = tick;
        }
      }
    }, 1000);
  }
  //* timers close

  //* render open
  function renderAll() {
    applyTheme();
    applyTrialUiGuards();
    updateMasterConnectionUi();
    renderOnlineClientsUi();
    renderCustomerGrid();
    renderShopQueue();
    renderAnalytics();
    renderAdminLists();
    renderSystemPanels();
    updateCartTotal();
    if (qs('display-hwid')) qs('display-hwid').textContent = state.db.shopId || '-';
  }

  function switchMenuManageTab(id, btn) {
    const tabId = id === 'redeem' ? 'redeem' : 'menu';
    state.activeMenuManageSub = tabId;
    const menuPane = qs('menu-manage-pane-menu');
    const redeemPane = qs('menu-manage-pane-redeem');
    if (menuPane) menuPane.classList.toggle('hidden', tabId !== 'menu');
    if (redeemPane) redeemPane.classList.toggle('hidden', tabId !== 'redeem');
    document.querySelectorAll('#sub-menu #menu-manage-tab-menu, #sub-menu #menu-manage-tab-redeem').forEach((tab) => {
      tab.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
      tab.classList.add('text-gray-500');
    });
    if (btn) {
      btn.classList.remove('text-gray-500');
      btn.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
    }
  }
  //* render close

  //* init open
  async function init() {
    try {
      if (!IS_CLIENT_NODE && localStorage.getItem(LS_FORCE_CLIENT_MODE) === 'true') {
        const lastSession = getStoredClientSession();
        if (lastSession?.clientSessionToken) {
          showToast('โหมดอุปกรณ์เสริมถูกปิดในรุ่น Offline-only', 'error');
          return;
        }
      }
      state.isStaffMode = resolveStaffModeFlag();
      state.hwid = await resolveDbApi().getDeviceId();
      await hydrateClientSessionFromDb();
      await hydrateAppliedOperationsFromDb();
      const raw = await resolveDbApi().load();
      state.db = normalizeDb(raw);
      if (!state.db.shopId) state.db.shopId = makeShopId();
      if (IS_CLIENT_NODE && !getStoredClientSession()?.clientSessionToken) {
        const pendingShopId = localStorage.getItem('FAKDU_PENDING_MASTER_SHOP_ID') || '';
        if (pendingShopId) state.db.shopId = pendingShopId;
      }
      if (!state.db.sync.masterDeviceId) state.db.sync.masterDeviceId = state.hwid;
      if (!state.db.sync.currentSyncPin) state.db.sync.currentSyncPin = generateSyncPin(state.db.shopId, state.db.sync.syncVersion || 1);
      state.db.sync.key = state.db.sync.currentSyncPin;
      await syncProStatus();
      applyTrialUiGuards();
      await bindSyncChannel();
      startSyncPollingFallback();
      loadSettingsToForm();
      applyTheme();
      updateSyncUi();
      updateMasterConnectionUi();
      syncCustomSearchUiMode();
      bindGridZoomControls();
      renderAll();
      applyStaffModeUi();
      const urlPin = readSyncPinFromUrl();
      if (qs('manual-pin') && urlPin) qs('manual-pin').value = urlPin;
      if (IS_CLIENT_NODE) {
        const profile = getClientProfile();
        if (qs('sys-client-name')) qs('sys-client-name').value = profile.profileName;
        if (qs('client-device-name')) qs('client-device-name').textContent = profile.profileName;
        if (qs('client-avatar') && profile.avatar) qs('client-avatar').src = profile.avatar;
        if (qs('client-access-mode')) {
          qs('client-access-mode').value = normalizeClientAccessMode(localStorage.getItem('FAKDU_CLIENT_ACCESS_MODE') || 'both');
        }

        const session = getStoredClientSession();
        state.db.sync.clientSession = session ? {
          shopId: session.shopId || '',
          clientId: session.clientId || profile.clientId,
          clientSessionToken: session.clientSessionToken || '',
          syncVersion: Number(session.syncVersion || state.db.sync.syncVersion || 1),
          accessMode: normalizeClientAccessMode(session.accessMode || 'both')
        } : null;
        applyClientAccessModeUi();
        if (isClientSessionValid()) {
          const api = resolveFirebaseSyncApi();
          if (api && state.db.shopId) {
            try {
              const meta = await api.readSyncMeta(state.db.shopId);
              const sessionNow = getStoredClientSession();
              const expected = sessionNow?.clientId ? meta?.clientSessions?.[sessionNow.clientId] : null;
              const versionMismatch = Number(sessionNow?.syncVersion || 0) !== Number(meta?.syncVersion || 0);
              const tokenMismatch = !expected || String(expected.clientSessionToken || '') !== String(sessionNow?.clientSessionToken || '');
              if (!sessionNow || versionMismatch || tokenMismatch) {
                await invalidateClientSession('session หมดอายุ กรุณาเชื่อมใหม่');
              } else {
                await pullSnapshotFromCloud(state.db.shopId);
                await requestMissingMenuImages();
              }
            } catch (_) {}
          }
        }
        if (!isClientSessionValid()) {
          state.db.items = [];
          state.db.units = [];
          state.db.unitCount = 0;
        }
      }
      const today = getLocalYYYYMMDD();
      if (qs('search-start')) qs('search-start').value = today;
      if (qs('search-end')) qs('search-end').value = today;
      renderAnalytics();
      startLiveTimers();
      switchTab('customer', qs('tab-customer'));
      if (!IS_CLIENT_NODE && isRestrictedStaffMode() && urlPin && !localStorage.getItem(LS_PENDING_PAIR_REQUEST_ID)) {
        submitClientAccessRequestFromModal();
      }
      if (!IS_CLIENT_NODE || isClientSessionValid()) {
        showToast('FAKDU พร้อมใช้งาน', 'success');
      }
    } catch (error) {
      console.error(error);
      showToast('โหลดระบบไม่สำเร็จ', 'error');
    }
  }
  //* init close

  //* shield open
  const _0x2f9a = {
    b7(event) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    },
    c3(event) {
      const key = String(event.key || '').toLowerCase();
      const blockedCombo = event.ctrlKey && event.shiftKey && (key === 'i' || key === 'j' || key === 'c');
      const blockedDevKey = key === 'f12';
      if (blockedCombo || blockedDevKey) return _0x2f9a.b7(event);
      return true;
    }
  };

  function _0x7d11() {
    document.addEventListener('contextmenu', _0x2f9a.b7, { capture: true });
    document.addEventListener('keydown', _0x2f9a.c3, { capture: true });
  }
  //* shield close

  //* events open
  window.addEventListener('online', () => {
    updateMasterConnectionUi();
    if (IS_CLIENT_NODE) flushClientOpQueue();
  });
  window.addEventListener('offline', updateMasterConnectionUi);
  window.addEventListener('storage', (event) => {
    if (!IS_CLIENT_NODE || !event.key || !event.newValue) return;
    if (!event.key.startsWith(LS_SNAPSHOT_PREFIX)) return;
    try {
      applyMasterSnapshot(JSON.parse(event.newValue));
    } catch (_) {}
  });
  document.addEventListener('DOMContentLoaded', () => {
    _0x7d11();
    const promptPayDynamicToggle = qs('sys-promptpay-dynamic');
    if (promptPayDynamicToggle) {
      promptPayDynamicToggle.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        setPromptPayDynamicEnabled(target.checked);
        if (qs('modal-checkout') && !qs('modal-checkout').classList.contains('hidden')) updateQrDisplay();
      });
    }
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('#shop-queue button') && !target.closest('#checkout-payment-buttons button')) return;
      const checkoutModal = qs('modal-checkout');
      if (checkoutModal && !checkoutModal.classList.contains('hidden')) updateQrDisplay();
    });
    init();
  });
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (event.key === 'Enter' && target.id === 'manual-pin') {
      event.preventDefault();
      submitClientAccessRequestFromModal();
    }
  });
  //* events close

  //* expose open
  Object.assign(window, {
    closeModal,
    openModal,
    installPWA,
    dismissPWAInstallBanner,
    copyUnlockShopId,
    copyEmployeeLink,
    openStaffLinkModal,
    switchTab,
    attemptAdmin,
    verifyAdminPin,
    adminLogout,
    changeGridZoom,
    toggleCustomerGridCollapse,
    toggleShopQueueCollapse,
    openTable,
    handleItemClickByIndex,
    reviewCart,
    openReviewCartModal,
    editCartItem,
    confirmOrderSend,
    openCheckout,
    deleteOrderItem,
    confirmPayment,
    lookupCheckoutMember,
    applyCheckoutMemberLookup,
    openRedeemPointsModal,
    applyRedeemPointsSelection,
    toggleCheckoutMemberSection,
    markCheckoutMemberDirty,
    switchManageSub,
    switchMenuManageTab,
    switchDashTab,
    calculateCustomSalesRealtime,
    clearSales,
    cancelClearSalesConfirm,
    confirmClearSalesAction,
    selectSalesCompareMode,
    openMenuModal,
    editItem,
    addAddonField,
    removeAddonField,
    updateAddonField,
    quickEnableRedeemItem,
    quickEditRedeemItem,
    quickDisableRedeemItem,
    toggleRedeemEligibility,
    saveRedeemEligibility,
    saveMenuItem,
    deleteItem,
    updateUnits,
    saveSystemSettings,
    handleImage,
    exportBackup,
    importBackup,
    saveMemberFromSystem,
    editMemberFromSystem,
    deleteMemberFromSystem,
    resetMemberForm,
    openRecoveryModal: () => {
      if (qs('rec-ans-phone')) qs('rec-ans-phone').value = '';
      if (qs('rec-ans-color')) qs('rec-ans-color').selectedIndex = 0;
      if (qs('rec-ans-animal')) qs('rec-ans-animal').selectedIndex = 0;
      closeModal('modal-admin-pin');
      openModal('modal-recovery');
    },
    saveRecoveryData,
    executeRecovery,
    validateProKey,
    openProModal,
    handleLockedFeatureClick,
    triggerSyncCheck,
    requestNewSyncKey,
    confirmNewSyncKey,
    openApprovalInbox,
    openClientScanner,
    closeClientScanner,
    submitClientAccessRequest,
    submitClientAccessRequestFromModal,
    submitClientAccess: submitClientAccessRequest,
    handleClientImage,
    saveClientSettings,
    clientLogout,
    adjustAddonQty,
    confirmAddonSelection,
    approveClient,
    approveClientWithMode,
    approveNextClientRequest,
    rejectClient,
    rejectNextClientRequest,
    markCheckoutRequest
  });
  //* expose close
})();
