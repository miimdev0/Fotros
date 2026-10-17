/*
 * FETROS — native (Android app) helpers (js/native.js)
 *
 * Inside the Capacitor Android app, prayer, medication and reminder alerts are
 * handed to the operating system (LocalNotifications), so they can show while
 * the app is closed. Android may still delay or drop them (battery saving,
 * Doze, force stop, or a revoked permission). In a normal browser this module
 * does nothing and the in-app checks in script.js and view-tools.js are used.
 *
 * Also provides shareFile(): in the Android app, files (backups, calendars) are
 * written to the app cache and passed to the system share sheet, because the
 * WebView cannot download blobs.
 *
 * Exposes: window.FETROS.Native
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};

  var DAY_MS = 86400000;
  var HORIZON_DAYS = 7;           // schedule alerts this many days ahead
  var MAX_NOTIFICATIONS = 200;    // keep well below Android's alarm limits
  var CHUNK = 50;                 // notifications per bridge call
  var RESYNC_MS = 15 * 60 * 1000; // re-plan at least this often while the app runs
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

  var state = { dirty: true, lastSync: 0, running: null, again: false };

  function plugins() {
    return global.Capacitor && global.Capacitor.Plugins ? global.Capacitor.Plugins : null;
  }

  function localPlugin() {
    var p = plugins();
    return p && p.LocalNotifications ? p.LocalNotifications : null;
  }

  function isNative() {
    return !!localPlugin();
  }

  // Stable positive 31-bit id for a schedule key (FNV-1a), so ids never depend on order.
  function hashId(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return (h & 0x7fffffff) || 1;
  }

  function faDigits(text, useFa) {
    var s = String(text);
    return useFa ? s.replace(/[0-9]/g, function (d) { return FA_DIGITS.charAt(+d); }) : s;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isoOfDate(dt) {
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  // Same rule as view-tools.js: a medication is active on `iso` when enabled and inside its date range.
  function medActive(med, iso) {
    if (!med.active) return false;
    if (med.start && iso < med.start) return false;
    if (med.end && iso > med.end) return false;
    return true;
  }

  /*
   * buildPlan(input) -> [{ id, key, title, body, at }]  (pure: no storage, no plugin calls)
   *  input.now        epoch ms
   *  input.settings   sanitised settings (notifyPrayer, notifyMeds, notifyReminders, method, asr, adjust, numeralsPersian)
   *  input.loc        { lat, lon, tz } of the active location (NS.Location.resolve)
   *  input.reminders  reminder records; input.meds / input.medLogs as stored
   *  input.nextDue    function(dueAt, recur, now) -> next occurrence after now (NS.Tools.nextDue)
   * Only alerts strictly after `now` and within HORIZON_DAYS are returned, sorted by time.
   */
  function buildPlan(input) {
    var now = input.now;
    var s = input.settings || {};
    var horizon = now + HORIZON_DAYS * DAY_MS;
    var useFa = s.numeralsPersian !== 'en';
    var out = [];
    var used = {};

    function add(key, title, body, at) {
      if (!isFinite(at) || at <= now || at > horizon) return;
      var id = hashId(key);
      while (used[id]) id = (id % 0x7fffffff) + 1;
      used[id] = true;
      out.push({ id: id, key: key, title: title, body: body, at: at });
    }

    if (s.notifyPrayer && input.loc && NS.Prayer && NS.Calendar) {
      var tz = input.loc.tz;
      var base = NS.Prayer.civilDateInZone(now, tz);
      var baseJdn = NS.Calendar.gregorianToJdn(base.y, base.m, base.d);
      for (var off = 0; off <= HORIZON_DAYS; off++) {
        var g = NS.Calendar.jdnToGregorian(baseJdn + off);
        var day = NS.Prayer.computeDay({
          lat: input.loc.lat, lon: input.loc.lon, tz: tz,
          y: g.y, m: g.m, d: g.d,
          method: s.method, asr: s.asr, adjust: s.adjust
        });
        day.items.forEach(function (it) {
          if (!it.ms || it.key === 'sunrise' || it.key === 'sunset') return;
          add('prayer|' + g.y + '-' + g.m + '-' + g.d + '|' + it.key,
            it.label, 'ساعت ' + faDigits(it.time, useFa), it.ms);
        });
      }
    }

    if (s.notifyMeds) {
      var logged = {};
      (input.medLogs || []).forEach(function (l) { logged[l.medId + '|' + l.date + '|' + l.time] = true; });
      var today = new Date(now);
      for (var dd = 0; dd <= HORIZON_DAYS; dd++) {
        var dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dd);
        var iso = isoOfDate(dt);
        (input.meds || []).forEach(function (m) {
          if (!medActive(m, iso)) return;
          (m.times || []).forEach(function (t) {
            if (logged[m.id + '|' + iso + '|' + t]) return;
            var at = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(),
              +t.slice(0, 2), +t.slice(3, 5)).getTime();
            add('med|' + m.id + '|' + iso + '|' + t,
              'یادآور دارو: ' + m.name,
              (m.dose ? m.dose + ' — ' : '') + 'ساعت ' + faDigits(t, useFa) + ' — طبق دستور پزشک',
              at);
          });
        });
      }
    }

    if (s.notifyReminders) {
      (input.reminders || []).forEach(function (r) {
        if (r.done || !isFinite(r.dueAt)) return;
        var recurs = r.recur && r.recur !== 'none' && input.nextDue;
        var occ = r.dueAt;
        // Jump past old occurrences in one step so long-running daily reminders stay cheap.
        if (occ <= now && recurs) occ = input.nextDue(occ, r.recur, now);
        var guard = 0;
        while (occ <= horizon && guard < 400) {
          add('rem|' + r.id + '|' + occ, 'یادآور: ' + r.title, 'زمان یادآور رسیده است', occ);
          if (!recurs) break;
          var nxt = input.nextDue(occ, r.recur, occ);
          if (!(nxt > occ)) break;
          occ = nxt;
          guard++;
        }
      });
    }

    out.sort(function (a, b) { return a.at - b.at; });
    return out.slice(0, MAX_NOTIFICATIONS);
  }

  function loadInput() {
    var S = NS.Store;
    return Promise.all([S.getAll('reminders'), S.getAll('meds'), S.getAll('medLogs')]).then(function (r) {
      var settings = S.getSettings();
      return {
        now: Date.now(),
        settings: settings,
        loc: NS.Location.resolve(settings),
        reminders: r[0],
        meds: r[1],
        medLogs: r[2],
        nextDue: NS.Tools ? NS.Tools.nextDue : null
      };
    });
  }

  function scheduleChunks(plugin, plan, from) {
    if (from >= plan.length) return Promise.resolve();
    var chunk = plan.slice(from, from + CHUNK).map(function (n) {
      return {
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: new Date(n.at), allowWhileIdle: true }
      };
    });
    return plugin.schedule({ notifications: chunk }).then(function () {
      return scheduleChunks(plugin, plan, from + CHUNK);
    });
  }

  /*
   * syncSchedules() -> Promise<{ scheduled, reason }>
   * Cancels everything pending and schedules a fresh plan. Only runs in the
   * Android app with notification permission granted.
   */
  function syncSchedules() {
    var plugin = localPlugin();
    if (!plugin) return Promise.resolve({ scheduled: 0, reason: 'not-native' });
    if (state.running) {
      state.again = true;
      return state.running;
    }
    state.dirty = false;
    state.lastSync = Date.now();
    state.running = plugin.checkPermissions().then(function (perm) {
      if (!perm || perm.display !== 'granted') return { scheduled: 0, reason: 'no-permission' };
      return loadInput().then(function (input) {
        var plan = buildPlan(input);
        return plugin.getPending().then(function (res) {
          var pending = (res && res.notifications) || [];
          if (pending.length) {
            return plugin.cancel({ notifications: pending.map(function (n) { return { id: n.id }; }) });
          }
        }).then(function () {
          return scheduleChunks(plugin, plan, 0);
        }).then(function () {
          return { scheduled: plan.length, reason: 'ok' };
        });
      });
    }).catch(function (err) {
      state.dirty = true; // try again on the next check
      console.warn('[FETROS] native alert sync failed', err);
      return { scheduled: 0, reason: 'error' };
    }).then(function (result) {
      state.running = null;
      if (state.again) {
        state.again = false;
        state.dirty = true;
      }
      return result;
    });
    return state.running;
  }

  // Called from the periodic check: re-plans only when something changed or the plan is old.
  function maybeSync() {
    if (!isNative()) return Promise.resolve(null);
    if (state.dirty || Date.now() - state.lastSync > RESYNC_MS) return syncSchedules();
    return Promise.resolve(null);
  }

  // Called after any change that can alter alerts (saving a reminder, a medication, a log, a setting).
  function requestSync() {
    state.dirty = true;
  }

  function requestPermission() {
    var plugin = localPlugin();
    if (!plugin) return Promise.resolve('unsupported');
    return plugin.requestPermissions().then(function (r) {
      state.dirty = true;
      return r && r.display ? r.display : 'denied';
    });
  }

  function permissionState() {
    var plugin = localPlugin();
    if (!plugin) return Promise.resolve('unsupported');
    return plugin.checkPermissions().then(function (r) {
      return r && r.display ? r.display : 'unknown';
    }).catch(function () { return 'unknown'; });
  }

  /*
   * shareFile(filename, text) -> Promise<true> | null
   * Native only: writes the text to the app cache and opens the system share sheet
   * (save to Files, send to the Calendar app, etc.). Returns null in a browser.
   */
  function shareFile(filename, text) {
    var p = plugins();
    if (!p || !p.Filesystem || !p.Share) return null;
    return p.Filesystem.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true })
      .then(function () { return p.Filesystem.getUri({ path: filename, directory: 'CACHE' }); })
      .then(function (res) {
        return p.Share.share({ title: filename, files: [res.uri], dialogTitle: 'ذخیره یا ارسال فایل' });
      })
      .then(function () { return true; });
  }

  NS.Native = {
    HORIZON_DAYS: HORIZON_DAYS,
    isNative: isNative,
    buildPlan: buildPlan,
    syncSchedules: syncSchedules,
    maybeSync: maybeSync,
    requestSync: requestSync,
    requestPermission: requestPermission,
    permissionState: permissionState,
    shareFile: shareFile
  };
})(typeof window !== 'undefined' ? window : globalThis);
