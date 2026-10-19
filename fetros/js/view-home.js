/*
 * FETROS — dashboard view (js/view-home.js)
 *
 * Today's dates in three calendars, live clock, next prayer countdown,
 * occasions and personal events for today, task summary, quick note and
 * quick reminder forms, cached weather (only when real data exists), and a
 * compact month preview.
 *
 * Exposes: registers the "home" view in window.FETROS.Views.
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var UI = NS.UI;
  var Cal = NS.Calendar;

  function greeting(now) {
    var h = now.getHours();
    if (h >= 5 && h < 11) return 'صبح بخیر';
    if (h >= 11 && h < 16) return 'ظهر بخیر';
    if (h >= 16 && h < 19) return 'عصر بخیر';
    return 'شب بخیر';
  }

  function fmtCountdown(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var hh = Math.floor(total / 3600);
    var mm = Math.floor((total % 3600) / 60);
    var ss = total % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return UI.num(p(hh) + ':' + p(mm) + ':' + p(ss));
  }

  // Renders text as spans; characters that change are animated with the "flip" class.
  function setFlipText(el, text) {
    if (!el) return;
    var prev = el.getAttribute('data-text') || '';
    if (prev === text) return;
    var html = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var changed = prev.charAt(i) !== ch && prev.length === text.length;
      html += '<span class="digit' + (changed ? ' flip' : '') + '">' + UI.esc(ch) + '</span>';
    }
    el.innerHTML = html;
    el.setAttribute('data-text', text);
  }

  function todayTasksSummary(tasks, todayIso) {
    var todays = tasks.filter(function (t) { return t.due === todayIso; });
    var done = todays.filter(function (t) { return t.done; }).length;
    var open = tasks.filter(function (t) {
      return !t.done && (t.due === '' || t.due <= todayIso);
    }).sort(function (a, b) {
      if (a.due !== b.due) return a.due === '' ? 1 : b.due === '' ? -1 : (a.due < b.due ? -1 : 1);
      return a.createdAt - b.createdAt;
    });
    var overdue = tasks.filter(function (t) { return !t.done && t.due && t.due < todayIso; }).length;
    return { total: todays.length, done: done, open: open, overdue: overdue };
  }

  function prayerBlock(ctx) {
    if (!ctx || !ctx.today) return '';
    var items = ctx.today.items.map(function (it) {
      var isNext = ctx.next && it.key === ctx.next.key && it.ms === ctx.next.ms;
      return '<li class="pchip' + (isNext ? ' is-next' : '') + (it.ms === null ? ' is-na' : '') + '">' +
        '<span class="pname">' + UI.esc(it.label) + '</span>' +
        '<span class="ptime">' + (it.time ? UI.num(it.time) : '—') + '</span></li>';
    }).join('');
    return '<ul class="prayer-strip" aria-label="اوقات امروز">' + items + '</ul>';
  }

  function nextPrayerCard(ctx) {
    var head = '<div class="np-head"><span class="np-label">اذان بعدی</span>' +
      '<span class="np-place">' + UI.esc(ctx.loc.name) + '</span></div>';
    if (!ctx.next) {
      return '<section class="card np-card" aria-labelledby="np-title">' + head +
        '<h2 class="np-name" id="np-title">اوقات امروز در دسترس نیست</h2>' +
        '<p class="muted small">برای این موقعیت، زمان یک یا چند نماز محاسبه نشد. موقعیت یا روش محاسبه را در «اوقات شرعی» بررسی کنید.</p>' +
        '<div class="actions-row"><a class="btn ghost" href="#/prayer">اوقات شرعی</a></div></section>';
    }
    return '<section class="card np-card" aria-labelledby="np-title">' + head +
      '<h2 class="np-name" id="np-title">' + UI.esc(ctx.next.label) + ' <span class="np-at">ساعت ' + UI.num(ctx.next.time) + '</span></h2>' +
      '<div class="countdown" id="np-count" role="timer" aria-live="off" aria-label="زمان باقی‌مانده">' + '</div>' +
      '<p class="np-foot small muted">تا اذان؛ محاسبه بر اساس روش «' + UI.esc(ctx.today.methodName) + '»</p>' +
      prayerBlock(ctx) + '</section>';
  }

  function occasionsCard(jdn, events) {
    var ag = NS.CalendarUI.agendaOn(jdn, events);
    var list = ag.occasions.map(function (o) {
      return '<li class="occ-item' + (o.holiday ? ' is-holiday' : '') + '"><span class="occ-dot"></span>' +
        '<span class="occ-title">' + UI.esc(o.title) + '</span>' +
        (o.holiday ? '<span class="badge badge-warn">تعطیل</span>' : '') + '</li>';
    }).concat(ag.events.map(function (ev) {
      return '<li class="event-item"><span class="occ-dot ev"></span><span class="occ-title">' + UI.esc(ev.title) + '</span>' +
        '<span class="badge">' + (ev.kind === 'birthday' ? 'تولد' : ev.kind === 'anniversary' ? 'سالگرد' : 'رویداد') + '</span></li>';
    }));
    var body = list.length ? '<ul class="plain-list">' + list.join('') + '</ul>' :
      UI.emptyState('calendar', 'امروز مناسبتی ندارد', 'مناسبت رسمی یا رویداد شخصی برای امروز ثبت نشده است. از تقویم می‌توانید رویداد اضافه کنید.');
    return '<section class="card" aria-labelledby="occ-title"><div class="card-head"><h2 class="card-title" id="occ-title">مناسبت‌های امروز</h2>' +
      '<a class="link-btn" href="#/calendar">تقویم</a></div>' + body +
      '<p class="hint small">فهرست مناسبت‌ها نمونه است؛ جزئیات در صفحه‌ی تقویم.</p></section>';
  }

  function tasksCard(sum, todayIso) {
    var rows = sum.open.slice(0, 4).map(function (t) {
      var overdue = t.due && t.due < todayIso;
      return '<li class="task-row' + (t.done ? ' is-done' : '') + '">' +
        '<label class="check"><input type="checkbox" data-change="home-task-toggle" data-id="' + UI.esc(t.id) + '"' + (t.done ? ' checked' : '') + '>' +
        '<span class="check-ui" aria-hidden="true">' + UI.icon('check') + '</span>' +
        '<span class="task-text">' + UI.esc(t.title) + '</span></label>' +
        (overdue ? '<span class="badge badge-danger">عقب‌افتاده</span>' : '') + '</li>';
    }).join('');
    var pct = UI.pct(sum.done, sum.total);
    return '<section class="card" aria-labelledby="tasks-title"><div class="card-head"><h2 class="card-title" id="tasks-title">کارهای امروز</h2>' +
      '<a class="link-btn" href="#/organizer/tasks">همه‌ی کارها</a></div>' +
      '<div class="task-summary"><div class="progress-line" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="پیشرفت کارهای امروز">' +
      '<span style="transform: scaleX(' + (pct / 100) + ')"></span></div>' +
      '<p class="small">' + UI.num(sum.done) + ' از ' + UI.num(sum.total) + ' کار امروز انجام شد' +
      (sum.overdue ? ' · <span class="text-danger">' + UI.num(sum.overdue) + ' کار عقب‌افتاده</span>' : '') + '</p></div>' +
      (rows ? '<ul class="plain-list task-list">' + rows + '</ul>' :
        UI.emptyState('task', 'کار بازی ندارید', 'برای امروز کاری ثبت نشده است. یک کار کوتاه اضافه کنید.')) +
      '<form class="inline-form" data-submit="quick-task" novalidate><label class="sr-only" for="qt-title">عنوان کار سریع</label>' +
      '<input id="qt-title" name="title" maxlength="200" placeholder="افزودن کار برای امروز" autocomplete="off">' +
      '<button type="submit" class="btn primary sm">افزودن</button></form></section>';
  }

  function quickNoteCard() {
    return '<section class="card" aria-labelledby="qn-title"><h2 class="card-title" id="qn-title">یادداشت سریع</h2>' +
      '<form class="form-stack" data-submit="quick-note" novalidate>' +
      '<label class="sr-only" for="qn-body">متن یادداشت</label>' +
      '<textarea id="qn-body" name="body" rows="2" maxlength="5000" placeholder="ایده یا نکته‌ای را همین‌جا بنویسید…"></textarea>' +
      '<div class="actions-row"><span class="hint small">در ذخیره‌سازی محلی ثبت می‌شود.</span>' +
      '<button type="submit" class="btn primary sm">ذخیره</button></div></form></section>';
  }

  function quickReminderCard() {
    var suggest = UI.toLocalInput(Date.now() + 60 * 60 * 1000);
    return '<section class="card" aria-labelledby="qr-title"><h2 class="card-title" id="qr-title">یادآور سریع</h2>' +
      '<form class="form-stack" data-submit="quick-reminder" novalidate>' +
      '<div class="field"><label for="qr-title-in">متن یادآور</label><input id="qr-title-in" name="title" maxlength="200" placeholder="مثلاً خرید نان"></div>' +
      '<div class="field"><label for="qr-due">زمان</label><input id="qr-due" type="datetime-local" name="due" value="' + suggest + '"></div>' +
      '<p class="error-text" role="alert" id="qr-error"></p>' +
      '<div class="actions-row"><span class="hint small">یادآورها هنگام باز بودن برنامه نمایش داده می‌شوند.</span>' +
      '<button type="submit" class="btn primary sm">ثبت یادآور</button></div></form></section>';
  }

  function weatherCard() {
    var s = UI.settings();
    var cache = NS.Weather && NS.Weather.cached();
    if (!s.weatherEnabled || !cache || cache.cityId !== s.weatherCityId || !cache.data || !cache.data.current) return '';
    var c = cache.data.current;
    return '<section class="card weather-mini" aria-labelledby="wm-title"><div class="card-head"><h2 class="card-title" id="wm-title">هوای ' + UI.esc(cache.cityName) + '</h2>' +
      '<a class="link-btn" href="#/weather">جزئیات</a></div>' +
      '<div class="weather-row"><div class="weather-temp">' + UI.num(Math.round(c.temp)) + '°</div>' +
      '<div><div>' + UI.esc(NS.Weather.describe(c.code)) + '</div>' +
      '<div class="small muted">رطوبت ' + UI.num(Math.round(c.humidity)) + '٪ · باد ' + UI.num(Math.round(c.wind)) + ' کیلومتر بر ساعت</div></div></div>' +
      '<p class="small muted">آخرین بروزرسانی: ' + UI.esc(NS.Weather.fmtTime(cache.fetchedAt)) + ' · داده‌ها: Open-Meteo (CC BY 4.0)</p></section>';
  }

  function miniCalendarCard(jdn, events) {
    return '<section class="card mini-cal" aria-labelledby="mc-title"><div class="card-head"><h2 class="card-title" id="mc-title">نمای ماه</h2>' +
      '<a class="link-btn" href="#/calendar" data-action="home-open-calendar">تقویم کامل</a></div>' +
      NS.CalendarUI.miniGrid(jdn, events) + '</section>';
  }

  function heroStats(jdn, events, openCount) {
    var ag = NS.CalendarUI.agendaOn(jdn, events);
    var occ = ag.occasions.length + ag.events.length;
    return '<div class="hero-stats" aria-label="خلاصه‌ی امروز">' +
      '<div class="hero-stat"><span class="stat-num" data-count="' + openCount + '">' + UI.num(openCount) + '</span><span class="small muted">کار باز</span></div>' +
      '<div class="hero-stat"><span class="stat-num" data-count="' + occ + '">' + UI.num(occ) + '</span><span class="small muted">مناسبت و رویداد امروز</span></div>' +
      '</div>';
  }

  /* Feature showcase: a scroll-snap carousel. Each card opens the lightbox. */
  function featuresSection() {
    var list = (NS.Data && NS.Data.features) || [];
    if (!list.length || !NS.Fx) return '';
    var cards = list.map(function (f, i) {
      return '<button type="button" class="feature-card tilt" data-lightbox="' + i + '" aria-label="' + UI.esc(f.title) + '؛ نمایش بزرگ">' +
        NS.Fx.art(f.art) +
        '<span class="fc-title">' + UI.esc(f.title) + '</span>' +
        '<span class="fc-short">' + UI.esc(f.short) + '</span>' +
        '<span class="fc-more">برای دیدن جزئیات ضربه بزنید</span></button>';
    }).join('');
    return '<section class="showcase" aria-labelledby="fx-title" data-reveal>' +
      '<div class="card-head"><h2 class="card-title" id="fx-title">امکانات فطرس</h2>' +
      '<span class="hint small">' + UI.num(list.length) + ' امکان اصلی</span></div>' +
      '<div class="carousel"><div class="carousel-track" role="region" tabindex="0" aria-label="فهرست امکانات فطرس">' + cards + '</div>' +
      '<div class="carousel-controls">' +
      '<button type="button" class="carousel-btn" data-carousel-dir="-1" aria-label="امکان قبلی"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg></button>' +
      '<span class="carousel-hint small">با کشیدن یا دکمه‌ها جابه‌جا کنید</span>' +
      '<button type="button" class="carousel-btn" data-carousel-dir="1" aria-label="امکان بعدی"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '</div></div></section>';
  }

  function ctaCard() {
    return '<section class="cta-card" aria-labelledby="cta-title" data-reveal>' +
      '<h2 id="cta-title">فطرس را روی گوشی نصب کنید</h2>' +
      '<p class="small">نسخه‌ی وب را مثل یک برنامه روی صفحه‌ی اصلی بیاورید. اگر دکمه‌ی نصب آماده نبود، راهنما را ببینید.</p>' +
      '<div class="cta-actions"><button type="button" class="btn primary magnetic" data-action="install-app">نصب فطرس</button>' +
      '<a class="btn ghost" href="#/settings">تنظیمات و پشتیبان</a></div></section>';
  }

  function footerCard() {
    return '<footer class="site-footer" aria-label="پاورقی">' +
      '<div class="foot-brand"><svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><use href="#fx-emblem"/></svg><span>فطرس</span></div>' +
      '<p>تقویم شمسی، میلادی و قمری، اوقات شرعی، قبله‌نما و یادآورها؛ بدون حساب کاربری و بدون تبلیغ.</p>' +
      '<ul><li><a href="#/settings">حریم خصوصی و پشتیبان‌گیری</a></li><li><a href="#/organizer/reminders">یادآورها</a></li>' +
      '<li><a href="#/weather">هواشناسی</a></li><li><a href="#/prayer">اوقات شرعی</a></li></ul>' +
      '<p class="small">نسخه ' + UI.num(NS.APP_VERSION || '') + ' · داده‌های مناسبت‌ها نمونه است و برای تأیید رسمی به منابع معتبر مراجعه کنید.</p></footer>';
  }

  function render() {
    var now = new Date();
    var jdn = UI.todayJdn();
    var p = Cal.jdnToPersian(jdn);
    return Promise.all([NS.Store.getAll('events'), NS.Store.getAll('tasks')]).then(function (res) {
      var events = res[0], tasks = res[1];
      var ctx = NS.Location.prayerContext(now);
      var todayIso = UI.localIsoDate(now.getTime());
      var sum = todayTasksSummary(tasks, todayIso);
      var storageNote = NS.Store.mode() === 'localstorage'
        ? '<div class="notice warn" role="status">پایگاه‌داده‌ی مرورگر در دسترس نیست؛ داده‌ها با حجم محدودتری در حافظه‌ی مرورگر ذخیره می‌شوند.</div>' : '';
      return '<section class="hero" aria-label="تاریخ امروز">' +
        '<div class="sun-scene" aria-hidden="true"><span class="sun"></span><span class="sun-glow"></span><span class="horizon"></span>' +
        '<span class="particle p1"></span><span class="particle p2"></span><span class="particle p3"></span><span class="particle p4"></span><span class="particle p5"></span></div>' +
        '<div class="hero-inner">' +
        '<div class="hero-top"><span class="greet">' + greeting(now) + '</span>' +
        '<span class="hero-clock" id="home-clock" dir="ltr">' + UI.clockOf(now.getTime()) + '</span></div>' +
        '<div class="hero-weekday">' + UI.esc(UI.weekdayName(jdn)) + '</div>' +
        '<div class="hero-persian">' + UI.esc(UI.num(p.d) + ' ' + Cal.PERSIAN_MONTHS[p.m - 1] + ' ' + UI.num(p.y)) + '</div>' +
        '<div class="hero-sub">' + UI.esc(UI.gregorianLong(jdn)) + ' · ' + UI.esc(UI.hijriLong(jdn)) + '</div>' +
        heroStats(jdn, events, sum.open.length) +
        '</div></section>' +
        storageNote +
        nextPrayerCard(ctx) +
        '<div class="grid-two">' + occasionsCard(jdn, events) + tasksCard(sum, todayIso) + '</div>' +
        '<div class="grid-two">' + quickNoteCard() + quickReminderCard() + '</div>' +
        weatherCard() +
        miniCalendarCard(jdn, events) +
        featuresSection() + ctaCard() + footerCard();
    });
  }

  function mount(root) {
    var lastCount = null;
    function tick() {
      var now = new Date();
      var clock = document.getElementById('home-clock');
      if (clock) clock.textContent = UI.clockOf(now.getTime());
      var box = document.getElementById('np-count');
      if (!box) return;
      var ctx = NS.Location.prayerContext(now);
      if (!ctx.next) return;
      var remaining = ctx.next.ms - now.getTime();
      if (remaining <= 0) {
        NS.Location.invalidate();
        if (NS.Router) NS.Router.refresh();
        return;
      }
      var txt = fmtCountdown(remaining);
      setFlipText(box, txt);
      lastCount = txt;
    }
    tick();
    UI.addTicker(tick, 1000);
    void lastCount;
    void root;
  }

  /* ------------------------------ Actions ------------------------------ */

  UI.registerChange('home-task-toggle', function (el) {
    return NS.Store.getAll('tasks').then(function (list) {
      var t = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (!t) return;
      var next = NS.Store.sanitizers.tasks(Object.assign({}, t, {
        done: el.checked, completedAt: el.checked ? Date.now() : null
      }));
      return NS.Store.put('tasks', next).then(function () {
        UI.toast(el.checked ? 'کار انجام شد.' : 'کار دوباره باز شد.', { type: 'success' });
        NS.Router.refresh();
      });
    });
  });

  UI.registerSubmit('quick-task', function (form) {
    var title = String(form.elements.title.value || '').trim();
    if (!title) { UI.toast('متن کار را وارد کنید.', { type: 'error' }); return false; }
    var rec = NS.Store.sanitizers.tasks({
      id: NS.Store.newId(), title: title, done: false,
      due: UI.localIsoDate(Date.now()), priority: 'normal', createdAt: Date.now()
    });
    return NS.Store.put('tasks', rec).then(function () {
      UI.toast('کار به فهرست امروز اضافه شد.', { type: 'success' });
      NS.Router.refresh();
      return false;
    });
  });

  UI.registerSubmit('quick-note', function (form) {
    var body = String(form.elements.body.value || '').trim();
    if (!body) { UI.toast('متن یادداشت خالی است.', { type: 'error' }); return false; }
    var rec = NS.Store.sanitizers.notes({
      id: NS.Store.newId(), title: body.split('\n')[0].slice(0, 60) || 'یادداشت سریع', body: body,
      favorite: false, createdAt: Date.now(), updatedAt: Date.now()
    });
    return NS.Store.put('notes', rec).then(function () {
      UI.toast('یادداشت ذخیره شد.', { type: 'success' });
      form.reset();
      return false;
    });
  });

  UI.registerSubmit('quick-reminder', function (form) {
    var title = String(form.elements.title.value || '').trim();
    var due = UI.fromLocalInput(form.elements.due.value);
    var err = form.querySelector('#qr-error');
    if (!title) { err.textContent = 'متن یادآور را وارد کنید.'; return false; }
    if (due === null) { err.textContent = 'زمان معتبر وارد کنید.'; return false; }
    if (due <= Date.now()) { err.textContent = 'زمان یادآور باید در آینده باشد.'; return false; }
    err.textContent = '';
    var rec = NS.Store.sanitizers.reminders({
      id: NS.Store.newId(), title: title, dueAt: due, recur: 'none', done: false, createdAt: Date.now()
    });
    return NS.Store.put('reminders', rec).then(function () {
      UI.toast('یادآور ثبت شد.', { type: 'success' });
      NS.Router.refresh();
      return false;
    });
  });

  UI.registerAction('home-open-calendar', function () { return null; });

  NS.Views = NS.Views || {};
  NS.Views.home = {
    title: 'خانه',
    render: render,
    mount: mount
  };

  NS.HomeUI = { setFlipText: setFlipText, fmtCountdown: fmtCountdown };
})(typeof window !== 'undefined' ? window : globalThis);
