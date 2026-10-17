/*
 * FETROS — calendar view (js/view-calendar.js)
 *
 * Month grid (Persian / Gregorian / Hijri), selected-day details, personal
 * events (birthdays, anniversaries), occasion search and a date converter.
 * Week starts on Saturday, the usual week start in Iran.
 *
 * Exposes: window.FETROS.CalendarUI and registers the "calendar" view.
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var Cal = NS.Calendar;
  var UI = NS.UI;
  var CAL = Cal.CAL;

  var state = {
    cal: CAL.PERSIAN,
    y: null,
    m: null,
    selected: null,
    query: '',
    convFrom: CAL.PERSIAN,
    convInput: null,
    convResult: null
  };

  function ensureState() {
    if (state.selected === null) {
      var t = UI.todayJdn();
      state.selected = t;
      var p = Cal.jdnToPersian(t);
      state.y = p.y;
      state.m = p.m;
      state.convInput = { y: p.y, m: p.m, d: p.d };
    }
  }

  /* ------------------------------ Agenda helpers ------------------------------ */

  // True when a personal event falls on jdn.
  function eventOccursOn(ev, jdn) {
    var base = Cal.isoToJdn(ev.date);
    if (base === null) return false;
    if (ev.recur === 'none' || !ev.recur) return jdn === base;
    if (jdn < base) return false;
    if (ev.recur === 'yearly-persian') {
      var p = Cal.jdnToPersian(jdn), bp = Cal.jdnToPersian(base);
      return p.m === bp.m && p.d === bp.d;
    }
    if (ev.recur === 'yearly-gregorian') {
      var g = Cal.jdnToGregorian(jdn), bg = Cal.jdnToGregorian(base);
      return g.m === bg.m && g.d === bg.d;
    }
    return false;
  }

  // Occasions (dataset) and personal events for one day.
  function agendaOn(jdn, events) {
    var offset = UI.settings().hijriOffset;
    var occ = Cal.occasionsOn(jdn, NS.Data.occasions.items, offset);
    var evs = (events || []).filter(function (ev) { return eventOccursOn(ev, jdn); });
    return { occasions: occ, events: evs };
  }

  // Next day (within maxDays) where predicate(jdn) is true. Returns jdn or null.
  function nextOccurrence(predicate, startJdn, maxDays) {
    for (var i = 0; i <= maxDays; i++) {
      if (predicate(startJdn + i)) return startJdn + i;
    }
    return null;
  }

  /* ------------------------------ Grid ------------------------------ */

  // Renders one month as a grid. Returns HTML.
  function monthGrid(cal, y, m, opts) {
    var o = opts || {};
    var offset = UI.settings().hijriOffset;
    var first = Cal.toJdn(cal, y, m, 1, offset);
    var len = Cal.daysInMonth(cal, y, m, offset);
    var startCol = (Cal.weekdayOf(first) + 1) % 7; // Saturday = 0
    var events = o.events || [];
    var today = o.today;
    var html = '<div class="cal-weekdays" aria-hidden="true">' +
      ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(function (w) { return '<span>' + w + '</span>'; }).join('') +
      '</div><div class="cal-grid" role="grid" aria-label="روزهای ماه">';
    var c;
    for (c = 0; c < startCol; c++) html += '<span class="day-cell blank" aria-hidden="true"></span>';
    for (var d = 1; d <= len; d++) {
      var jdn = first + d - 1;
      var ag = agendaOn(jdn, events);
      var holiday = ag.occasions.some(function (x) { return x.holiday; });
      var religious = ag.occasions.some(function (x) { return x.kind === 'religious'; });
      var hasEvent = ag.events.length > 0;
      var other = cal === CAL.GREGORIAN ? UI.num(Cal.jdnToPersian(jdn).d) :
        UI.gnum(Cal.jdnToGregorian(jdn).d);
      var label = cal === CAL.GREGORIAN ? UI.gnum(d) : UI.num(d);
      var cls = ['day-cell'];
      if (jdn === today) cls.push('is-today');
      if (jdn === o.selected) cls.push('is-selected');
      if (holiday) cls.push('is-holiday');
      if (religious) cls.push('is-religious');
      if (hasEvent) cls.push('has-event');
      var weekday = Cal.weekdayOf(jdn);
      var aria = label + ' ' + Cal.WEEKDAYS[weekday] + (holiday ? '، تعطیل' : '') + (hasEvent ? '، دارای رویداد' : '');
      html += '<button type="button" class="' + cls.join(' ') + '" data-action="select-day" data-jdn="' + jdn +
        '" aria-label="' + UI.esc(aria) + '"' + (jdn === o.selected ? ' aria-pressed="true"' : '') + '>' +
        '<span class="dn">' + label + '</span>' +
        '<span class="sub">' + other + '</span>' +
        '<span class="dots" aria-hidden="true"><i class="d-hol"></i><i class="d-rel"></i><i class="d-ev"></i></span>' +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function monthTitle(cal, y, m) {
    if (cal === CAL.GREGORIAN) return Cal.GREGORIAN_MONTHS[m - 1] + ' ' + UI.gnum(y);
    if (cal === CAL.HIJRI) return Cal.HIJRI_MONTHS[m - 1] + ' ' + UI.num(y);
    return Cal.PERSIAN_MONTHS[m - 1] + ' ' + UI.num(y);
  }

  // Compact preview for the home screen: Persian month of a given jdn.
  function miniGrid(jdn, events) {
    var p = Cal.jdnToPersian(jdn);
    return '<div class="mini-title">' + UI.esc(monthTitle(CAL.PERSIAN, p.y, p.m)) + '</div>' +
      monthGrid(CAL.PERSIAN, p.y, p.m, { selected: jdn, today: jdn, events: events });
  }

  /* ------------------------------ Panels ------------------------------ */

  function dayPanel(jdn, events) {
    var ag = agendaOn(jdn, events);
    var g = Cal.jdnToGregorian(jdn);
    var h = Cal.jdnToHijri(jdn, UI.settings().hijriOffset);
    var p = Cal.jdnToPersian(jdn);
    var occHtml = ag.occasions.length ? ag.occasions.map(function (o) {
      return '<li class="occ-item' + (o.holiday ? ' is-holiday' : '') + '">' +
        '<span class="occ-dot"></span><span class="occ-title">' + UI.esc(o.title) + '</span>' +
        (o.holiday ? '<span class="badge badge-warn">تعطیل</span>' : '') +
        (o.note ? '<small class="muted">' + UI.esc(o.note) + '</small>' : '') + '</li>';
    }).join('') : '<li class="muted small">مناسبت رسمی یا مذهبی ثبت‌شده‌ای برای این روز نیست.</li>';
    var evHtml = ag.events.length ? ag.events.map(function (ev) {
      return '<li class="event-item"><span class="occ-dot ev"></span><span class="occ-title">' + UI.esc(ev.title) + '</span>' +
        '<span class="row-actions">' +
        '<button type="button" class="icon-btn sm" data-action="event-edit" data-id="' + UI.esc(ev.id) + '" aria-label="ویرایش رویداد ' + UI.esc(ev.title) + '">' + UI.icon('edit') + '</button>' +
        '<button type="button" class="icon-btn sm danger" data-action="event-delete" data-id="' + UI.esc(ev.id) + '" aria-label="حذف رویداد ' + UI.esc(ev.title) + '">' + UI.icon('trash') + '</button>' +
        '</span></li>';
    }).join('') : '<li class="muted small">رویدادی شخصی برای این روز ثبت نشده است.</li>';

    return '<section class="card day-panel" aria-live="polite">' +
      '<div class="day-head">' +
      '<div class="day-big">' + UI.num(p.d) + '</div>' +
      '<div class="day-meta"><div class="day-week">' + UI.esc(Cal.WEEKDAYS[Cal.weekdayOf(jdn)]) + '</div>' +
      '<div class="day-persian">' + UI.esc(UI.persianLong(jdn)) + '</div></div></div>' +
      '<dl class="cal-dates">' +
      '<div><dt>میلادی</dt><dd>' + UI.esc(UI.gregorianLong(jdn)) + '</dd></div>' +
      '<div><dt>قمری</dt><dd>' + UI.esc(UI.hijriLong(jdn)) + '</dd></div>' +
      '</dl>' +
      '<h3 class="sub-title">مناسبت‌ها</h3><ul class="plain-list">' + occHtml + '</ul>' +
      '<h3 class="sub-title">رویدادهای من</h3><ul class="plain-list">' + evHtml + '</ul>' +
      '<div class="actions-row"><button type="button" class="btn primary" data-action="event-new" data-date="' +
      Cal.formatIsoGregorian(g) + '">' + UI.icon('plus') + ' افزودن رویداد</button></div>' +
      '<p class="hint small">تقویم قمری جدولی است و ممکن است با رؤیت محلی یک روز اختلاف داشته باشد.' +
      ' (تصحیح قمری: ' + UI.num(UI.settings().hijriOffset) + ' روز)</p>' +
      '</section>';
  }

  function searchResults(query, events) {
    var q = query.trim();
    if (!q) return '';
    var lower = q.toLowerCase();
    var today = UI.todayJdn();
    var rows = [];
    NS.Data.occasions.items.forEach(function (it) {
      if (it.title.indexOf(q) === -1 && it.title.toLowerCase().indexOf(lower) === -1) return;
      var jdn = nextOccurrence(function (j) { return Cal.occasionsOn(j, [it], UI.settings().hijriOffset).length > 0; }, today, 400);
      rows.push({ title: it.title, jdn: jdn, kind: 'مناسبت' + (it.holiday ? ' (تعطیل)' : '') });
    });
    events.forEach(function (ev) {
      if (ev.title.indexOf(q) === -1 && ev.title.toLowerCase().indexOf(lower) === -1) return;
      var jdn = nextOccurrence(function (j) { return eventOccursOn(ev, j); }, today, 400);
      rows.push({ title: ev.title, jdn: jdn, kind: 'رویداد من' });
    });
    if (!rows.length) return '<p class="muted small">نتیجه‌ای پیدا نشد.</p>';
    return '<ul class="plain-list search-list">' + rows.slice(0, 40).map(function (r) {
      var when = r.jdn === null ? 'در ۴۰۰ روز آینده نیست' : UI.persianLong(r.jdn);
      return '<li><button type="button" class="list-btn" ' + (r.jdn === null ? 'disabled' : 'data-action="select-day" data-jdn="' + r.jdn + '"') + '>' +
        '<span class="occ-title">' + UI.esc(r.title) + '</span>' +
        '<small class="muted">' + UI.esc(r.kind) + ' · ' + UI.esc(when) + '</small></button></li>';
    }).join('') + '</ul>';
  }

  function converterCard() {
    var inp = state.convInput || converterDefaults(state.convFrom);
    var res = state.convResult;
    var resHtml = '';
    if (res) {
      resHtml = '<dl class="cal-dates conv-result">' +
        '<div><dt>شمسی</dt><dd>' + UI.esc(UI.persianLong(res.jdn)) + '</dd></div>' +
        '<div><dt>میلادی</dt><dd>' + UI.esc(UI.gregorianLong(res.jdn)) + '</dd></div>' +
        '<div><dt>قمری</dt><dd>' + UI.esc(UI.hijriLong(res.jdn)) + '</dd></div>' +
        '</dl><div class="actions-row"><button type="button" class="btn ghost" data-action="conv-show" data-jdn="' + res.jdn + '">نمایش در تقویم</button></div>';
    }
    return '<section class="card" id="converter"><h2 class="card-title">تبدیل تاریخ</h2>' +
      '<form class="form-stack" data-submit="calendar-convert" novalidate>' +
      '<div class="field"><label for="conv-cal">تاریخ ورودی</label>' +
      '<select id="conv-cal" name="cal" data-change="conv-cal">' +
      '<option value="persian"' + (state.convFrom === CAL.PERSIAN ? ' selected' : '') + '>شمسی</option>' +
      '<option value="gregorian"' + (state.convFrom === CAL.GREGORIAN ? ' selected' : '') + '>میلادی</option>' +
      '<option value="hijri"' + (state.convFrom === CAL.HIJRI ? ' selected' : '') + '>قمری</option>' +
      '</select></div>' +
      '<div class="field-row three">' +
      '<div class="field"><label for="conv-y">سال</label><input id="conv-y" name="y" inputmode="numeric" value="' + UI.esc(UI.num(inp.y || '')) + '" required></div>' +
      '<div class="field"><label for="conv-m">ماه (۱–۱۲)</label><input id="conv-m" name="m" inputmode="numeric" value="' + UI.esc(UI.num(inp.m || '')) + '" required></div>' +
      '<div class="field"><label for="conv-d">روز</label><input id="conv-d" name="d" inputmode="numeric" value="' + UI.esc(UI.num(inp.d || '')) + '" required></div>' +
      '</div><p class="error-text" id="conv-error" role="alert"></p>' +
      '<div class="actions-row"><button type="submit" class="btn primary">تبدیل</button></div></form>' +
      resHtml + '</section>';
  }

  /* ------------------------------ View ------------------------------ */

  function render() {
    ensureState();
    var todayJ = UI.todayJdn();
    return NS.Store.getAll('events').then(function (events) {
      var calBtn = function (cal, label) {
        return '<button type="button" class="seg-btn' + (state.cal === cal ? ' is-active' : '') + '" data-action="cal-switch" data-cal="' + cal + '" aria-pressed="' + (state.cal === cal) + '">' + label + '</button>';
      };
      var html = '<section class="page-head"><h1 class="page-title">تقویم</h1>' +
        '<p class="page-sub">شمسی، میلادی و قمری در یک صفحه</p></section>' +
        '<div class="segmented" role="group" aria-label="نوع تقویم">' +
        calBtn(CAL.PERSIAN, 'شمسی') + calBtn(CAL.GREGORIAN, 'میلادی') + calBtn(CAL.HIJRI, 'قمری') + '</div>' +
        '<section class="card cal-card">' +
        '<div class="cal-toolbar">' +
        '<button type="button" class="icon-btn" data-action="cal-next" aria-label="ماه بعد">' + UI.icon('back', 'flip') + '</button>' +
        '<div class="cal-title" id="cal-title" aria-live="polite">' + UI.esc(monthTitle(state.cal, state.y, state.m)) + '</div>' +
        '<button type="button" class="icon-btn" data-action="cal-prev" aria-label="ماه قبل">' + UI.icon('back') + '</button>' +
        '</div>' +
        '<div class="cal-tools"><button type="button" class="btn ghost sm" data-action="cal-today">امروز</button></div>' +
        '<div class="cal-body transition-fade" id="cal-body">' +
        monthGrid(state.cal, state.y, state.m, { selected: state.selected, today: todayJ, events: events }) +
        '</div>' +
        '<div class="legend" aria-hidden="true"><span><i class="d-hol"></i>تعطیل</span><span><i class="d-rel"></i>مذهبی/مناسبت</span><span><i class="d-ev"></i>رویداد من</span></div>' +
        '</section>' +
        '<div id="day-panel">' + dayPanel(state.selected, events) + '</div>' +
        '<section class="card"><h2 class="card-title">جستجوی مناسبت و رویداد</h2>' +
        '<div class="search-box">' + UI.icon('search') +
        '<input type="search" id="cal-search" data-input="cal-search" placeholder="مثلاً نوروز، عاشورا، تولد" value="' + UI.esc(state.query) + '" aria-label="جستجو در مناسبت‌ها و رویدادها"></div>' +
        '<div id="cal-results">' + searchResults(state.query, events) + '</div></section>' +
        converterCard() +
        '<section class="card method-note"><h2 class="card-title">درباره‌ی محاسبه‌ی تاریخ‌ها</h2>' +
        '<ul class="bullets small"><li>تاریخ شمسی با الگوریتم حسابی ۳۳ساله محاسبه می‌شود؛ در سال‌های نادر ممکن است با تقویم رسمی یک روز اختلاف داشته باشد.</li>' +
        '<li>تاریخ قمری به‌صورت «جدولی (مدنی)» محاسبه می‌شود و با رؤیت هلال محلی ممکن است ۱ تا ۲ روز فرق کند. از «تصحیح قمری» در تنظیمات استفاده کنید.</li>' +
        '<li>فهرست مناسبت‌ها نمونه است و باید با تقویم رسمی سال تطبیق داده شود (فایل js/data/occasions.js).</li></ul></section>';
      return html;
    });
  }

  function mount() {
    // Nothing to attach: the router delegates events from #view.
  }

  /* ------------------------------ Actions ------------------------------ */

  // Selects a day and moves the visible month to contain it.
  function selectDay(jdn) {
    var offset = UI.settings().hijriOffset;
    var anchor = Cal.fromJdn(state.cal, jdn, offset);
    state.selected = jdn;
    state.y = anchor.y;
    state.m = anchor.m;
  }

  // Default converter input: today's date in the chosen calendar.
  function converterDefaults(cal) {
    var offset = UI.settings().hijriOffset;
    var parts = Cal.fromJdn(cal, UI.todayJdn(), offset);
    return { y: parts.y, m: parts.m, d: parts.d };
  }

  function moveMonth(delta) {
    var next = Cal.shiftMonth(state.cal, state.y, state.m, delta);
    state.y = next.y;
    state.m = next.m;
    // Keep selection inside the visible month when it falls outside.
    var first = Cal.toJdn(state.cal, state.y, state.m, 1, UI.settings().hijriOffset);
    var len = Cal.daysInMonth(state.cal, state.y, state.m, UI.settings().hijriOffset);
    if (state.selected < first || state.selected >= first + len) state.selected = first;
  }

  // Event form (create / edit).
  function openEventForm(existing, prefillDate) {
    var ev = existing || { title: '', kind: 'personal', date: prefillDate || UI.localIsoDate(Date.now()), recur: 'none', note: '' };
    var title = existing ? 'ویرایش رویداد' : 'رویداد جدید';
    var body = '<div class="field"><label for="ev-title">عنوان</label>' +
      '<input id="ev-title" name="title" maxlength="200" required value="' + UI.esc(ev.title) + '" placeholder="مثلاً تولد مادر"></div>' +
      '<div class="field-row"><div class="field"><label for="ev-kind">نوع</label><select id="ev-kind" name="kind">' +
      opt('personal', 'شخصی', ev.kind) + opt('birthday', 'تولد', ev.kind) + opt('anniversary', 'سالگرد', ev.kind) +
      '</select></div><div class="field"><label for="ev-date">تاریخ (میلادی)</label><input id="ev-date" type="date" name="date" required value="' +
      UI.esc(ev.date) + '"></div></div>' +
      '<div class="field"><label for="ev-recur">تکرار</label><select id="ev-recur" name="recur">' +
      opt('none', 'فقط یک بار', ev.recur) + opt('yearly-persian', 'هر سال (بر اساس تاریخ شمسی)', ev.recur) +
      opt('yearly-gregorian', 'هر سال (بر اساس تاریخ میلادی)', ev.recur) + '</select></div>' +
      '<div class="field"><label for="ev-note">یادداشت</label><textarea id="ev-note" name="note" rows="2" maxlength="500">' + UI.esc(ev.note || '') + '</textarea></div>' +
      '<p class="error-text" role="alert" id="ev-error"></p>';
    UI.modal({
      title: title,
      body: body,
      submitLabel: 'ذخیره',
      onSubmit: function (form) {
        var f = new FormData(form);
        var rec = {
          id: existing ? existing.id : NS.Store.newId(),
          title: String(f.get('title') || '').trim(),
          kind: String(f.get('kind') || 'personal'),
          date: String(f.get('date') || ''),
          recur: String(f.get('recur') || 'none'),
          note: String(f.get('note') || ''),
          createdAt: existing ? existing.createdAt : Date.now()
        };
        var clean = NS.Store.sanitizers.events(rec);
        var err = form.querySelector('#ev-error');
        if (!clean) { err.textContent = 'عنوان و تاریخ معتبر لازم است.'; return false; }
        return NS.Store.put('events', clean).then(function () {
          if (clean.date) selectDay(Cal.isoToJdn(clean.date));
          UI.toast('رویداد ذخیره شد.', { type: 'success' });
          NS.Router.refresh();
          return true;
        });
      }
    });
  }

  function opt(value, label, current) {
    return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + label + '</option>';
  }

  UI.registerAction('cal-switch', function (el) {
    var cal = el.getAttribute('data-cal');
    if (cal === state.cal) return;
    var anchor = Cal.fromJdn(cal, state.selected, UI.settings().hijriOffset);
    state.cal = cal;
    state.y = anchor.y;
    state.m = anchor.m;
    NS.Router.refresh();
  });
  UI.registerAction('cal-prev', function () { moveMonth(-1); NS.Router.refresh(); });
  UI.registerAction('cal-next', function () { moveMonth(1); NS.Router.refresh(); });
  UI.registerAction('cal-today', function () {
    selectDay(UI.todayJdn());
    NS.Router.refresh();
  });
  UI.registerAction('select-day', function (el) {
    selectDay(+el.getAttribute('data-jdn'));
    NS.Router.refresh();
    global.setTimeout(function () {
      var panel = document.getElementById('day-panel');
      if (panel && global.matchMedia && !global.matchMedia('(min-width: 900px)').matches) {
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 60);
  });
  UI.registerAction('conv-show', function (el) {
    selectDay(+el.getAttribute('data-jdn'));
    state.cal = CAL.PERSIAN;
    var p = Cal.jdnToPersian(state.selected);
    state.y = p.y; state.m = p.m;
    NS.Router.refresh();
  });
  UI.registerAction('event-new', function (el) {
    openEventForm(null, el.getAttribute('data-date'));
  });
  UI.registerAction('event-edit', function (el) {
    return NS.Store.getAll('events').then(function (list) {
      var ev = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (ev) openEventForm(ev);
    });
  });
  UI.registerAction('event-delete', function (el) {
    var id = el.getAttribute('data-id');
    return UI.confirm({
      title: 'حذف رویداد',
      message: 'این رویداد حذف شود؟ این کار قابل بازگشت نیست.',
      okLabel: 'حذف', danger: true
    }).then(function (ok) {
      if (!ok) return;
      return NS.Store.remove('events', id).then(function () {
        UI.toast('رویداد حذف شد.');
        NS.Router.refresh();
      });
    });
  });

  UI.registerChange('conv-cal', function (el) {
    state.convFrom = el.value;
    state.convInput = converterDefaults(el.value);
    state.convResult = null;
    NS.Router.refresh();
  });

  UI.registerSubmit('calendar-convert', function (form) {
    var errEl = form.querySelector('#conv-error');
    var cal = String(form.elements.cal.value);
    var y = UI.parseNumber(form.elements.y.value);
    var m = UI.parseNumber(form.elements.m.value);
    var d = UI.parseNumber(form.elements.d.value);
    state.convFrom = cal;
    state.convInput = { y: y, m: m, d: d };
    var offset = UI.settings().hijriOffset;
    var maxDay = (isFinite(y) && isFinite(m) && m >= 1 && m <= 12) ? Cal.daysInMonth(cal, y, m, offset) : 0;
    if (!isFinite(y) || !isFinite(m) || !isFinite(d) || m < 1 || m > 12 || d < 1 || d > maxDay) {
      errEl.textContent = 'ورودی معتبر نیست. ماه بین ۱ و ۱۲ و روز در محدوده‌ی همان ماه باشد.';
      state.convResult = null;
    } else if (cal === CAL.PERSIAN && (y < -60 || y > 3170)) {
      errEl.textContent = 'سال شمسی خارج از محدوده‌ی پشتیبانی است.';
      state.convResult = null;
    } else {
      errEl.textContent = '';
      var jdn = Cal.toJdn(cal, y, m, d, offset);
      state.convResult = { jdn: jdn };
    }
    NS.Router.refresh();
    return false;
  });

  UI.registerInput('cal-search', UI.debounce(function (el) {
    state.query = el.value;
    NS.Store.getAll('events').then(function (events) {
      var box = document.getElementById('cal-results');
      if (box) box.innerHTML = searchResults(state.query, events);
    });
  }, 180));

  NS.Views = NS.Views || {};
  NS.Views.calendar = {
    title: 'تقویم',
    render: render,
    mount: mount
  };

  NS.CalendarUI = {
    monthGrid: monthGrid,
    miniGrid: miniGrid,
    monthTitle: monthTitle,
    agendaOn: agendaOn,
    eventOccursOn: eventOccursOn,
    nextOccurrence: nextOccurrence,
    openEventForm: openEventForm,
    ensureState: ensureState
  };
})(typeof window !== 'undefined' ? window : globalThis);
