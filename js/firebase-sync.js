(() => {
  'use strict';

  const firebaseConfig = {
    apiKey: 'AIzaSyDdxwqteCdj6ZhLDKwjiQMC3yo3sLYNDbE',
    authDomain: 'zabo-92cb7.firebaseapp.com',
    databaseURL: 'https://zabo-92cb7-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'zabo-92cb7',
    storageBucket: 'zabo-92cb7.firebasestorage.app',
    messagingSenderId: '625230404240',
    appId: '1:625230404240:web:4849ed3046555e6da45615',
    measurementId: 'G-LR12QPDZZZ'
  };

  if (!window.firebase || typeof window.firebase.initializeApp !== 'function') {
    console.warn('[FAKDU Firebase] Firebase SDK not loaded');
    return;
  }

  const app = window.firebase.apps?.length
    ? window.firebase.app()
    : window.firebase.initializeApp(firebaseConfig);
  const db = window.firebase.database(app);

  function normalizeShopId(shopId = '') {
    return String(shopId || '').trim().toUpperCase();
  }

  function normalizePin(pin = '') {
    return String(pin || '').trim();
  }

  function normalizeClientId(clientId = '') {
    return String(clientId || '').trim();
  }

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function nowMs() {
    return Date.now();
  }

  function makeId(prefix = 'id') {
    return `${prefix}-${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function readOnce(path) {
    return db.ref(path).once('value').then((snap) => snap.val());
  }

  function setValue(path, payload) {
    return db.ref(path).set(payload);
  }

  function updateValue(path, payload) {
    return db.ref(path).update(payload);
  }

  function removeValue(path) {
    return db.ref(path).remove();
  }

  function listenChildAdded(path, onData) {
    const ref = db.ref(path);
    const handler = (snap) => {
      const value = snap.val();
      if (value == null) return;
      onData(value, snap.key);
    };
    ref.on('child_added', handler);
    return () => ref.off('child_added', handler);
  }

  function listenValue(path, onData) {
    const ref = db.ref(path);
    const handler = (snap) => onData(snap.val(), snap.key);
    ref.on('value', handler);
    return () => ref.off('value', handler);
  }

  const api = {
    async send(shopId, payload = {}) {
      const sid = normalizeShopId(shopId);
      if (!sid) return false;
      const msgId = String(payload.id || payload.messageId || makeId('msg')).trim();
      const body = {
        ...payload,
        id: msgId,
        type: String(payload.type || 'SYNC_MESSAGE'),
        sentAt: toNumber(payload.sentAt, nowMs())
      };
      await setValue(`shops/${sid}/messages/${msgId}`, body);
      return true;
    },

    listen(shopId, minTs = 0, onMessage) {
      const sid = normalizeShopId(shopId);
      if (!sid || typeof onMessage !== 'function') return () => {};
      const seen = new Set();
      return listenChildAdded(`shops/${sid}/messages`, (msg, key) => {
        const id = String(msg?.id || key || '').trim();
        if (!id || seen.has(id)) return;
        if (toNumber(msg?.sentAt, 0) < toNumber(minTs, 0)) return;
        seen.add(id);
        onMessage(msg);
      });
    },

    async writeSyncMeta(shopId, payload = {}) {
      const sid = normalizeShopId(shopId);
      if (!sid) return false;
      const body = {
        ...payload,
        shopId: sid,
        updatedAt: nowMs()
      };
      await setValue(`shops/${sid}/meta`, body);

      const pin = normalizePin(body.currentSyncPin || body.syncPin || '');
      if (pin) {
        await setValue(`syncPins/${pin}`, {
          pin,
          shopId: sid,
          syncVersion: toNumber(body.syncVersion, 1),
          updatedAt: nowMs()
        });
      }
      return true;
    },

    async readSyncMeta(shopId) {
      const sid = normalizeShopId(shopId);
      if (!sid) return null;
      return readOnce(`shops/${sid}/meta`);
    },

    async writeSnapshot(shopId, payload = {}) {
      const sid = normalizeShopId(shopId);
      if (!sid) return false;
      const version = String(payload.version || payload.syncVersion || payload.snapshotVersion || 'latest').trim() || 'latest';
      const body = {
        ...payload,
        shopId: sid,
        version,
        updatedAt: nowMs()
      };
      await setValue(`shops/${sid}/snapshots/${version}`, body);
      await setValue(`shops/${sid}/snapshots/latest`, body);
      return true;
    },

    async readSnapshot(shopId) {
      const sid = normalizeShopId(shopId);
      if (!sid) return null;
      const latest = await readOnce(`shops/${sid}/snapshots/latest`);
      if (latest) return latest;
      const all = await readOnce(`shops/${sid}/snapshots`);
      if (!all || typeof all !== 'object') return null;
      const entries = Object.values(all).filter(Boolean);
      if (!entries.length) return null;
      entries.sort((a, b) => toNumber(b.updatedAt, 0) - toNumber(a.updatedAt, 0));
      return entries[0] || null;
    },

    async writeOperation(shopId, payload = {}) {
      const sid = normalizeShopId(shopId);
      if (!sid) return false;
      const opId = String(payload.id || payload.opId || makeId('op')).trim();
      const body = {
        ...payload,
        id: opId,
        opId,
        type: String(payload.type || 'SYNC_OPERATION'),
        sentAt: toNumber(payload.sentAt, nowMs()),
        ts: toNumber(payload.ts, nowMs())
      };
      await setValue(`shops/${sid}/operations/${opId}`, body);
      return true;
    },

    listenOperations(shopId, minTs = 0, onAction) {
      const sid = normalizeShopId(shopId);
      if (!sid || typeof onAction !== 'function') return () => {};
      const seen = new Set();
      return listenChildAdded(`shops/${sid}/operations`, (action, key) => {
        const opId = String(action?.opId || action?.id || key || '').trim();
        if (!opId || seen.has(opId)) return;
        const ts = Math.max(toNumber(action?.sentAt, 0), toNumber(action?.ts, 0), toNumber(action?.createdAt, 0));
        if (ts < toNumber(minTs, 0)) return;
        seen.add(opId);
        onAction({ ...action, opId });
      });
    },

    async writeJoinRequest(pin, payload = {}) {
      const normPin = normalizePin(pin || payload.pin);
      if (!normPin) return false;
      const requestId = String(payload.requestId || makeId('req')).trim();
      const body = {
        ...payload,
        clientId: String(payload.clientId || payload.deviceId || 'UNKNOWN'),
        pin: normPin,
        requestId,
        requestedAt: toNumber(payload.requestedAt, nowMs())
      };
      await setValue(`joinRequests/${normPin}/${requestId}`, body);
      return true;
    },

    listenJoinRequests(pin, onJoinRequest) {
      const normPin = normalizePin(pin);
      if (!normPin || typeof onJoinRequest !== 'function') return () => {};
      const seen = new Set();
      return listenChildAdded(`joinRequests/${normPin}`, (payload, key) => {
        const requestId = String(payload?.requestId || key || '').trim();
        const unique = `${requestId}:${payload?.clientId || ''}`;
        if (!requestId || seen.has(unique)) return;
        seen.add(unique);
        onJoinRequest({ ...payload, requestId });
      });
    },

    async approveClient(pin, clientId, payload = {}) {
      const normPin = normalizePin(pin || payload.pin);
      const cid = normalizeClientId(clientId || payload.clientId);
      if (!normPin || !cid) return false;
      const requestId = String(payload.requestId || makeId('req')).trim();
      const body = {
        ...payload,
        approved: true,
        pin: normPin,
        clientId: cid,
        requestId,
        approvedAt: toNumber(payload.approvedAt, nowMs())
      };
      await setValue(`clientApprovals/${normPin}/${cid}/${requestId}`, body);
      return true;
    },

    async rejectClient(pin, clientId, payload = {}) {
      const normPin = normalizePin(pin || payload.pin);
      const cid = normalizeClientId(clientId || payload.clientId);
      if (!normPin || !cid) return false;
      const requestId = String(payload.requestId || makeId('req')).trim();
      const body = {
        ...payload,
        approved: false,
        pin: normPin,
        clientId: cid,
        requestId,
        rejectedAt: toNumber(payload.rejectedAt, nowMs())
      };
      await setValue(`clientApprovals/${normPin}/${cid}/${requestId}`, body);
      return true;
    },

    listenClientApprovalStatus(pin, clientId, requestId, onStatus) {
      const normPin = normalizePin(pin);
      const cid = normalizeClientId(clientId);
      const reqId = String(requestId || '').trim();
      if (!normPin || !cid || typeof onStatus !== 'function') return () => {};

      if (reqId) {
        return listenValue(`clientApprovals/${normPin}/${cid}/${reqId}`, (payload) => {
          if (!payload) return;
          onStatus({ ...payload, requestId: reqId, clientId: cid, pin: normPin });
        });
      }

      return listenChildAdded(`clientApprovals/${normPin}/${cid}`, (payload, key) => {
        if (!payload) return;
        onStatus({ ...payload, requestId: key, clientId: cid, pin: normPin });
      });
    },

    async upsertClient(shopId, payload = {}) {
      const sid = normalizeShopId(shopId);
      const cid = normalizeClientId(payload.clientId);
      if (!sid || !cid) return false;
      await updateValue(`shops/${sid}/clients/${cid}`, {
        ...payload,
        clientId: cid,
        updatedAt: nowMs()
      });
      return true;
    },

    async clearClientSessions(shopId) {
      const sid = normalizeShopId(shopId);
      if (!sid) return false;
      await removeValue(`shops/${sid}/clients`);
      return true;
    },

    async upsertMember(shopId, payload = {}) {
      const sid = normalizeShopId(shopId);
      if (!sid) return false;
      const key = String(payload.id || payload.memberId || payload.phone || payload.tel || makeId('member')).replace(/[.#$\[\]/]/g, '_');
      await setValue(`shops/${sid}/members/${key}`, {
        ...payload,
        memberId: key,
        updatedAt: nowMs()
      });
      return true;
    },

    async writeMember(shopId, payload = {}) {
      return this.upsertMember(shopId, payload);
    },

    async readSyncPin(pin) {
      const normPin = normalizePin(pin);
      if (!normPin) return null;
      return readOnce(`syncPins/${normPin}`);
    }
  };

  window.FakduFirebaseSync = {
    resolveApi() {
      return api;
    }
  };
})();
