/*
 * FETROS — application bootstrap, router, shell and settings (script.js)
 *
 * Load order (see index.html):
 *   js/storage.js → js/calendar-engine.js → js/data/*.js → js/prayer-engine.js
 *   → js/location.js → js/ui.js → js/view-*.js → script.js
 *
 * Responsibilities:
 *   - hash router (#/home, #/calendar, …) with page transitions
 *   - bottom navigation, floating action button, offline indicator
 *   - settings view: appearance, numerals, location, notifications, data
 *   - reminder / prayer / medication checks while the app is open
 *   - service worker registration with a graceful update prompt
 *   - install prompt (Android Chrome) and splash screen
 *
 * Exposes: window.FETROS.Router, window.FETROS.APP_VERSION
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var APP_VERSION = '1.1.0'; // keep in sync with CACHE_VERSION in sw.js
  NS.APP_VERSION = APP_VERSION;

  var UI = NS.UI;
  var doc = global.document;
  var ROUTES = {
    home: { nav: 'home' },
    calendar: { nav: 'calendar' },
    prayer: { nav: 'prayer' },
    tools: { nav: 'tools' },
    settings: { nav: 'settings' },
    organizer: { nav: 'tools' },
    dhikr: { nav: 'tools' },
    qibla: { nav: 'tools' },
    meds: { nav: 'tools' },
    weather: { nav: 'tools' }
  };
  var FAB_HIDDEN = { settings: true, dhikr: true, qibla: true };

  var viewEl = null;
  var current = null;     // currently mounted view object
  var currentName = '';
  var renderSeq = 0;
  var deferredInstall = null;
  var swReloading = false;

  /* ------------------------------ Router ------------------------------ */

  function parseHash() {
    var raw = (global.location.hash || '').replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean);
    var name = parts[0] || 'home';
    if (!ROUTES[name]) name = 'home';
    return { name: name, params: parts.slice(1) };
  }

  function setNav(name) {
    var active = ROUTES[name] ? ROUTES[name].nav : 'home';
    var links = doc.querySelectorAll('.bottom-nav [data-route]');
    Array.prototype.forEach.call(links, function (a) {
      var on = a.getAttribute('data-route') === active;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var fab = doc.getElementById('fab');
    if (fab) fab.hidden = !!FAB_HIDDEN[name];
  }

  function errorState(message) {
    return '<section class="empty-state error-state" role="alert">' + UI.icon('info', 'empty-ico') +
      '<h3>خطا در نمایش</h3><p>' + UI.esc(message) + '</p>' +
      '<button type="button" class="btn primary" data-action="retry-route">تلاش دوباره</button></section>';
  }

  // Renders the route in #view. animate=true for navigation, false for refresh.
  function show(animate) {
    if (!viewEl) return;
    var route = parseHash();
    var view = NS.Views && NS.Views[route.name];
    var seq = ++renderSeq;
    if (current && current.unmount) {
      try { current.unmount(); } catch (e) { console.error(e); }
    }
    UI.clearTickers();
    currentName = route.name;
    current = view || null;
    setNav(route.name);
    if (view && view.title) doc.title = view.title + ' · فطرس';
    viewEl.setAttribute('aria-busy', 'true');

    Promise.resolve().then(function () {
      return view ? view.render(route.params) : '';
    }).then(function (html) {
      if (seq !== renderSeq) return;
      viewEl.innerHTML = html;
      viewEl.removeAttribute('aria-busy');
      if (animate) {
        viewEl.classList.remove('view-in');
        void viewEl.offsetWidth; // restart the CSS animation
        viewEl.classList.add('view-in');
        global.scrollTo(0, 0);
      }
      if (view && view.mount) view.mount(viewEl, route.params);
    }).catch(function (err) {
      if (seq !== renderSeq) return;
      console.error(err);
      viewEl.innerHTML = errorState('این بخش موقتاً در دسترس نیست. دوباره تلاش کنید.');
      viewEl.removeAttribute('aria-busy');
    });
  }

  function navigate(hash) {
    if (global.location.hash === hash) {
      show(false);
    } else {
      global.location.hash = hash;
    }
  }

  // Refreshes the current route without an entrance animation.
  function refresh() {
    // Any screen refresh follows a data change, so the OS alerts may need re-planning.
    if (NS.Native) NS.Native.requestSync();
    show(false);
  }

  function refreshIfOn(names) {
    if (names.indexOf(currentName) !== -1) refresh();
  }

  NS.Router = { navigate: navigate, refresh: refresh, refreshIfOn: refreshIfOn, current: function () { return currentName; } };

  /* ------------------------------ Appearance ------------------------------ */

  function applyAppearance() {
    var s = UI.settings();
    var root = doc.documentElement;
    var systemDark = !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    var dark = s.theme === 'dark' || (s.theme === 'system' && systemDark);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-accent', s.accent);
    root.setAttribute('data-motion', s.motion);
    root.setAttribute('data-text', s.textSize);
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#101114' : '#FFF8EA');
  }

  /* ------------------------------ Connectivity & install ------------------------------ */

  function paintOnline() {
    var chip = doc.getElementById('net-chip');
    if (!chip) return;
    var online = global.navigator.onLine !== false;
    chip.classList.toggle('is-offline', !online);
    chip.setAttribute('aria-label', online ? 'وضعیت اتصال: آنلاین' : 'وضعیت اتصال: آفلاین');
    chip.querySelector('.chip-text').textContent = online ? 'آنلاین' : 'آفلاین';
  }

  function initInstall() {
    global.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstall = e;
      var btn = doc.getElementById('install-btn');
      if (btn) btn.hidden = false;
    });
    global.addEventListener('appinstalled', function () {
      deferredInstall = null;
      var btn = doc.getElementById('install-btn');
      if (btn) btn.hidden = true;
      UI.toast('فطرس روی صفحه‌ی اصلی نصب شد.', { type: 'success' });
    });
  }

  UI.registerAction('install-app', function () {
    if (!deferredInstall) {
      UI.modal({
        title: 'نصب فطرس',
        body: '<ol class="steps small"><li>در Chrome اندروید، منوی سه‌نقطه‌ی بالا را باز کنید.</li>' +
          '<li>گزینه‌ی «Install app» یا «افزودن به صفحه‌ی اصلی» را بزنید.</li>' +
          '<li>برای نصب، اتصال HTTPS یا localhost لازم است؛ اگر فایل را مستقیم از حافظه باز کرده‌اید، نصب انجام نمی‌شود.</li></ol>',
        hideSubmit: true,
        cancelLabel: 'بستن'
      });
      return;
    }
    deferredInstall.prompt();
    return deferredInstall.userChoice.then(function (choice) {
      deferredInstall = null;
      if (choice && choice.outcome === 'accepted') UI.toast('نصب آغاز شد.', { type: 'success' });
      var btn = doc.getElementById('install-btn');
      if (btn) btn.hidden = true;
    });
  });

  /* ------------------------------ Service worker ------------------------------ */

  function registerServiceWorker() {
    if (!('serviceWorker' in global.navigator)) return;
    // Service workers need HTTPS or localhost. Other origins (e.g. file://) skip this safely.
    var secure = global.isSecureContext;
    if (!secure) return;
    global.navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && global.navigator.serviceWorker.controller) {
            UI.toast('نسخه‌ی جدید فطرس آماده است.', {
              type: 'info', timeout: 12000,
              action: { label: 'بروزرسانی', run: function () { nw.postMessage({ type: 'SKIP_WAITING' }); } }
            });
          }
        });
      });
    }).catch(function (err) {
      console.warn('Service worker registration failed', err);
    });
    global.navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (swReloading) return;
      swReloading = true;
      global.location.reload();
    });
  }

  function checkForUpdate() {
    if (!('serviceWorker' in global.navigator)) return Promise.resolve(false);
    return global.navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return false;
      return reg.update().then(function () {
        return !!reg.waiting || !!reg.installing;
      });
    }).catch(function () { return false; });
  }

  /* ------------------------------ Notifications & checks ------------------------------ */

  function notificationPermission() {
    return 'Notification' in global ? global.Notification.permission : 'unsupported';
  }

  // Fires prayer notifications / azan once per prayer and day (while the app is open).
  function checkPrayers() {
    var s = UI.settings();
    if (!s.notifyPrayer && !s.azanEnabled) return Promise.resolve();
    var now = Date.now();
    var ctx = NS.Location.prayerContext(new Date(now));
    if (!ctx || !ctx.today) return Promise.resolve();
    var d = ctx.today.date;
    var dayKey = d.y + '-' + d.m + '-' + d.d;
    var rt = NS.Store.getRuntime();
    var seen = rt.prayerSeen || {};
    var fired = false;
    ctx.today.items.forEach(function (it) {
      if (!it.ms || it.key === 'sunrise' || it.key === 'sunset') return;
      if (it.ms > now || now - it.ms > 90000) return;
      var key = dayKey + '|' + it.key;
      if (seen[key]) return;
      seen[key] = true;
      fired = true;
      if (s.notifyPrayer) NS.Notify.show(it.label, 'ساعت ' + UI.num(it.time), 'prayer-' + key);
      else UI.toast(it.label + ' — ساعت ' + UI.num(it.time), { timeout: 6000 });
      UI.vibrate([120, 80, 120]);
      if (s.azanEnabled && it.key !== 'sunrise') NS.PrayerUI.playSavedAzan().catch(function () { /* storage unavailable: skip audio */ });
    });
    if (fired) {
      var keys = Object.keys(seen);
      if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (k) { delete seen[k]; });
      NS.Store.setRuntime({ prayerSeen: seen });
    }
    return Promise.resolve();
  }

  function runChecks() {
    return Promise.all([
      NS.Tools.tick().catch(function (e) { console.warn(e); }),
      checkPrayers().catch(function (e) { console.warn(e); }),
      NS.Native.maybeSync().catch(function (e) { console.warn(e); })
    ]);
  }

  /* ------------------------------ Quick add (FAB) ------------------------------ */

  function openQuickAdd() {
    var body = '<div class="quick-grid">' +
      '<button type="button" class="quick-btn" data-quick="task">' + UI.icon('task') + '<span>کار</span></button>' +
      '<button type="button" class="quick-btn" data-quick="note">' + UI.icon('note') + '<span>یادداشت</span></button>' +
      '<button type="button" class="quick-btn" data-quick="reminder">' + UI.icon('alarm') + '<span>یادآور</span></button>' +
      '<button type="button" class="quick-btn" data-quick="event">' + UI.icon('calendar') + '<span>رویداد</span></button>' +
      '</div>';
    var m = UI.modal({ title: 'افزودن سریع', body: body, hideSubmit: true, cancelLabel: 'بستن' });
    m.el.querySelectorAll('[data-quick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-quick');
        m.close();
        global.setTimeout(function () { runQuick(kind); }, 230);
      });
    });
  }

  function runQuick(kind) {
    if (kind === 'task') return NS.Tools.openTaskEditor(null);
    if (kind === 'note') return NS.Tools.openNoteEditor(null);
    if (kind === 'event') return NS.CalendarUI.openEventForm(null, UI.localIsoDate(Date.now()));
    if (kind === 'reminder') {
      var body = '<div class="field"><label for="qr-t">متن یادآور</label><input id="qr-t" name="title" maxlength="200" required></div>' +
        '<div class="field"><label for="qr-d">زمان</label><input id="qr-d" type="datetime-local" name="due" required value="' + UI.toLocalInput(Date.now() + 3600000) + '"></div>' +
        '<div class="field"><label for="qr-r">تکرار</label><select id="qr-r" name="recur">' +
        '<option value="none">یک‌بار</option><option value="daily">روزانه</option><option value="weekly">هفتگی</option><option value="monthly">ماهانه</option><option value="yearly">سالانه</option></select></div>' +
        '<p class="error-text" role="alert" id="re-error"></p>';
      UI.modal({
        title: 'یادآور جدید',
        body: body,
        submitLabel: 'ثبت',
        onSubmit: function (form) {
          var title = String(form.elements.title.value || '').trim();
          var due = UI.fromLocalInput(form.elements.due.value);
          var err = form.querySelector('#re-error');
          if (!title) { err.textContent = 'متن یادآور لازم است.'; return false; }
          if (due === null || due <= Date.now()) { err.textContent = 'زمان باید معتبر و در آینده باشد.'; return false; }
          var rec = NS.Store.sanitizers.reminders({
            id: NS.Store.newId(), title: title, dueAt: due, recur: form.elements.recur.value, done: false, createdAt: Date.now()
          });
          return NS.Store.put('reminders', rec).then(function () {
            UI.toast('یادآور ثبت شد.', { type: 'success' });
            refresh();
            return true;
          });
        }
      });
    }
  }

  /* ------------------------------ Settings view ------------------------------ */

  function selectOpts(list, current) {
    return list.map(function (x) {
      return '<option value="' + UI.esc(x[0]) + '"' + (String(x[0]) === String(current) ? ' selected' : '') + '>' + UI.esc(x[1]) + '</option>';
    }).join('');
  }

  function toggleRow(key, label, hint, checked) {
    return '<label class="toggle-row"><input type="checkbox" data-change="setting-toggle" data-key="' + key + '"' + (checked ? ' checked' : '') + '>' +
      '<span><span class="toggle-title">' + UI.esc(label) + '</span>' + (hint ? '<span class="small muted block">' + UI.esc(hint) + '</span>' : '') + '</span></label>';
  }

  function nativePermissionText(state) {
    if (state === 'granted') return 'اجازه داده شده';
    if (state === 'denied') return 'مسدود شده (از تنظیمات اندروید فعال کنید)';
    if (state === 'prompt' || state === 'prompt-with-rationale') return 'هنوز درخواست نشده';
    return 'نامشخص';
  }

  function renderSettings() {
    var s = UI.settings();
    var loc = NS.Location.resolve(s);
    var perm = notificationPermission();
    var permText = perm === 'granted' ? 'اجازه داده شده' : perm === 'denied' ? 'مسدود شده (از تنظیمات مرورگر فعال کنید)' :
      perm === 'default' ? 'هنوز درخواست نشده' : 'در این مرورگر پشتیبانی نمی‌شود';
    var accentChips = [['gold', 'طلایی'], ['sunrise', 'طلوع'], ['lapis', 'لاجوردی']].map(function (a) {
      return '<button type="button" class="accent-chip accent-' + a[0] + (s.accent === a[0] ? ' is-active' : '') + '" data-action="set-accent" data-v="' + a[0] + '" aria-pressed="' + (s.accent === a[0]) + '">' +
        '<span class="swatch" aria-hidden="true"></span>' + a[1] + '</button>';
    }).join('');
    var mode = NS.Store.mode();
    var modeText = mode === 'indexeddb' ? 'پایگاه‌داده‌ی مرورگر (IndexedDB)' : mode === 'localstorage' ? 'حافظه‌ی محلی مرورگر (با حجم محدود)' : 'در دسترس نیست';
    var netText = global.navigator.onLine === false ? 'آفلاین' : 'آنلاین';
    return NS.Native.permissionState().then(function (nativeState) {
      var nativeLine = NS.Native.isNative()
        ? '<p class="small muted">اعلان‌های اندروید: ' + UI.esc(nativePermissionText(nativeState)) + '</p>'
        : '';
      return '<section class="page-head"><h1 class="page-title">تنظیمات</h1>' +
        '<p class="page-sub">ظاهر، اعلان‌ها، داده‌ها و درباره‌ی فطرس</p></section>' +

        '<section class="card" aria-labelledby="s-look"><h2 class="card-title" id="s-look">ظاهر</h2>' +
        '<div class="field"><label for="s-theme">زمینه</label><select id="s-theme" data-change="setting-select" data-key="theme">' +
        selectOpts([['dark', 'تیره'], ['light', 'روشن'], ['system', 'مطابق دستگاه']], s.theme) + '</select></div>' +
        '<div class="field"><span class="field-label" id="s-accent-l">رنگ تاکیدی</span><div class="chips" role="group" aria-labelledby="s-accent-l">' + accentChips + '</div></div>' +
        '<div class="field"><label for="s-motion">شدت انیمیشن</label><select id="s-motion" data-change="setting-select" data-key="motion">' +
        selectOpts([['full', 'کامل'], ['subtle', 'کم'], ['none', 'بدون انیمیشن']], s.motion) + '</select>' +
        '<small class="hint">اگر «کاهش حرکت» در دستگاه روشن باشد، انیمیشن‌ها خودکار کم می‌شوند.</small></div>' +
        '<div class="field"><label for="s-text">اندازه‌ی متن</label><select id="s-text" data-change="setting-select" data-key="textSize">' +
        selectOpts([['normal', 'معمولی'], ['large', 'بزرگ'], ['xlarge', 'خیلی بزرگ']], s.textSize) + '</select>' +
        '<small class="hint">اندازه‌ی متن اصلی را تغییر می‌دهد.</small></div>' +
        '<div class="field-row"><div class="field"><label for="s-num-fa">رقم تاریخ شمسی و قمری</label><select id="s-num-fa" data-change="setting-select" data-key="numeralsPersian">' +
        selectOpts([['fa', '۰۱۲ (فارسی)'], ['en', '012 (انگلیسی)']], s.numeralsPersian) + '</select></div>' +
        '<div class="field"><label for="s-num-en">رقم تاریخ میلادی</label><select id="s-num-en" data-change="setting-select" data-key="numeralsGregorian">' +
        selectOpts([['en', '012 (انگلیسی)'], ['fa', '۰۱۲ (فارسی)']], s.numeralsGregorian) + '</select></div></div>' +
        '</section>' +

        '<section class="card" aria-labelledby="s-loc"><h2 class="card-title" id="s-loc">مکان، اوقات و تقویم</h2>' +
        '<p class="small">موقعیت فعلی: <strong>' + UI.esc(loc.name) + '</strong> · روش: ' + UI.esc(NS.Prayer.METHODS[s.method] ? NS.Prayer.METHODS[s.method].name : '') + '</p>' +
        '<div class="actions-row"><a class="btn ghost sm" href="#/prayer">تغییر شهر و روش</a></div>' +
        '<div class="field"><label for="s-hijri">تصحیح تاریخ قمری (روز)</label><select id="s-hijri" data-change="setting-select" data-key="hijriOffset">' +
        selectOpts([[-2, '−۲ روز'], [-1, '−۱ روز'], [0, '۰ (جدولی)'], [1, '+۱ روز'], [2, '+۲ روز']], s.hijriOffset) + '</select>' +
        '<small class="hint">تاریخ قمری جدولی است. اگر رؤیت محلی یک یا دو روز دیرتر یا زودتر است، اینجا اصلاح کنید.</small></div>' +
        '</section>' +

        '<section class="card" aria-labelledby="s-notif"><h2 class="card-title" id="s-notif">اعلان‌ها و بازخورد</h2>' +
        '<p class="small muted">وضعیت اجازه‌ی اعلان: ' + UI.esc(permText) + '</p>' + nativeLine +
        '<div class="actions-row"><button type="button" class="btn ghost sm" data-action="ask-notify">درخواست اجازه‌ی اعلان</button></div>' +
        toggleRow('notifyPrayer', 'اعلان اوقات نماز', 'هنگام رسیدن وقت، وقتی برنامه باز است یا مرورگر اعلان را نشان می‌دهد.', s.notifyPrayer) +
        toggleRow('notifyReminders', 'اعلان یادآورها', 'یادآورهای ثبت‌شده هنگام زمان مقرر.', s.notifyReminders) +
        toggleRow('notifyMeds', 'یادآور دارو', 'یادآوری داخل برنامه؛ تضمین‌شده نیست.', s.notifyMeds) +
        toggleRow('azanEnabled', 'پخش اذان (فایل شما)', 'فقط وقتی برنامه باز است. فایل در بخش «اوقات شرعی» انتخاب می‌شود.', s.azanEnabled) +
        toggleRow('vibrate', 'لرزش', 'بازخورد لرزشی روی دکمه‌ها و یادآورها (اگر دستگاه پشتیبانی کند).', s.vibrate) +
        toggleRow('dhikrSound', 'صدای شمارش ذکر', 'یک بوق کوتاه هنگام شمارش.', s.dhikrSound) +
        '<p class="hint small">اعلان‌های این برنامه هنگامی که برنامه بسته است تضمین‌شده نیستند. مرورگر و سیستم عامل ممکن است اجرای زمان‌بندی‌شده را متوقف کنند.</p>' +
        '</section>' +

        '<section class="card" aria-labelledby="s-wx"><h2 class="card-title" id="s-wx">هواشناسی</h2>' +
        toggleRow('weatherEnabled', 'نمایش کارت هوا در خانه', 'نیازمند اینترنت. داده‌ها از Open-Meteo دریافت می‌شوند.', s.weatherEnabled) +
        '<div class="field"><label for="s-wx-city">شهر هواشناسی</label><select id="s-wx-city" data-change="setting-select" data-key="weatherCityId">' +
        selectOpts(NS.Data.cities.map(function (c) { return [c.id, c.name]; }), s.weatherCityId) + '</select></div>' +
        '</section>' +

        '<section class="card" aria-labelledby="s-data"><h2 class="card-title" id="s-data">داده‌ها و حریم خصوصی</h2>' +
        '<p class="small muted">وضعیت ذخیره‌سازی: ' + UI.esc(modeText) + '</p>' +
        '<p class="small muted">همه‌ی اطلاعات (یادداشت، وظایف، یادآورها، رویدادها، دارو و ذکر) فقط روی این دستگاه ذخیره می‌شوند. هیچ حساب کاربری یا سرور اجباری وجود ندارد و آنالیتیکس یا تبلیغ‌دهنده‌ای نصب نشده است.</p>' +
        '<div class="actions-row">' +
        '<button type="button" class="btn ghost sm" data-action="export-data">' + UI.icon('download') + ' ذخیره‌ی پشتیبان (JSON)</button>' +
        '<button type="button" class="btn ghost sm" data-action="export-ics">' + UI.icon('download') + ' ذخیره‌ی تقویم (ICS)</button>' +
        '<label class="btn ghost sm file-btn">' + UI.icon('upload') + ' وارد کردن پشتیبان<input type="file" accept="application/json,.json" data-change="import-file" aria-label="فایل پشتیبان"></label>' +
        '</div>' +
        '<div class="actions-row"><button type="button" class="btn danger sm" data-action="clear-data">' + UI.icon('trash') + ' پاک کردن همه‌ی داده‌های محلی</button></div>' +
        '<p class="hint small">پشتیبان شامل داده‌های متنی است و فایل صوتی اذان را شامل نمی‌شود. فایل پشتیبان را در جای امن نگه دارید؛ داده‌ها رمزگذاری نشده‌اند.</p>' +
        '</section>' +

        '<section class="card" aria-labelledby="s-about"><h2 class="card-title" id="s-about">درباره‌ی فطرس</h2>' +
        '<div class="about-brand">' + emblemSvg() + '<div><div class="brand-name">فطرس</div><div class="small muted">همراه لحظه‌های زندگی</div></div></div>' +
        '<dl class="kv small"><div><dt>نسخه</dt><dd>' + UI.esc(APP_VERSION) + '</dd></div>' +
        '<div><dt>اتصال</dt><dd>' + UI.esc(netText) + '</dd></div>' +
        '<div><dt>حالت آفلاین</dt><dd>بخش‌های تقویم، یادداشت، وظایف، یادآورها، تسبیح، قبله‌نما و اوقات شرعی بدون اینترنت کار می‌کنند.</dd></div>' +
        '<div><dt>نیازمند اینترنت</dt><dd>هواشناسی و بارگذاری نخستین نسخه‌ی برنامه.</dd></div></dl>' +
        '<p class="small muted">تقویم شمسی و قمری و اوقات شرعی با محاسبه‌ی محلی انجام می‌شود. فهرست مناسبت‌ها نمونه است و باید با تقویم رسمی تطبیق داده شود.</p>' +
        '<div class="actions-row">' +
        '<button type="button" class="btn ghost sm" data-action="install-app"' + (deferredInstall ? '' : ' hidden') + '>' + UI.icon('install') + ' نصب برنامه</button>' +
        '<button type="button" class="btn ghost sm" data-action="check-update">' + UI.icon('refresh') + ' بررسی نسخه‌ی جدید</button>' +
        '</div>' +
        '<p class="hint small">راهنمای نصب، آزمایش و ساخت APK در فایل README.md پروژه آمده است.</p>' +
        '</section>';
    });
  }

  function emblemSvg() {
    return '<svg class="brand-mark" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><use href="#fx-emblem"/></svg>';
  }

  NS.Views = NS.Views || {};
  NS.Views.settings = { title: 'تنظیمات', render: renderSettings };

  UI.registerChange('setting-select', function (el) {
    var key = el.getAttribute('data-key');
    var val = el.value;
    var patch = {};
    patch[key] = key === 'hijriOffset' ? Number(val) : val;
    NS.Store.setSettings(patch);
    if (key === 'weatherCityId') NS.Location.invalidate();
    applyAppearance();
    refresh();
  });

  UI.registerChange('setting-toggle', function (el) {
    var key = el.getAttribute('data-key');
    var patch = {};
    patch[key] = el.checked;
    var isNotifyKey = key === 'notifyPrayer' || key === 'notifyReminders' || key === 'notifyMeds';
    if (isNotifyKey && el.checked && NS.Native.isNative()) {
      NS.Native.requestPermission().then(function (p) {
        if (p !== 'granted') UI.toast('اجازه‌ی اعلان داده نشد. از تنظیمات اندروید فعال کنید.', { type: 'info' });
      });
    }
    if (isNotifyKey && el.checked && !NS.Native.isNative() &&
      'Notification' in global && global.Notification.permission === 'default') {
      global.Notification.requestPermission().then(function (p) {
        if (p !== 'granted') UI.toast('اجازه‌ی اعلان داده نشد؛ اعلان‌ها داخل برنامه نشان داده می‌شوند.', { type: 'info' });
      });
    }
    if (key === 'notifyPrayer' && el.checked && 'Notification' in global && global.Notification.permission === 'denied') {
      UI.toast('اعلان در مرورگر مسدود است. از تنظیمات سایت، اجازه‌ی اعلان را فعال کنید.', { type: 'error' });
    }
    NS.Store.setSettings(patch);
    NS.Native.requestSync();
    if (key === 'weatherEnabled' || key === 'vibrate' || key === 'dhikrSound') refresh();
  });

  UI.registerAction('set-accent', function (el) {
    NS.Store.setSettings({ accent: el.getAttribute('data-v') });
    applyAppearance();
    refresh();
  });

  UI.registerAction('ask-notify', function () {
    if (NS.Native.isNative()) {
      return NS.Native.requestPermission().then(function (p) {
        UI.toast(p === 'granted' ? 'اعلان‌های اندروید فعال شد.' : 'اجازه‌ی اعلان داده نشد. از تنظیمات اندروید فعال کنید.', { type: p === 'granted' ? 'success' : 'info' });
        refresh();
      });
    }
    if (!('Notification' in global)) {
      UI.toast('این مرورگر اعلان سیستمی ندارد. یادآورها داخل برنامه نشان داده می‌شوند.', { type: 'info' });
      return;
    }
    return global.Notification.requestPermission().then(function (p) {
      UI.toast(p === 'granted' ? 'اعلان‌ها فعال شد.' : 'اجازه‌ی اعلان داده نشد.', { type: p === 'granted' ? 'success' : 'info' });
      refresh();
    });
  });

  UI.registerAction('check-update', function () {
    return checkForUpdate().then(function (has) {
      UI.toast(has ? 'نسخه‌ی جدید در حال آماده‌سازی است؛ پیام بروزرسانی را ببینید.' : 'نسخه‌ی شما به‌روز است.', { type: 'info' });
    });
  });

  // Saves a text file. In the Android app the system share sheet opens (the WebView cannot
  // download blobs); in a browser the file is downloaded. Resolves true when the file was handed over.
  function saveText(filename, text, mime) {
    var shared = NS.Native.shareFile(filename, text);
    if (shared) {
      return shared.catch(function () {
        UI.toast('اشتراک‌گذاری انجام نشد یا لغو شد.', { type: 'info' });
        return false;
      });
    }
    var blob = new global.Blob([text], { type: mime });
    var url = global.URL.createObjectURL(blob);
    var a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    global.setTimeout(function () {
      global.URL.revokeObjectURL(url);
      a.remove();
    }, 4000);
    return Promise.resolve(true);
  }

  UI.registerAction('export-data', function () {
    return NS.Store.buildExport(APP_VERSION).then(function (obj) {
      var stamp = UI.localIsoDate(Date.now());
      return saveText('fetros-backup-' + stamp + '.json', JSON.stringify(obj, null, 2), 'application/json')
        .then(function (ok) { if (ok) UI.toast('فایل پشتیبان ساخته شد.', { type: 'success' }); });
    });
  });

  UI.registerAction('export-ics', function () {
    return Promise.all([NS.Store.getAll('events'), NS.Store.getAll('reminders')]).then(function (res) {
      var text = NS.Ics.build({ now: Date.now(), calendarName: 'فطرس', events: res[0], reminders: res[1] });
      var stamp = UI.localIsoDate(Date.now());
      return saveText('fetros-calendar-' + stamp + '.ics', text, 'text/calendar')
        .then(function (ok) { if (ok) UI.toast('فایل تقویم ساخته شد. آن را در برنامه‌ی تقویم باز کنید.', { type: 'success' }); });
    });
  });

  UI.registerChange('import-file', function (el) {
    var file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { UI.toast('فایل خیلی بزرگ است.', { type: 'error' }); return; }
    return readText(file).then(function (text) {
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) {
        UI.toast('فایل JSON معتبر نیست.', { type: 'error' });
        return;
      }
      var v = NS.Store.validateImport(parsed);
      if (!v.ok) { UI.toast(v.error, { type: 'error' }); return; }
      var total = Object.keys(v.counts).reduce(function (a, k) { return a + v.counts[k]; }, 0);
      return UI.confirm({
        title: 'وارد کردن پشتیبان',
        message: UI.num(total) + ' رکورد معتبر وارد می‌شود. رکوردهایی با شناسه‌ی یکسان به‌روز می‌شوند و بقیه حفظ می‌شوند.' +
          (v.rejected ? ' ' + UI.num(v.rejected) + ' رکورد نامعتبر نادیده گرفته می‌شود.' : ''),
        okLabel: 'وارد کن'
      }).then(function (ok) {
        if (!ok) return;
        return NS.Store.applyImport(v).then(function () {
          UI.toast('پشتیبان با موفقیت وارد شد.', { type: 'success' });
          applyAppearance();
          NS.Location.invalidate();
          refresh();
        });
      });
    });
  });

  function readText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise(function (resolve, reject) {
      var r = new global.FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('read-failed')); };
      r.readAsText(file);
    });
  }

  UI.registerAction('clear-data', function () {
    return UI.confirm({
      title: 'پاک کردن همه‌ی داده‌ها',
      message: 'همه‌ی یادداشت‌ها، وظایف، یادآورها، رویدادها، داروها، جلسه‌های ذکر، فایل اذان و تنظیمات روی این دستگاه پاک می‌شود. پیش از این، پشتیبان بگیرید. این کار قابل بازگشت نیست.',
      okLabel: 'پاک کن', danger: true
    }).then(function (ok) {
      if (!ok) return;
      return NS.Store.clearEverything().then(function () {
        try { global.localStorage.removeItem('fetros.weather.cache'); } catch (e) { /* ignore */ }
        NS.Location.invalidate();
        applyAppearance();
        UI.toast('داده‌های محلی پاک شد.', { type: 'success' });
        refresh();
      });
    });
  });

  UI.registerAction('retry-route', function () { refresh(); });

  /* ------------------------------ Splash & boot ------------------------------ */

  function hideSplash() {
    var splash = doc.getElementById('splash');
    if (!splash) return;
    splash.classList.add('done');
    global.setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 700);
  }

  function bindDelegates() {
    doc.addEventListener('click', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-action]');
      if (!el) return;
      if (el.disabled) return;
      var name = el.getAttribute('data-action');
      if (UI.runAction(name, el, ev) && el.tagName !== 'A') ev.preventDefault();
    });
    doc.addEventListener('submit', function (ev) {
      var form = ev.target;
      if (!form || !form.getAttribute || !form.getAttribute('data-submit')) return;
      ev.preventDefault();
      UI.runSubmit(form.getAttribute('data-submit'), form, ev);
    });
    doc.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute || !el.getAttribute('data-change')) return;
      UI.runChange(el.getAttribute('data-change'), el, ev);
    });
    doc.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute || !el.getAttribute('data-input')) return;
      UI.runInput(el.getAttribute('data-input'), el, ev);
    });
    doc.getElementById('fab').addEventListener('click', openQuickAdd);
    global.addEventListener('hashchange', function () { show(true); });
    global.addEventListener('online', paintOnline);
    global.addEventListener('offline', paintOnline);
    // Coming back to the app (Android resume or a browser tab) re-plans stale OS alerts.
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'visible') NS.Native.maybeSync();
    });
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { if (UI.settings().theme === 'system') applyAppearance(); };
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }
  }

  function firstRun() {
    var s = UI.settings();
    if (s.onboarded) return;
    NS.Store.setSettings({ onboarded: true });
    UI.toast('به فطرس خوش آمدید. اوقات شرعی بر اساس شهر «تهران» است؛ می‌توانید از «اوقات شرعی» شهر خود را انتخاب کنید.', {
      type: 'info', timeout: 9000
    });
  }

  function boot() {
    viewEl = doc.getElementById('view');
    applyAppearance();
    bindDelegates();
    initInstall();
    paintOnline();
    registerServiceWorker();
    var splashStart = Date.now();
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var minSplash = reduce ? 250 : 1100;

    NS.Store.init().then(function () {
      if (NS.Store.mode() === 'none') UI.toast('ذخیره‌سازی در این مرورگر در دسترس نیست.', { type: 'error' });
      if (!global.location.hash) global.history.replaceState(null, '', '#/home');
      show(false);
      firstRun();
      global.setTimeout(runChecks, 2500);
      global.setInterval(runChecks, 20000);
      var wait = Math.max(0, minSplash - (Date.now() - splashStart));
      global.setTimeout(hideSplash, wait);
    }).catch(function (err) {
      console.error(err);
      show(false);
      hideSplash();
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
