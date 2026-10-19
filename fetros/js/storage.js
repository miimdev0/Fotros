/*
 * FETROS — local storage layer (js/storage.js)
 *
 * - Structured records (tasks, notes, reminders, events, medications, dose
 *   logs, dhikr sessions) live in IndexedDB. If IndexedDB is unavailable or
 *   fails to open, records fall back to localStorage (smaller limit, same API).
 * - Lightweight settings live in localStorage under one versioned key.
 * - Azan audio files (user-provided) are stored as Blobs in IndexedDB.
 * - Nothing here is sent to a server. Export/import uses plain JSON files.
 * - Service-worker caches never store this data (see sw.js).
 *
 * Exposes: window.FETROS.Store
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var DB_NAME = 'fetros-db';
  var DB_VERSION = 1;
  var SETTINGS_KEY = 'fetros.settings.v1';
  var RUNTIME_KEY = 'fetros.runtime.v1';
  var FALLBACK_PREFIX = 'fetros.fb.';
  var EXPORT_SCHEMA = 1;
  var APP_ID = 'fetros';

  // Record stores. blobs holds binary files (azan audio) and is never exported.
  var RECORD_STORES = ['tasks', 'notes', 'reminders', 'events', 'meds', 'medLogs', 'dhikr'];
  var ALL_STORES = RECORD_STORES.concat(['blobs']);

  var RECUR_VALUES = {
    reminders: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
    events: ['none', 'yearly-persian', 'yearly-gregorian']
  };

  /* ------------------------------ Helpers ------------------------------ */

  function newId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function clampStr(v, max) {
    return (typeof v === 'string' ? v : '').replace(/\u0000/g, '').slice(0, max);
  }

  // Accepts only real calendar dates in YYYY-MM-DD form (rejects 2026-02-30).
  function isIsoDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var y = +v.slice(0, 4), m = +v.slice(5, 7), d = +v.slice(8, 10);
    if (m < 1 || m > 12 || d < 1) return false;
    var daysInMonth = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= daysInMonth[m - 1];
  }

  function isHhmm(v) {
    return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  }

  function readJson(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      if (raw === null) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    global.localStorage.setItem(key, JSON.stringify(value));
  }

  /* ------------------------------ Settings ------------------------------ */

  var DEFAULT_SETTINGS = {
    theme: 'dark',                 // dark | light | system
    accent: 'gold',                // gold | sunrise | lapis
    motion: 'full',                // full | subtle | none
    textSize: 'normal',            // normal | large | xlarge (body text)
    numeralsPersian: 'fa',         // fa | en  (Persian & Hijri dates)
    numeralsGregorian: 'en',       // en | fa  (Gregorian dates)
    locationMode: 'city',          // city | custom | gps
    cityId: 'tehran',
    customLocation: null,          // { lat, lon, name, tz } when locationMode is custom/gps
    method: 'tehran',              // key of prayer METHODS
    asr: 'shafi',                  // shafi | hanafi
    adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, sunset: 0, maghrib: 0, isha: 0 },
    hijriOffset: 0,                // -2 … +2 days
    hijriMethod: 'ummalqura',      // ummalqura | tabular (tabular is the arithmetic fallback)
    notifyPrayer: false,
    notifyReminders: true,
    notifyMeds: false,
    backupReminder: true,          // weekly reminder to save a backup while the app is open
    azanEnabled: false,            // plays user-provided audio when a prayer time arrives (app open)
    vibrate: true,
    dhikrSound: false,
    weatherEnabled: false,
    weatherCityId: 'tehran',
    onboarded: false,
    lastRunVersion: ''
  };

  var ENUMS = {
    theme: ['dark', 'light', 'system'],
    accent: ['gold', 'sunrise', 'lapis'],
    motion: ['full', 'subtle', 'none'],
    hijriMethod: ['ummalqura', 'tabular'],
    textSize: ['normal', 'large', 'xlarge'],
    numeralsPersian: ['fa', 'en'],
    numeralsGregorian: ['en', 'fa'],
    locationMode: ['city', 'custom', 'gps'],
    asr: ['shafi', 'hanafi']
  };

  var ADJUST_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha'];

  // Keeps only known keys, with the right types, inside the allowed ranges.
  function sanitizeSettings(raw) {
    var out = {};
    var src = raw && typeof raw === 'object' ? raw : {};
    var keys = Object.keys(DEFAULT_SETTINGS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var def = DEFAULT_SETTINGS[k];
      var v = src[k];
      if (k === 'adjust') {
        out.adjust = {};
        ADJUST_KEYS.forEach(function (ak) {
          var n = v && typeof v === 'object' ? Math.round(Number(v[ak])) : 0;
          out.adjust[ak] = isFinite(n) ? Math.max(-60, Math.min(60, n)) : 0;
        });
        continue;
      }
      if (k === 'customLocation') {
        var ok = v && typeof v === 'object' && isFinite(+v.lat) && isFinite(+v.lon) &&
          +v.lat >= -90 && +v.lat <= 90 && +v.lon >= -180 && +v.lon <= 180;
        out.customLocation = ok ? {
          lat: +(+v.lat).toFixed(5), lon: +(+v.lon).toFixed(5),
          name: clampStr(v.name, 80), tz: clampStr(v.tz, 64) || 'UTC'
        } : null;
        continue;
      }
      if (typeof def === 'boolean') {
        out[k] = typeof v === 'boolean' ? v : def;
      } else if (typeof def === 'number') {
        var num = Math.round(Number(v));
        out[k] = isFinite(num) ? Math.max(-2, Math.min(2, num)) : def;
      } else if (typeof def === 'string') {
        var s = clampStr(v, 64);
        if (ENUMS[k]) out[k] = ENUMS[k].indexOf(s) !== -1 ? s : def;
        else out[k] = s || def;
      }
    }
    // hijriOffset is the only number setting; clamp explicitly.
    out.hijriOffset = Math.max(-2, Math.min(2, Math.round(Number(out.hijriOffset) || 0)));
    return out;
  }

  var settingsCache = null;

  function getSettings() {
    if (!settingsCache) settingsCache = sanitizeSettings(readJson(SETTINGS_KEY, {}));
    return settingsCache;
  }

  function setSettings(patch) {
    var merged = Object.assign({}, getSettings(), patch || {});
    if (patch && patch.adjust) merged.adjust = Object.assign({}, getSettings().adjust, patch.adjust);
    settingsCache = sanitizeSettings(merged);
    writeJson(SETTINGS_KEY, settingsCache);
    return settingsCache;
  }

  function resetSettings() {
    settingsCache = sanitizeSettings({});
    writeJson(SETTINGS_KEY, settingsCache);
    return settingsCache;
  }

  function getRuntime() {
    return readJson(RUNTIME_KEY, {});
  }

  function setRuntime(patch) {
    var next = Object.assign({}, getRuntime(), patch || {});
    writeJson(RUNTIME_KEY, next);
    return next;
  }

  /* ------------------------------ Record sanitising ------------------------------ */

  // Each sanitiser returns a clean record or null when the input is invalid.
  var SANITIZERS = {
    tasks: function (r) {
      var title = clampStr(r.title, 200).trim();
      if (!title) return null;
      return {
        id: clampStr(r.id, 64), title: title, done: r.done === true,
        due: isIsoDate(r.due) ? r.due : '',
        priority: r.priority === 'high' ? 'high' : 'normal',
        createdAt: +r.createdAt || Date.now(),
        completedAt: r.done === true ? (+r.completedAt || Date.now()) : null
      };
    },
    notes: function (r) {
      var title = clampStr(r.title, 120).trim();
      var body = clampStr(r.body, 5000);
      if (!title && !body.trim()) return null;
      return {
        id: clampStr(r.id, 64), title: title || 'یادداشت بدون عنوان', body: body,
        favorite: r.favorite === true,
        createdAt: +r.createdAt || Date.now(), updatedAt: +r.updatedAt || Date.now()
      };
    },
    reminders: function (r) {
      var title = clampStr(r.title, 200).trim();
      var due = +r.dueAt;
      if (!title || !isFinite(due) || due <= 0) return null;
      return {
        id: clampStr(r.id, 64), title: title, dueAt: due,
        recur: RECUR_VALUES.reminders.indexOf(r.recur) !== -1 ? r.recur : 'none',
        done: r.done === true,
        firedAt: +r.firedAt || null,
        createdAt: +r.createdAt || Date.now()
      };
    },
    events: function (r) {
      var title = clampStr(r.title, 200).trim();
      if (!title || !isIsoDate(r.date)) return null;
      return {
        id: clampStr(r.id, 64), title: title, date: r.date,
        recur: RECUR_VALUES.events.indexOf(r.recur) !== -1 ? r.recur : 'none',
        kind: ['personal', 'birthday', 'anniversary'].indexOf(r.kind) !== -1 ? r.kind : 'personal',
        note: clampStr(r.note, 500),
        createdAt: +r.createdAt || Date.now()
      };
    },
    meds: function (r) {
      var name = clampStr(r.name, 120).trim();
      if (!name) return null;
      var times = Array.isArray(r.times) ? r.times.filter(isHhmm).slice(0, 12) : [];
      return {
        id: clampStr(r.id, 64), name: name, dose: clampStr(r.dose, 200),
        times: times,
        start: isIsoDate(r.start) ? r.start : '',
        end: isIsoDate(r.end) ? r.end : '',
        active: r.active !== false,
        createdAt: +r.createdAt || Date.now()
      };
    },
    medLogs: function (r) {
      if (!isIsoDate(r.date) || ['taken', 'skipped'].indexOf(r.status) === -1) return null;
      return {
        id: clampStr(r.id, 64), medId: clampStr(r.medId, 64), date: r.date,
        time: isHhmm(r.time) ? r.time : '', status: r.status, at: +r.at || Date.now()
      };
    },
    dhikr: function (r) {
      var target = Math.round(+r.target);
      var count = Math.round(+r.count);
      if (!isFinite(target) || target < 1 || target > 100000) return null;
      if (!isFinite(count) || count < 0 || count > 1000000) return null;
      return {
        id: clampStr(r.id, 64), label: clampStr(r.label, 80) || 'ذکر', target: target, count: count,
        date: isIsoDate(r.date) ? r.date : '', at: +r.at || Date.now()
      };
    }
  };

  /* ------------------------------ IndexedDB ------------------------------ */

  var db = null;
  var mode = 'none'; // 'indexeddb' | 'localstorage' | 'none'
  var initPromise = null;

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('IndexedDB not available')); return; }
      var req;
      try { req = global.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var d = req.result;
        ALL_STORES.forEach(function (name) {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: 'id' });
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
      req.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }

  function idbRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB request failed')); };
    });
  }

  function idbTx(store, write) {
    return db.transaction(store, write ? 'readwrite' : 'readonly').objectStore(store);
  }

  function fallbackRead(store) {
    var list = readJson(FALLBACK_PREFIX + store, []);
    return Array.isArray(list) ? list : [];
  }

  function fallbackWrite(store, list) {
    try {
      writeJson(FALLBACK_PREFIX + store, list);
    } catch (e) {
      throw new Error('storage-full');
    }
  }

  // Opens the database once. Falls back to localStorage when IndexedDB fails.
  function init() {
    if (initPromise) return initPromise;
    initPromise = openDb().then(function (d) {
      db = d;
      mode = 'indexeddb';
      return mode;
    }).catch(function () {
      db = null;
      mode = 'localstorage';
      return mode;
    });
    return initPromise;
  }

  function getAll(store) {
    if (mode === 'indexeddb') {
      return idbRequest(idbTx(store, false).getAll()).then(function (list) { return list || []; });
    }
    return Promise.resolve(mode === 'localstorage' ? fallbackRead(store) : []);
  }

  function put(store, record) {
    if (mode === 'indexeddb') {
      return idbRequest(idbTx(store, true).put(record)).then(function () { return record; });
    }
    if (mode === 'localstorage') {
      var list = fallbackRead(store).filter(function (x) { return x.id !== record.id; });
      list.push(record);
      fallbackWrite(store, list);
      return Promise.resolve(record);
    }
    return Promise.reject(new Error('no-storage'));
  }

  function remove(store, id) {
    if (mode === 'indexeddb') {
      return idbRequest(idbTx(store, true).delete(id)).then(function () { return true; });
    }
    if (mode === 'localstorage') {
      fallbackWrite(store, fallbackRead(store).filter(function (x) { return x.id !== id; }));
      return Promise.resolve(true);
    }
    return Promise.reject(new Error('no-storage'));
  }

  function clearStore(store) {
    if (mode === 'indexeddb') {
      return idbRequest(idbTx(store, true).clear()).then(function () { return true; });
    }
    if (mode === 'localstorage') {
      fallbackWrite(store, []);
      return Promise.resolve(true);
    }
    return Promise.resolve(true);
  }

  // Saves binary azan audio. In localStorage mode blobs are not supported.
  function putBlob(id, blob, meta) {
    if (mode !== 'indexeddb') return Promise.reject(new Error('blob-unsupported'));
    var rec = { id: id, blob: blob, name: clampStr(meta && meta.name, 120), type: clampStr(meta && meta.type, 60), savedAt: Date.now() };
    return idbRequest(idbTx('blobs', true).put(rec)).then(function () { return rec; });
  }

  function getBlob(id) {
    if (mode !== 'indexeddb') return Promise.resolve(null);
    return idbRequest(idbTx('blobs', false).get(id)).then(function (r) { return r || null; });
  }

  function removeBlob(id) {
    if (mode !== 'indexeddb') return Promise.resolve(false);
    return idbRequest(idbTx('blobs', true).delete(id)).then(function () { return true; });
  }

  /* ------------------------------ Export / import ------------------------------ */

  // Builds the JSON export object. Audio blobs are intentionally excluded.
  function buildExport(appVersion) {
    var data = {};
    return Promise.all(RECORD_STORES.map(function (s) {
      return getAll(s).then(function (list) { data[s] = list; });
    })).then(function () {
      return {
        app: APP_ID,
        schema: EXPORT_SCHEMA,
        appVersion: appVersion,
        exportedAt: new Date().toISOString(),
        note: 'پشتیبان فطرس. فایل صوتی اذان در این پشتیبان قرار ندارد.',
        settings: getSettings(),
        data: data
      };
    });
  }

  // Validates an imported object. Returns { ok, error, data, settings, counts }.
  function validateImport(obj) {
    if (!obj || typeof obj !== 'object' || obj.app !== APP_ID) {
      return { ok: false, error: 'این فایل پشتیبان فطرس نیست.' };
    }
    if (obj.schema !== EXPORT_SCHEMA) {
      return { ok: false, error: 'نسخه‌ی پشتیبان پشتیبانی نمی‌شود.' };
    }
    if (!obj.data || typeof obj.data !== 'object') {
      return { ok: false, error: 'ساختار داده‌ها معتبر نیست.' };
    }
    var clean = {};
    var counts = {};
    var rejected = 0;
    RECORD_STORES.forEach(function (s) {
      var list = Array.isArray(obj.data[s]) ? obj.data[s] : [];
      clean[s] = [];
      list.forEach(function (raw) {
        if (!raw || typeof raw !== 'object') { rejected++; return; }
        var rec = SANITIZERS[s](raw);
        if (!rec || !rec.id) { rejected++; return; }
        clean[s].push(rec);
      });
      counts[s] = clean[s].length;
    });
    return {
      ok: true,
      data: clean,
      settings: obj.settings ? sanitizeSettings(obj.settings) : null,
      counts: counts,
      rejected: rejected
    };
  }

  // Merges validated records by id (existing records with the same id are replaced).
  function applyImport(validated) {
    var jobs = RECORD_STORES.map(function (s) {
      var list = validated.data[s] || [];
      return list.reduce(function (p, rec) {
        return p.then(function () { return put(s, rec); });
      }, Promise.resolve());
    });
    return Promise.all(jobs).then(function () {
      if (validated.settings) setSettings(validated.settings);
      return true;
    });
  }

  // Deletes all records, blobs and local settings.
  function clearEverything() {
    var jobs = RECORD_STORES.map(clearStore);
    jobs.push(mode === 'indexeddb' ? idbRequest(idbTx('blobs', true).clear()) : Promise.resolve());
    return Promise.all(jobs).then(function () {
      try {
        global.localStorage.removeItem(SETTINGS_KEY);
        global.localStorage.removeItem(RUNTIME_KEY);
      } catch (e) { /* ignore */ }
      settingsCache = null;
      return true;
    });
  }

  /* ------------------------------ Public API ------------------------------ */

  NS.Store = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    RECORD_STORES: RECORD_STORES,
    RECUR_VALUES: RECUR_VALUES,
    newId: newId,
    init: init,
    mode: function () { return mode; },
    getAll: getAll,
    put: put,
    remove: remove,
    clearStore: clearStore,
    putBlob: putBlob,
    getBlob: getBlob,
    removeBlob: removeBlob,
    getSettings: getSettings,
    setSettings: setSettings,
    resetSettings: resetSettings,
    sanitizeSettings: sanitizeSettings,
    getRuntime: getRuntime,
    setRuntime: setRuntime,
    sanitizers: SANITIZERS,
    buildExport: buildExport,
    validateImport: validateImport,
    applyImport: applyImport,
    clearEverything: clearEverything
  };
})(typeof window !== 'undefined' ? window : globalThis);
