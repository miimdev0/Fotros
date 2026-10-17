/*
 * FETROS — prayer times and Qibla views (js/view-prayer.js)
 *
 * Prayer times: location selection (city, manual coordinates, or GPS),
 * calculation method, Asr rule, minute adjustments, daily table, next-prayer
 * countdown, and optional azan audio that the user provides.
 *
 * Qibla: compass dial driven by device orientation when the sensor reports
 * data. Otherwise a manual heading control is shown and the app says clearly
 * that no sensor is available.
 *
 * Exposes: registers "prayer" and "qibla" views in window.FETROS.Views.
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var UI = NS.UI;
  var P = NS.Prayer;
  var AZAN_MAX_BYTES = 8 * 1024 * 1024;

  /* ------------------------------ Prayer view ------------------------------ */

  function cityOptions(selectedId) {
    return NS.Data.cities.map(function (c) {
      return '<option value="' + UI.esc(c.id) + '"' + (c.id === selectedId ? ' selected' : '') + '>' + UI.esc(c.name) + '</option>';
    }).join('');
  }

  function methodOptions(selected) {
    return Object.keys(P.METHODS).map(function (k) {
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + UI.esc(P.METHODS[k].name) + '</option>';
    }).join('');
  }

  function timesTable(ctx) {
    var today = ctx.today;
    var nextKey = ctx.next ? ctx.next.key : null;
    var rows = today.items.map(function (it) {
      var cls = 'time-row' + (it.key === nextKey ? ' is-next' : '');
      var state = it.ms === null ? '<span class="badge badge-warn">محاسبه نشد</span>' :
        it.key === nextKey ? '<span class="badge badge-gold">بعدی</span>' :
          (it.ms < Date.now() ? '<span class="badge">گذشته</span>' : '');
      return '<li class="' + cls + '"><span class="tr-name">' + UI.esc(it.label) + '</span>' +
        '<span class="tr-time">' + (it.time ? UI.num(it.time) : '—') + '</span>' + state + '</li>';
    }).join('');
    var warn = today.warnings.length ? '<p class="notice warn small" role="note">در این عرض جغرافیایی بعضی اوقات (مثلاً فجر یا عشا در روزهای خیلی بلند یا خیلی کوتاه) قابل محاسبه نیست. روش دیگری را امتحان کنید یا نزدیک‌ترین شهر را انتخاب کنید.</p>' : '';
    return '<ul class="time-list" aria-label="اوقات شرعی امروز">' + rows + '</ul>' + warn;
  }

  function azanCard(settings, blobInfo) {
    var saved = blobInfo ? '<p class="small">فایل فعلی: <strong>' + UI.esc(blobInfo.name || 'بی‌نام') + '</strong></p>' +
      '<div class="actions-row"><button type="button" class="btn ghost sm" data-action="azan-test">' + UI.icon('play') + ' پخش نمونه</button>' +
      '<button type="button" class="btn ghost sm danger" data-action="azan-remove">' + UI.icon('trash') + ' حذف فایل</button></div>' :
      '<p class="muted small">هنوز فایل صوتی اذان انتخاب نشده است. می‌توانید فایل صوتی خودتان (MP3 یا OGG) را انتخاب کنید؛ فطرس فایل اذان را همراه خود ارائه نمی‌کند.</p>';
    return '<section class="card" aria-labelledby="azan-title"><h2 class="card-title" id="azan-title">صدای اذان</h2>' +
      '<div class="field"><label for="azan-file">انتخاب فایل صوتی از دستگاه</label>' +
      '<input type="file" id="azan-file" accept="audio/*" data-change="azan-file"></div>' + saved +
      '<label class="toggle-row"><input type="checkbox" data-change="setting-toggle" data-key="azanEnabled"' + (settings.azanEnabled ? ' checked' : '') + '>' +
      '<span>پخش خودکار اذان هنگام رسیدن وقت (فقط وقتی برنامه باز است)</span></label>' +
      '<p class="hint small">مرورگر ممکن است پخش صدا را تا وقتی یک بار روی صفحه ضربه نزنید، مجاز نداند. پخش در پس‌زمینه یا با بسته بودن برنامه تضمین نمی‌شود.</p></section>';
  }

  function renderPrayer() {
    var s = UI.settings();
    var loc = NS.Location.resolve(s);
    var ctx = NS.Location.prayerContext(new Date());
    var adj = s.adjust;
    var adjInputs = P.PRAYER_KEYS.map(function (k) {
      return '<div class="field adj"><label for="adj-' + k + '">' + UI.esc(P.PRAYER_LABELS[k]) + '</label>' +
        '<input id="adj-' + k + '" name="' + k + '" inputmode="numeric" value="' + UI.esc(UI.num(adj[k] || 0)) + '"></div>';
    }).join('');
    var gpsLabel = s.locationMode === 'gps' ? 'به‌روزرسانی موقعیت من' : 'استفاده از موقعیت من (GPS)';
    return Promise.all([NS.Store.getBlob('azan')]).then(function (r) {
      var blobInfo = r[0];
      var jdn = UI.todayJdn();
      return '<section class="page-head"><h1 class="page-title">اوقات شرعی</h1>' +
        '<p class="page-sub">محاسبه‌ی محلی بر اساس موقعیت و روش انتخابی</p></section>' +
        '<section class="card loc-card" aria-labelledby="loc-title">' +
        '<div class="card-head"><h2 class="card-title" id="loc-title">موقعیت</h2>' +
        '<span class="badge">' + UI.esc(loc.source === 'gps' ? 'GPS' : loc.source === 'custom' ? 'دستی' : 'شهر') + '</span></div>' +
        '<p class="loc-name">' + UI.esc(loc.name) + '</p>' +
        '<p class="small muted" dir="ltr">' + loc.lat.toFixed(3) + ', ' + loc.lon.toFixed(3) + ' · ' + UI.esc(loc.tz) + '</p>' +
        '<div class="field"><label for="prayer-city">انتخاب شهر</label><select id="prayer-city" data-change="prayer-city">' + cityOptions(s.cityId) + '</select></div>' +
        '<div class="actions-row"><button type="button" class="btn ghost sm" data-action="prayer-gps">' + UI.icon('location') + ' ' + gpsLabel + '</button></div>' +
        '<details class="fold"><summary>وارد کردن مختصات دستی</summary>' +
        '<form class="form-stack" data-submit="prayer-custom" novalidate>' +
        '<div class="field-row"><div class="field"><label for="c-lat">عرض جغرافیایی (−۹۰ تا ۹۰)</label><input id="c-lat" name="lat" inputmode="decimal" required></div>' +
        '<div class="field"><label for="c-lon">طول جغرافیایی (−۱۸۰ تا ۱۸۰)</label><input id="c-lon" name="lon" inputmode="decimal" required></div></div>' +
        '<div class="field"><label for="c-name">نام مکان (اختیاری)</label><input id="c-name" name="name" maxlength="80"></div>' +
        '<p class="error-text" role="alert" id="c-error"></p>' +
        '<div class="actions-row"><button type="submit" class="btn primary sm">اعمال مختصات</button></div></form></details>' +
        '</section>' +
        '<section class="card" aria-labelledby="today-title">' +
        '<div class="card-head"><h2 class="card-title" id="today-title">اوقات امروز</h2>' +
        '<span class="small muted">' + UI.esc(UI.persianLong(jdn)) + '</span></div>' +
        (ctx.today ? timesTable(ctx) : '') +
        '<div class="countdown-line small" id="prayer-next-line">' +
        (ctx.next ? 'تا ' + UI.esc(ctx.next.label) + ': <strong id="prayer-countdown" dir="ltr">' + UI.num('--:--:--') + '</strong>' : '') + '</div>' +
        '<p class="disclaimer small">این اوقات با محاسبه‌ی نجومی و روش انتخاب‌شده به دست آمده‌اند و ممکن است با اعلام مرجع تقلید یا مراجع محلی کمی اختلاف داشته باشند. روش مناسب محل خود را از مرجع معتمد بپرسید.</p>' +
        '</section>' +
        '<section class="card" aria-labelledby="method-title"><h2 class="card-title" id="method-title">روش محاسبه و تنظیمات</h2>' +
        '<div class="field"><label for="prayer-method">روش محاسبه‌ی زوایای خورشید</label><select id="prayer-method" data-change="prayer-method">' + methodOptions(s.method) + '</select></div>' +
        '<div class="field"><label for="prayer-asr">مبنای اذان ظهر و عصر (عصر)</label><select id="prayer-asr" data-change="prayer-asr">' +
        '<option value="shafi"' + (s.asr === 'shafi' ? ' selected' : '') + '>شافعی، مالکی، حنبلی (سایه‌ی برابر)</option>' +
        '<option value="hanafi"' + (s.asr === 'hanafi' ? ' selected' : '') + '>حنفی (سایه‌ی دو برابر)</option></select></div>' +
        '<form data-submit="prayer-adjust" novalidate><fieldset class="adj-grid"><legend class="small muted">تنظیم دقیقه‌ای (−۶۰ تا ۶۰ دقیقه)</legend>' + adjInputs + '</fieldset>' +
        '<p class="error-text" role="alert" id="adj-error"></p>' +
        '<div class="actions-row"><button type="submit" class="btn primary sm">ذخیره‌ی تنظیمات</button></div></form>' +
        '<p class="hint small">روش «' + UI.esc(P.METHODS[s.method] ? P.METHODS[s.method].name : '') + '» را با مرجع محلی خود مقایسه کنید. برای اطمینان بیشتر، با یک منبع معتبر محلی تطبیق دهید.</p>' +
        '</section>' +
        azanCard(s, blobInfo) +
        '<p class="hint small">ساعت‌ها بر اساس منطقه‌ی زمانی «' + UI.esc(loc.tz) + '» نمایش داده می‌شوند. دقت محاسبه حدود ۲ دقیقه در آزمون‌های مقایسه‌ای بود.</p>';
    });
  }

  function mountPrayer() {
    function tick() {
      var el = document.getElementById('prayer-countdown');
      if (!el) return;
      var ctx = NS.Location.prayerContext(new Date());
      if (!ctx.next) return;
      var remaining = ctx.next.ms - Date.now();
      if (remaining <= 0) { NS.Location.invalidate(); NS.Router.refresh(); return; }
      el.textContent = NS.HomeUI.fmtCountdown(remaining);
    }
    tick();
    UI.addTicker(tick, 1000);
  }

  // Applies a location change, then refreshes prayer data.
  function saveLocation(patch) {
    NS.Store.setSettings(patch);
    NS.Location.invalidate();
    NS.Router.refresh();
  }

  UI.registerChange('prayer-city', function (el) {
    saveLocation({ locationMode: 'city', cityId: el.value });
    UI.toast('موقعیت به ' + ((NS.Data.findCity(el.value) || {}).name || '') + ' تغییر کرد.', { type: 'success' });
  });

  UI.registerChange('prayer-method', function (el) {
    NS.Store.setSettings({ method: el.value });
    NS.Location.invalidate();
    NS.Router.refresh();
  });

  UI.registerChange('prayer-asr', function (el) {
    NS.Store.setSettings({ asr: el.value });
    NS.Location.invalidate();
    NS.Router.refresh();
  });

  UI.registerAction('prayer-gps', function () {
    UI.toast('در حال دریافت موقعیت…');
    return NS.Location.requestGps().then(function (pos) {
      var name = 'موقعیت من (' + UI.num(pos.lat.toFixed(2)) + '، ' + UI.num(pos.lon.toFixed(2)) + ')';
      saveLocation({
        locationMode: 'gps',
        customLocation: { lat: pos.lat, lon: pos.lon, name: name, tz: NS.Location.deviceTimeZone() }
      });
      UI.toast('موقعیت دستگاه ذخیره شد. فقط روی همین دستگاه نگه‌داری می‌شود.', { type: 'success' });
    });
  });

  UI.registerSubmit('prayer-custom', function (form) {
    var err = form.querySelector('#c-error');
    var lat = UI.parseNumber(form.elements.lat.value);
    var lon = UI.parseNumber(form.elements.lon.value);
    if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lon) || lon < -180 || lon > 180) {
      err.textContent = 'عرض باید بین −۹۰ و ۹۰ و طول بین −۱۸۰ و ۱۸۰ باشد.';
      return false;
    }
    err.textContent = '';
    var name = String(form.elements.name.value || '').trim() || 'مختصات دستی';
    saveLocation({
      locationMode: 'custom',
      customLocation: { lat: lat, lon: lon, name: name, tz: NS.Location.deviceTimeZone() }
    });
    UI.toast('مختصات ذخیره شد.', { type: 'success' });
    return false;
  });

  UI.registerSubmit('prayer-adjust', function (form) {
    var err = form.querySelector('#adj-error');
    var adjust = {};
    for (var i = 0; i < P.PRAYER_KEYS.length; i++) {
      var k = P.PRAYER_KEYS[i];
      var n = UI.parseNumber(form.elements[k].value || '0');
      if (!isFinite(n) || n < -60 || n > 60 || Math.round(n) !== n) {
        err.textContent = 'عدد «' + P.PRAYER_LABELS[k] + '» باید عدد صحیح بین −۶۰ و ۶۰ باشد.';
        return false;
      }
      adjust[k] = n;
    }
    err.textContent = '';
    NS.Store.setSettings({ adjust: adjust });
    NS.Location.invalidate();
    UI.toast('تنظیمات اوقات ذخیره شد.', { type: 'success' });
    NS.Router.refresh();
    return false;
  });

  UI.registerChange('azan-file', function (el) {
    var file = el.files && el.files[0];
    if (!file) return;
    if (file.size > AZAN_MAX_BYTES) {
      UI.toast('حجم فایل بیشتر از ۸ مگابایت است.', { type: 'error' });
      el.value = '';
      return;
    }
    if (file.type && file.type.indexOf('audio/') !== 0) {
      UI.toast('فقط فایل صوتی انتخاب کنید.', { type: 'error' });
      el.value = '';
      return;
    }
    return NS.Store.putBlob('azan', file, { name: file.name, type: file.type }).then(function () {
      UI.toast('فایل اذان ذخیره شد.', { type: 'success' });
      NS.Router.refresh();
    }).catch(function () {
      UI.toast('ذخیره‌ی فایل صوتی ممکن نیست. مرورگر این امکان را نمی‌دهد.', { type: 'error' });
    });
  });

  UI.registerAction('azan-test', function () {
    return NS.Azan.playSaved().then(function (ok) {
      if (!ok) UI.toast('فایلی برای پخش موجود نیست.', { type: 'error' });
    });
  });

  UI.registerAction('azan-remove', function () {
    return UI.confirm({ title: 'حذف فایل اذان', message: 'فایل صوتی اذان از این دستگاه پاک شود؟', okLabel: 'حذف', danger: true })
      .then(function (ok) {
        if (!ok) return;
        return NS.Store.removeBlob('azan').then(function () {
          UI.toast('فایل اذان حذف شد.');
          NS.Router.refresh();
        });
      });
  });

  /* ------------------------------ Azan playback ------------------------------ */

  var azanUrl = null;
  var azanAudio = null;

  // Plays the saved azan file. Resolves false when there is no file.
  function playSavedAzan() {
    return NS.Store.getBlob('azan').then(function (rec) {
      if (!rec || !rec.blob) return false;
      if (azanUrl) global.URL.revokeObjectURL(azanUrl);
      azanUrl = global.URL.createObjectURL(rec.blob);
      if (azanAudio) azanAudio.pause();
      azanAudio = new global.Audio(azanUrl);
      return azanAudio.play().then(function () { return true; }).catch(function () {
        UI.toast('مرورگر پخش صدا را مسدود کرد. یک بار روی صفحه ضربه بزنید و دوباره امتحان کنید.', { type: 'error' });
        return true;
      });
    });
  }

  NS.Azan = { playSaved: playSavedAzan };

  /* ------------------------------ Qibla view ------------------------------ */

  var qibla = {
    sensor: 'unknown', // unknown | listening | none | denied | absolute | relative
    heading: null,
    manual: 0,
    attached: false,
    lastEvent: 0,
    checkTimer: null,
    raf: 0
  };

  function headingFromEvent(e) {
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
      return { value: e.webkitCompassHeading, absolute: true };
    }
    if (typeof e.alpha !== 'number' || isNaN(e.alpha)) return null;
    return { value: (360 - e.alpha) % 360, absolute: e.absolute === true };
  }

  function onOrientation(e) {
    var h = headingFromEvent(e);
    if (!h) return;
    qibla.lastEvent = Date.now();
    qibla.heading = h.value;
    qibla.sensor = h.absolute ? 'absolute' : 'relative';
    scheduleDraw();
  }

  function attachSensors() {
    if (qibla.attached) return;
    if (!('DeviceOrientationEvent' in global)) {
      qibla.sensor = 'none';
      return;
    }
    global.addEventListener('deviceorientationabsolute', onOrientation);
    global.addEventListener('deviceorientation', onOrientation);
    qibla.attached = true;
    qibla.sensor = 'listening';
    qibla.checkTimer = global.setTimeout(function () {
      if (Date.now() - qibla.lastEvent > 2500 || !qibla.lastEvent) {
        qibla.sensor = 'none';
        drawStatus();
      }
    }, 2600);
  }

  function detachSensors() {
    if (!qibla.attached) return;
    global.removeEventListener('deviceorientationabsolute', onOrientation);
    global.removeEventListener('deviceorientation', onOrientation);
    qibla.attached = false;
    if (qibla.checkTimer) global.clearTimeout(qibla.checkTimer);
  }

  function scheduleDraw() {
    if (qibla.raf) return;
    qibla.raf = global.requestAnimationFrame(function () {
      qibla.raf = 0;
      drawDial();
      drawStatus();
    });
  }

  function currentHeading() {
    if (qibla.sensor === 'absolute' || qibla.sensor === 'relative') return qibla.heading;
    return qibla.manual;
  }

  function drawDial() {
    var dial = document.getElementById('compass-dial');
    var needle = document.getElementById('qibla-needle');
    if (!dial || !needle) return;
    var loc = NS.Location.resolve();
    var bearing = P.qiblaBearing(loc.lat, loc.lon);
    var h = currentHeading() || 0;
    dial.style.transform = 'rotate(' + (-h) + 'deg)';
    needle.style.transform = 'rotate(' + (bearing - h) + 'deg)';
    var big = document.getElementById('qibla-deg');
    if (big) big.textContent = UI.num(bearing.toFixed(1));
    var hd = document.getElementById('heading-val');
    if (hd) hd.textContent = UI.num(Math.round(h));
  }

  function drawStatus() {
    var el = document.getElementById('sensor-status');
    if (!el) return;
    var msgs = {
      unknown: 'در حال بررسی حسگر…',
      listening: 'در انتظار داده‌ی حسگر…',
      absolute: 'حسگر جهت‌یابی فعال است؛ جهت نسبت به شمال واقعی است.',
      relative: 'حسگر فعال است ولی جهت نسبی است؛ دقت جهت‌یابی کم است و کالیبراسیون لازم است.',
      none: 'این دستگاه حسگر جهت‌یابی ندارد یا مرورگر آن را گزارش نمی‌کند. از تنظیم دستی استفاده کنید.',
      denied: 'دسترسی به حسگر داده نشد. می‌توانید از تنظیم دستی استفاده کنید.'
    };
    el.textContent = msgs[qibla.sensor] || msgs.unknown;
    el.className = 'sensor-status s-' + qibla.sensor;
    var manual = document.getElementById('manual-block');
    if (manual) manual.hidden = qibla.sensor === 'absolute' || qibla.sensor === 'relative';
  }

  function renderQibla() {
    var s = UI.settings();
    var loc = NS.Location.resolve(s);
    var bearing = P.qiblaBearing(loc.lat, loc.lon);
    var km = P.kaabaDistanceKm(loc.lat, loc.lon);
    var ticks = '';
    for (var deg = 0; deg < 360; deg += 15) {
      var major = deg % 90 === 0;
      ticks += '<line x1="50" y1="' + (major ? 4 : 6) + '" x2="50" y2="' + (major ? 13 : 10) + '" transform="rotate(' + deg + ' 50 50)" class="' + (major ? 'tick-major' : 'tick') + '"/>';
    }
    var dial = '<svg class="compass" viewBox="0 0 100 100" role="img" aria-label="قطب‌نمای قبله">' +
      '<g id="compass-dial" class="dial">' +
      '<circle cx="50" cy="50" r="46" class="dial-face"/>' + ticks +
      '<text x="50" y="22" class="dial-n" text-anchor="middle">ش</text>' +
      '<text x="50" y="84" class="dial-s" text-anchor="middle">ج</text>' +
      '<text x="18" y="54" class="dial-w" text-anchor="middle">غ</text>' +
      '<text x="82" y="54" class="dial-e" text-anchor="middle">ق</text>' +
      '</g>' +
      '<g id="qibla-needle" class="needle"><path d="M50 14 L56 50 L50 58 L44 50 Z" class="needle-body"/>' +
      '<circle cx="50" cy="50" r="3" class="needle-hub"/></g>' +
      '</svg>';
    return '<section class="page-head"><h1 class="page-title">قبله‌نما</h1>' +
      '<p class="page-sub">جهت کعبه از موقعیت شما</p></section>' +
      '<section class="card qibla-card" aria-labelledby="qibla-title">' +
      '<h2 class="card-title sr-only" id="qibla-title">قبله‌نما</h2>' +
      '<div class="compass-wrap">' + dial + '<div class="compass-pointer" aria-hidden="true"></div></div>' +
      '<p class="qibla-big"><span id="qibla-deg">' + UI.num(bearing.toFixed(1)) + '</span>° <span class="muted small">از شمال حقیقی</span></p>' +
      '<p class="small muted">فاصله‌ی تقریبی تا مکه: ' + UI.num(String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u066C')) + ' کیلومتر · موقعیت: ' + UI.esc(loc.name) + '</p>' +
      '<p id="sensor-status" class="sensor-status s-unknown" role="status" aria-live="polite">در حال بررسی حسگر…</p>' +
      '<div id="manual-block" class="manual-block">' +
      '<label for="manual-heading" class="small">جهت فعلی بالای گوشی (تنظیم دستی): <strong id="heading-val">' + UI.num(qibla.manual) + '</strong>°</label>' +
      '<input type="range" id="manual-heading" min="0" max="359" value="' + qibla.manual + '" data-input="manual-heading" aria-describedby="sensor-status">' +
      '<p class="hint small">با یک قطب‌نمای فیزیکی، عددی را که به سمت شمال واقعی نشان می‌دهد تنظیم کنید. این حالت دقیق نیست و فقط کمک‌دهنده است.</p></div>' +
      '<div class="actions-row"><button type="button" class="btn ghost sm" data-action="qibla-enable">' + UI.icon('compass') + ' فعال‌سازی حسگر</button>' +
      '<a class="btn ghost sm" href="#/prayer">تغییر موقعیت</a></div>' +
      '</section>' +
      '<section class="card" aria-labelledby="cal-title"><h2 class="card-title" id="cal-title">کالیبراسیون و راهنما</h2>' +
      '<ul class="bullets small">' +
      '<li>گوشی را از دور از فلز، آهن‌ربا و بلندگو نگه دارید.</li>' +
      '<li>اگر عقربه بی‌ثبات است، گوشی را در هوای ۸ شکلی (∞) چند بار تکان دهید تا حسگر کالیبره شود.</li>' +
      '<li>در ساختمان‌های فلزی یا نزدیک خودرو، جهت‌یابی ممکن است نادرست باشد.</li>' +
      '<li>نتیجه‌ی این قبله‌نما تقریبی است؛ برای جهت دقیق‌تر از قبله‌نمای فیزیکی یا نقشه‌ی معتبر کمک بگیرید.</li>' +
      '</ul></section>';
  }

  function mountQibla() {
    qibla.manual = qibla.manual || 0;
    qibla.sensor = 'unknown';
    qibla.heading = null;
    qibla.lastEvent = 0;
    attachSensors();
    if (!('DeviceOrientationEvent' in global)) qibla.sensor = 'none';
    drawStatus();
    drawDial();
    if (qibla.sensor === 'listening') {
      global.setTimeout(drawStatus, 2700);
    }
  }

  function unmountQibla() {
    detachSensors();
    if (qibla.raf) global.cancelAnimationFrame(qibla.raf);
    qibla.raf = 0;
  }

  UI.registerInput('manual-heading', function (el) {
    qibla.manual = +el.value;
    var hv = document.getElementById('heading-val');
    if (hv) hv.textContent = UI.num(qibla.manual);
    drawDial();
  });

  UI.registerAction('qibla-enable', function () {
    var DOE = global.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      return DOE.requestPermission().then(function (state) {
        if (state !== 'granted') { qibla.sensor = 'denied'; drawStatus(); return; }
        detachSensors();
        attachSensors();
        drawStatus();
      }).catch(function () {
        qibla.sensor = 'denied';
        drawStatus();
      });
    }
    detachSensors();
    attachSensors();
    drawStatus();
    return null;
  });

  NS.Views = NS.Views || {};
  NS.Views.prayer = {
    title: 'اوقات شرعی',
    render: renderPrayer,
    mount: mountPrayer
  };
  NS.Views.qibla = {
    title: 'قبله‌نما',
    render: function () { return Promise.resolve(renderQibla()); },
    mount: mountQibla,
    unmount: unmountQibla
  };

  NS.PrayerUI = { playSavedAzan: playSavedAzan };
})(typeof window !== 'undefined' ? window : globalThis);
