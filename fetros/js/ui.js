/*
 * FETROS — shared UI helpers (js/ui.js)
 *
 * - HTML escaping (every user value goes through esc() before it reaches innerHTML)
 * - Inline SVG icon set (original, simple line icons)
 * - Number and date formatting that follows the numeral settings
 * - Toasts, accessible modal sheets, confirmation prompts
 * - A small action registry so views can use data-action attributes
 *
 * Exposes: window.FETROS.UI
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var doc = global.document;
  var actions = {};
  var submits = {};
  var changes = {};
  var inputs = {};
  var tickers = [];
  var toastSeq = 0;

  /* ------------------------------ Escaping ------------------------------ */

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------ Icons ------------------------------ */

  // Original simple line icons (24×24 grid, stroke based).
  var ICON_PATHS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>',
    prayer: '<path d="M3 17.5h18"/><path d="M6.5 17.5a5.5 5.5 0 0 1 11 0"/><path d="M12 5v3M5.6 8.6l1.6 1.6M18.4 8.6l-1.6 1.6"/>',
    tools: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12.2h9.4L17.5 7"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    star: '<path d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.7.9-5.4-3.9-3.8 5.4-.8z"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5 13.6 13.6 8.5 15.5 10.4 10.4z"/>',
    beads: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="5.5" r="1.1"/><circle cx="12" cy="18.5" r="1.1"/><circle cx="5.5" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/>',
    pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9 9l6 6"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18.5z"/>',
    note: '<path d="M6 3.5h9.5L19 7v13.5H6z"/><path d="M9 11h7M9 14.5h7M9 18h4"/>',
    task: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>',
    alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M5 4 3 6M19 4l2 2"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    location: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    play: '<path d="M8 6.5v11l9-5.5z"/>',
    pause: '<path d="M9 6.5v11M15 6.5v11"/>',
    install: '<path d="M12 4v10M8 10.5l4 4 4-4M5 19.5h14"/>'
  };

  function icon(name, cls) {
    var body = ICON_PATHS[name] || ICON_PATHS.info;
    return '<svg class="ico ' + esc(cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  /* ------------------------------ Settings-aware formatting ------------------------------ */

  function settings() {
    return NS.Store.getSettings();
  }

  // Persian/Hijri numerals follow the "Persian numerals" setting.
  function num(value) {
    return NS.Calendar.digits(value, settings().numeralsPersian);
  }

  // Gregorian numerals follow the "Gregorian numerals" setting.
  function gnum(value) {
    return NS.Calendar.digits(value, settings().numeralsGregorian);
  }

  function weekdayName(jdn) {
    return NS.Calendar.WEEKDAYS[NS.Calendar.weekdayOf(jdn)];
  }

  function persianLong(jdn) {
    var p = NS.Calendar.jdnToPersian(jdn);
    return num(p.d) + ' ' + NS.Calendar.PERSIAN_MONTHS[p.m - 1] + ' ' + num(p.y);
  }

  function gregorianLong(jdn) {
    var g = NS.Calendar.jdnToGregorian(jdn);
    return gnum(g.d) + ' ' + NS.Calendar.GREGORIAN_MONTHS[g.m - 1] + ' ' + gnum(g.y);
  }

  function hijriLong(jdn) {
    var h = NS.Calendar.jdnToHijri(jdn, settings().hijriOffset);
    return num(h.d) + ' ' + NS.Calendar.HIJRI_MONTHS[h.m - 1] + ' ' + num(h.y);
  }

  // ISO date (YYYY-MM-DD) to Persian short text, e.g. "۵ آبان ۱۴۰۵".
  function isoPersian(iso) {
    var jdn = NS.Calendar.isoToJdn(iso);
    return jdn === null ? '' : persianLong(jdn);
  }

  // Local clock time "HH:MM" for a timestamp, digits per setting.
  function clockOf(ms) {
    var d = new Date(ms);
    var hh = (d.getHours() < 10 ? '0' : '') + d.getHours();
    var mm = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    return num(hh + ':' + mm);
  }

  // Local "YYYY-MM-DDTHH:MM" for <input type="datetime-local">.
  function toLocalInput(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fromLocalInput(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // ISO date of a timestamp in local time.
  function localIsoDate(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function todayJdn() {
    return NS.Calendar.todayJdn(new Date());
  }

  // Parses a number typed by the user (Persian digits allowed). Returns NaN if invalid.
  function parseNumber(value) {
    var s = NS.Calendar.toAsciiDigits(String(value || '')).replace(/[٫،]/g, '.').trim();
    if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  /* ------------------------------ Toasts ------------------------------ */

  function toast(message, opts) {
    var o = opts || {};
    var root = doc.getElementById('toast-root');
    if (!root) return;
    var id = 't' + (++toastSeq);
    var el = doc.createElement('div');
    el.className = 'toast toast-' + (o.type || 'info');
    el.id = id;
    el.setAttribute('role', o.type === 'error' ? 'alert' : 'status');
    el.innerHTML = '<span class="toast-msg"></span>';
    el.querySelector('.toast-msg').textContent = message;
    if (o.action) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = o.action.label;
      btn.addEventListener('click', function () {
        try { o.action.run(); } finally { dismiss(); }
      });
      el.appendChild(btn);
    }
    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstElementChild);
    function dismiss() {
      el.classList.add('out');
      global.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }
    global.setTimeout(dismiss, o.timeout || (o.action ? 9000 : 3800));
    return dismiss;
  }

  /* ------------------------------ Modal sheet ------------------------------ */

  var modalSeq = 0;
  var openModals = [];

  // opts: { title, body (trusted HTML built from esc()), submitLabel, cancelLabel,
  //         danger, onSubmit(form) => boolean|Promise<boolean>, onClose(), hideSubmit }
  function modal(opts) {
    var root = doc.getElementById('sheet-root');
    var id = 'm' + (++modalSeq);
    var prevFocus = doc.activeElement;
    var backdrop = doc.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.id = id;
    var submitHtml = opts.hideSubmit ? '' :
      '<button type="submit" class="btn ' + (opts.danger ? 'danger-solid' : 'primary') + '">' +
      esc(opts.submitLabel || 'ذخیره') + '</button>';
    backdrop.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="' + id + '-title">' +
      '<div class="sheet-grab" aria-hidden="true"></div>' +
      '<header class="sheet-head"><h2 id="' + id + '-title" class="sheet-title">' + esc(opts.title || '') + '</h2>' +
      '<button type="button" class="icon-btn" data-close aria-label="بستن">' + icon('close') + '</button></header>' +
      '<form class="sheet-form" novalidate>' +
      '<div class="sheet-body">' + (opts.body || '') + '</div>' +
      '<footer class="sheet-actions">' +
      '<button type="button" class="btn ghost" data-close>' + esc(opts.cancelLabel || 'انصراف') + '</button>' +
      submitHtml + '</footer></form></div>';
    root.appendChild(backdrop);
    doc.body.classList.add('modal-open');
    openModals.push(backdrop);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      backdrop.classList.add('closing');
      openModals = openModals.filter(function (x) { return x !== backdrop; });
      if (!openModals.length) doc.body.classList.remove('modal-open');
      global.setTimeout(function () { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 220);
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
      if (opts.onClose) opts.onClose();
    }

    var form = backdrop.querySelector('form');
    backdrop.addEventListener('click', function (ev) {
      if (ev.target === backdrop) close();
      var c = ev.target.closest && ev.target.closest('[data-close]');
      if (c && backdrop.contains(c)) close();
    });
    backdrop.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); close(); return; }
      if (ev.key === 'Tab') trapFocus(ev, backdrop);
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!opts.onSubmit) { close(); return; }
      var res = opts.onSubmit(form, api);
      Promise.resolve(res).then(function (ok) {
        if (ok !== false) close();
      }).catch(function (err) {
        toast(err && err.message ? err.message : 'خطایی رخ داد.', { type: 'error' });
      });
    });

    var api = { el: backdrop, form: form, close: close };
    global.setTimeout(function () {
      var first = form.querySelector('input:not([type=hidden]):not([disabled]), textarea, select');
      if (first) first.focus({ preventScroll: true });
      else { var b = backdrop.querySelector(".sheet"); if (b) { b.setAttribute("tabindex", "-1"); b.focus(); } }
    }, 40);
    return api;
  }

  function trapFocus(ev, scope) {
    var nodes = scope.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var list = Array.prototype.filter.call(nodes, function (n) { return !n.disabled && n.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  // Resolves true when confirmed, false when cancelled.
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var done = false;
      modal({
        title: opts.title || 'تأیید',
        body: '<p class="confirm-text">' + esc(opts.message || '') + '</p>',
        submitLabel: opts.okLabel || 'تأیید',
        cancelLabel: opts.cancelLabel || 'انصراف',
        danger: !!opts.danger,
        onSubmit: function () { done = true; resolve(true); return true; },
        onClose: function () { if (!done) resolve(false); }
      });
    });
  }

  /* ------------------------------ Action registry ------------------------------ */

  function registerAction(name, fn) { actions[name] = fn; }
  function registerSubmit(name, fn) { submits[name] = fn; }
  function registerChange(name, fn) { changes[name] = fn; }

  function runAction(name, el, ev) {
    var fn = actions[name];
    if (fn) {
      var res = fn(el, ev);
      if (res && typeof res.catch === 'function') {
        res.catch(function (err) { toast((err && err.message) || 'خطایی رخ داد.', { type: 'error' }); });
      }
      return true;
    }
    return false;
  }

  function runSubmit(name, form, ev) {
    var fn = submits[name];
    if (!fn) return false;
    var res = fn(form, ev);
    if (res && typeof res.catch === 'function') {
      res.catch(function (err) { toast((err && err.message) || 'خطایی رخ داد.', { type: 'error' }); });
    }
    return true;
  }

  function runChange(name, el, ev) {
    var fn = changes[name];
    if (!fn) return false;
    var res = fn(el, ev);
    if (res && typeof res.catch === 'function') {
      res.catch(function (err) { toast((err && err.message) || 'خطایی رخ داد.', { type: 'error' }); });
    }
    return true;
  }

  function registerInput(name, fn) { inputs[name] = fn; }

  function runInput(name, el, ev) {
    var fn = inputs[name];
    if (fn) fn(el, ev);
    return !!fn;
  }

  /* ------------------------------ Tickers ------------------------------ */

  // A ticker is a function called every `ms` while the current view is shown.
  function addTicker(fn, ms) {
    var id = global.setInterval(fn, ms);
    tickers.push(id);
    return id;
  }

  function clearTickers() {
    tickers.forEach(function (id) { global.clearInterval(id); });
    tickers = [];
  }

  /* ------------------------------ Misc ------------------------------ */

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      global.clearTimeout(t);
      t = global.setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  // Simple vibration with feature detection.
  function vibrate(pattern) {
    if (!settings().vibrate) return;
    if (global.navigator && typeof global.navigator.vibrate === 'function') {
      try { global.navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  }

  function pct(done, total) {
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }

  // Simple empty-state block with an icon and Persian text.
  function emptyState(iconName, title, text, actionHtml) {
    return '<div class="empty-state">' + icon(iconName, 'empty-ico') +
      '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (actionHtml || '') + '</div>';
  }

  // Animated digit set for countdowns. Returns markup with flip-capable spans.
  function digitSpan(value) {
    return '<span class="digit" data-v="' + esc(value) + '">' + esc(value) + '</span>';
  }

  NS.UI = {
    esc: esc,
    icon: icon,
    num: num,
    gnum: gnum,
    settings: settings,
    weekdayName: weekdayName,
    persianLong: persianLong,
    gregorianLong: gregorianLong,
    hijriLong: hijriLong,
    isoPersian: isoPersian,
    clockOf: clockOf,
    toLocalInput: toLocalInput,
    fromLocalInput: fromLocalInput,
    localIsoDate: localIsoDate,
    todayJdn: todayJdn,
    parseNumber: parseNumber,
    toast: toast,
    modal: modal,
    confirm: confirmDialog,
    registerAction: registerAction,
    registerSubmit: registerSubmit,
    registerChange: registerChange,
    registerInput: registerInput,
    runInput: runInput,
    runAction: runAction,
    runSubmit: runSubmit,
    runChange: runChange,
    addTicker: addTicker,
    clearTickers: clearTickers,
    debounce: debounce,
    vibrate: vibrate,
    pct: pct,
    emptyState: emptyState,
    digitSpan: digitSpan
  };
})(typeof window !== 'undefined' ? window : globalThis);
