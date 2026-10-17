/*
 * FETROS — tools (js/view-tools.js)
 *
 * - Tools index (ابزارها)
 * - Organizer: tasks, notes and reminders (create, edit, complete, delete,
 *   search, filter, sort, favourites, overdue indicators)
 * - Dhikr counter with saved sessions, targets, vibration and optional beep
 * - Medication reminders (in-app only; not a medical service)
 * - Weather (Open-Meteo, no API key; cached; shows errors honestly)
 * - Reminder / dose checker used while the app is open (see tick())
 *
 * Exposes: registers "tools", "organizer", "dhikr", "meds", "weather" views;
 *          window.FETROS.Tools, window.FETROS.Weather, window.FETROS.Notify
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var UI = NS.UI;
  var Cal = NS.Calendar;
  var Store = NS.Store;

  /* ------------------------------ Notifications ------------------------------ */

  // Shows a system notification when permission is granted (desktop/Android),
  // otherwise an in-app toast. Only while the app is running in some form.
  function notify(title, body, tag) {
    var supported = 'Notification' in global;
    if (supported && global.Notification.permission === 'granted') {
      var opts = { body: body, tag: tag || 'fetros', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: false };
      if (global.navigator && navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        return navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.showNotification) return reg.showNotification(title, opts);
          return new global.Notification(title, opts);
        }).catch(function () {
          try { return new global.Notification(title, opts); } catch (e) { return null; }
        });
      }
      try { new global.Notification(title, opts); return Promise.resolve(null); } catch (e) { /* fall back to the in-app toast */ }
    }
    UI.toast(title + (body ? ' — ' + body : ''), { type: 'info', timeout: 6000 });
    return Promise.resolve(null);
  }

  /* ------------------------------ Reminder helpers ------------------------------ */

  // Next occurrence strictly after `now` for a recurring reminder.
  function nextDue(dueAt, recur, now) {
    var d = new Date(dueAt);
    var guard = 0;
    do {
      if (recur === 'daily') d.setDate(d.getDate() + 1);
      else if (recur === 'weekly') d.setDate(d.getDate() + 7);
      else if (recur === 'monthly') d.setMonth(d.getMonth() + 1);
      else if (recur === 'yearly') d.setFullYear(d.getFullYear() + 1);
      else return dueAt;
      guard++;
    } while (d.getTime() <= now && guard < 5000);
    return d.getTime();
  }

  var RECUR_LABELS = { none: 'یک‌بار', daily: 'روزانه', weekly: 'هفتگی', monthly: 'ماهانه', yearly: 'سالانه' };

  /* ------------------------------ Tools index ------------------------------ */

  var TOOL_CARDS = [
    { route: '#/organizer/tasks', icon: 'task', title: 'وظایف و یادداشت‌ها', text: 'کارهای روزانه و یادداشت‌های سریع' },
    { route: '#/organizer/reminders', icon: 'alarm', title: 'یادآورها', text: 'زمان‌بندی یادآور با تکرار' },
    { route: '#/dhikr', icon: 'beads', title: 'تسبیح و ذکر', text: 'شمارنده‌ی ذکر با هدف و تاریخچه' },
    { route: '#/qibla', icon: 'compass', title: 'قبله‌نما', text: 'جهت کعبه از موقعیت شما' },
    { route: '#/meds', icon: 'pill', title: 'یادآور دارو', text: 'برنامه‌ی یادآوری، فقط یادآوری و نه توصیه‌ی پزشکی' },
    { route: '#/weather', icon: 'cloud', title: 'هواشناسی', text: 'وضعیت هوا با اتصال اینترنت' },
    { route: '#/calendar', icon: 'calendar', title: 'تقویم', text: 'شمسی، میلادی و قمری' },
    { route: '#/prayer', icon: 'prayer', title: 'اوقات شرعی', text: 'محاسبه‌ی محلی اوقات نماز' }
  ];

  function renderTools() {
    var cards = TOOL_CARDS.map(function (c) {
      return '<a class="tool-card" href="' + c.route + '"><span class="tool-ico">' + UI.icon(c.icon) + '</span>' +
        '<span class="tool-title">' + UI.esc(c.title) + '</span><span class="tool-text">' + UI.esc(c.text) + '</span></a>';
    }).join('');
    return Promise.resolve('<section class="page-head"><h1 class="page-title">ابزارها</h1>' +
      '<p class="page-sub">ابزارهایی برای روزهای شما؛ همه روی همین دستگاه کار می‌کنند</p></section>' +
      '<div class="tools-grid">' + cards + '</div>' +
      '<section class="card"><p class="small muted">فطرس برای کار اصلی به حساب کاربری یا سرور نیاز ندارد. اطلاعات شما روی همین دستگاه ذخیره می‌شود. برای پشتیبان‌گیری به تنظیمات بروید.</p></section>');
  }

  /* ------------------------------ Organizer ------------------------------ */

  var org = { tab: 'tasks', taskFilter: 'all', taskSort: 'due', noteFilter: 'all', noteQuery: '', reminderFilter: 'upcoming' };

  function tabs() {
    var t = [['tasks', 'وظایف'], ['notes', 'یادداشت‌ها'], ['reminders', 'یادآورها']];
    return '<div class="segmented" role="tablist" aria-label="بخش‌ها">' + t.map(function (x) {
      var on = org.tab === x[0];
      return '<button type="button" role="tab" class="seg-btn' + (on ? ' is-active' : '') + '" aria-selected="' + on +
        '" data-action="org-tab" data-tab="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }

  function chips(items, active, action, attr) {
    return '<div class="chips" role="group">' + items.map(function (x) {
      return '<button type="button" class="chip' + (active === x[0] ? ' is-active' : '') + '" data-action="' + action + '" data-' + attr + '="' + x[0] + '" aria-pressed="' + (active === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
  }

  function taskRow(t, todayIso) {
    var overdue = !t.done && t.due && t.due < todayIso;
    return '<li class="item-row' + (t.done ? ' is-done' : '') + (t.priority === 'high' ? ' is-high' : '') + '">' +
      '<label class="check"><input type="checkbox" data-change="task-toggle" data-id="' + UI.esc(t.id) + '"' + (t.done ? ' checked' : '') + '>' +
      '<span class="check-ui" aria-hidden="true">' + UI.icon('check') + '</span>' +
      '<span class="item-text"><span class="item-title">' + UI.esc(t.title) + '</span>' +
      '<span class="item-meta">' +
      (t.due ? '<span class="badge' + (overdue ? ' badge-danger' : '') + '">' + UI.esc(UI.isoPersian(t.due)) + '</span>' : '<span class="muted small">بدون تاریخ</span>') +
      (t.priority === 'high' ? '<span class="badge badge-gold">مهم</span>' : '') +
      (overdue ? '<span class="badge badge-danger">عقب‌افتاده</span>' : '') +
      '</span></span></label>' +
      '<span class="row-actions">' +
      '<button type="button" class="icon-btn sm" data-action="task-edit" data-id="' + UI.esc(t.id) + '" aria-label="ویرایش ' + UI.esc(t.title) + '">' + UI.icon('edit') + '</button>' +
      '<button type="button" class="icon-btn sm danger" data-action="task-delete" data-id="' + UI.esc(t.id) + '" aria-label="حذف ' + UI.esc(t.title) + '">' + UI.icon('trash') + '</button>' +
      '</span></li>';
  }

  function sortTasks(list, mode) {
    var out = list.slice();
    out.sort(function (a, b) {
      if (mode === 'status' && a.done !== b.done) return a.done ? 1 : -1;
      if (mode === 'created') return b.createdAt - a.createdAt;
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due !== b.due) return a.due === '' ? 1 : b.due === '' ? -1 : (a.due < b.due ? -1 : 1);
      return b.createdAt - a.createdAt;
    });
    return out;
  }

  function renderTasks(list) {
    var todayIso = UI.localIsoDate(Date.now());
    var f = org.taskFilter;
    var filtered = list.filter(function (t) {
      if (f === 'open') return !t.done;
      if (f === 'done') return t.done;
      if (f === 'today') return t.due === todayIso;
      if (f === 'overdue') return !t.done && t.due && t.due < todayIso;
      return true;
    });
    var sorted = sortTasks(filtered, org.taskSort);
    var todays = list.filter(function (t) { return t.due === todayIso; });
    var doneToday = todays.filter(function (t) { return t.done; }).length;
    var overdue = list.filter(function (t) { return !t.done && t.due && t.due < todayIso; }).length;
    var pct = UI.pct(doneToday, todays.length);
    var summary = '<div class="summary-card"><div class="progress-line" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="پیشرفت کارهای امروز"><span style="transform: scaleX(' + (pct / 100) + ')"></span></div>' +
      '<p class="small">امروز: ' + UI.num(doneToday) + ' از ' + UI.num(todays.length) + ' انجام شد' +
      (overdue ? ' · <span class="text-danger">' + UI.num(overdue) + ' عقب‌افتاده</span>' : '') + '</p></div>';
    var form = '<form class="card form-stack" data-submit="task-add" novalidate>' +
      '<div class="field"><label for="task-title">کار جدید</label><input id="task-title" name="title" maxlength="200" required placeholder="مثلاً پیگیری فاکتور"></div>' +
      '<div class="field-row"><div class="field"><label for="task-due">تاریخ (اختیاری)</label><input id="task-due" type="date" name="due" value="' + todayIso + '"></div>' +
      '<div class="field"><label class="check-inline"><input type="checkbox" name="high"> <span>کار مهم</span></label></div></div>' +
      '<p class="error-text" role="alert" id="task-error"></p>' +
      '<div class="actions-row"><button type="submit" class="btn primary">' + UI.icon('plus') + ' افزودن کار</button></div></form>';
    var filters = chips([['all', 'همه'], ['open', 'باز'], ['today', 'امروز'], ['overdue', 'عقب‌افتاده'], ['done', 'انجام‌شده']], f, 'task-filter', 'f');
    var sortSel = '<div class="field inline-field"><label for="task-sort">مرتب‌سازی</label><select id="task-sort" data-change="task-sort">' +
      '<option value="due"' + (org.taskSort === 'due' ? ' selected' : '') + '>بر اساس تاریخ</option>' +
      '<option value="status"' + (org.taskSort === 'status' ? ' selected' : '') + '>بر اساس وضعیت</option>' +
      '<option value="created"' + (org.taskSort === 'created' ? ' selected' : '') + '>جدیدترین</option></select></div>';
    var listHtml = sorted.length ? '<ul class="item-list">' + sorted.map(function (t) { return taskRow(t, todayIso); }).join('') + '</ul>' :
      UI.emptyState('task', list.length ? 'موردی با این فیلتر نیست' : 'هنوز کاری ثبت نشده', list.length ? 'فیلتر دیگری را امتحان کنید.' : 'با فرم بالا اولین کار خود را اضافه کنید.');
    return form + summary + '<div class="toolbar-row">' + filters + '</div>' + sortSel + '<section class="card list-card" aria-label="فهرست کارها">' + listHtml + '</section>';
  }

  function noteCard(n) {
    var excerpt = n.body.replace(/\s+/g, ' ').slice(0, 140);
    return '<li class="note-card' + (n.favorite ? ' is-fav' : '') + '">' +
      '<button type="button" class="note-open" data-action="note-edit" data-id="' + UI.esc(n.id) + '">' +
      '<span class="note-title">' + UI.esc(n.title) + '</span>' +
      '<span class="note-excerpt">' + UI.esc(excerpt) + (n.body.length > 140 ? '…' : '') + '</span>' +
      '<span class="note-date small muted">' + UI.esc(UI.persianLong(jdnOfMs(n.updatedAt))) + '</span></button>' +
      '<span class="row-actions">' +
      '<button type="button" class="icon-btn sm' + (n.favorite ? ' fav-on' : '') + '" data-action="note-fav" data-id="' + UI.esc(n.id) + '" aria-pressed="' + n.favorite + '" aria-label="' + (n.favorite ? 'حذف از علاقه‌مندی' : 'افزودن به علاقه‌مندی') + '">' + UI.icon('star') + '</button>' +
      '<button type="button" class="icon-btn sm danger" data-action="note-delete" data-id="' + UI.esc(n.id) + '" aria-label="حذف یادداشت">' + UI.icon('trash') + '</button>' +
      '</span></li>';
  }

  function renderNotes(list) {
    var q = org.noteQuery.trim().toLowerCase();
    var filtered = list.filter(function (n) {
      if (org.noteFilter === 'fav' && !n.favorite) return false;
      if (!q) return true;
      return (n.title + ' ' + n.body).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    var top = '<div class="toolbar-row"><button type="button" class="btn primary sm" data-action="note-new">' + UI.icon('plus') + ' یادداشت جدید</button></div>' +
      '<div class="search-box">' + UI.icon('search') + '<input type="search" data-input="note-search" value="' + UI.esc(org.noteQuery) + '" placeholder="جستجو در یادداشت‌ها" aria-label="جستجو در یادداشت‌ها"></div>' +
      '<div class="toolbar-row">' + chips([['all', 'همه'], ['fav', 'علاقه‌مندی‌ها']], org.noteFilter, 'note-filter', 'f') + '</div>';
    var body = filtered.length ? '<ul class="note-grid">' + filtered.map(noteCard).join('') + '</ul>' :
      UI.emptyState('note', list.length ? 'یادداشتی پیدا نشد' : 'هنوز یادداشتی ندارید', list.length ? 'جستجو یا فیلتر را تغییر دهید.' : 'یادداشت‌ها روی همین دستگاه ذخیره می‌شوند و بدون اینترنت هم در دسترس‌اند.', list.length ? '' : '<button type="button" class="btn primary" data-action="note-new">یادداشت جدید</button>');
    return top + '<div id="note-results">' + body + '</div>';
  }

  function reminderRow(r, now) {
    var overdue = !r.done && r.dueAt < now;
    var recurText = RECUR_LABELS[r.recur] || '';
    return '<li class="item-row' + (r.done ? ' is-done' : '') + (overdue ? ' is-overdue' : '') + '">' +
      '<label class="check"><input type="checkbox" data-change="reminder-toggle" data-id="' + UI.esc(r.id) + '"' + (r.done ? ' checked' : '') + '>' +
      '<span class="check-ui" aria-hidden="true">' + UI.icon('check') + '</span>' +
      '<span class="item-text"><span class="item-title">' + UI.esc(r.title) + '</span>' +
      '<span class="item-meta"><span class="badge">' + UI.esc(UI.persianLong(jdnOfMs(r.dueAt))) + ' · ' + UI.clockOf(r.dueAt) + '</span>' +
      (recurText && r.recur !== 'none' ? '<span class="badge">' + UI.esc(recurText) + '</span>' : '') +
      (overdue ? '<span class="badge badge-danger">گذشته</span>' : '') + '</span></span></label>' +
      '<span class="row-actions">' +
      '<button type="button" class="icon-btn sm" data-action="reminder-edit" data-id="' + UI.esc(r.id) + '" aria-label="ویرایش یادآور">' + UI.icon('edit') + '</button>' +
      '<button type="button" class="icon-btn sm danger" data-action="reminder-delete" data-id="' + UI.esc(r.id) + '" aria-label="حذف یادآور">' + UI.icon('trash') + '</button></span></li>';
  }

  function jdnOfMs(ms) {
    var d = new Date(ms);
    return Cal.gregorianToJdn(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function renderReminders(list) {
    var now = Date.now();
    var f = org.reminderFilter;
    var filtered = list.filter(function (r) {
      if (f === 'done') return r.done;
      if (f === 'overdue') return !r.done && r.dueAt < now;
      if (f === 'upcoming') return !r.done && r.dueAt >= now;
      return true;
    }).sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.dueAt - b.dueAt;
    });
    var defaultDue = UI.toLocalInput(now + 3600000);
    var form = '<form class="card form-stack" data-submit="reminder-add" novalidate>' +
      '<div class="field"><label for="rem-title">متن یادآور</label><input id="rem-title" name="title" maxlength="200" required placeholder="مثلاً تماس با خانواده"></div>' +
      '<div class="field-row"><div class="field"><label for="rem-due">زمان</label><input id="rem-due" type="datetime-local" name="due" value="' + defaultDue + '" required></div>' +
      '<div class="field"><label for="rem-recur">تکرار</label><select id="rem-recur" name="recur">' +
      Object.keys(RECUR_LABELS).map(function (k) { return '<option value="' + k + '">' + RECUR_LABELS[k] + '</option>'; }).join('') +
      '</select></div></div><p class="error-text" role="alert" id="rem-error"></p>' +
      '<div class="actions-row"><button type="submit" class="btn primary">' + UI.icon('alarm') + ' ثبت یادآور</button></div>' +
      '<p class="hint small">یادآورها هنگام باز بودن برنامه نشان داده می‌شوند. برای اعلان سیستمی، اجازه‌ی اعلان را در تنظیمات بدهید؛ اعلان وقتی برنامه بسته است تضمین نمی‌شود.</p></form>';
    var filters = chips([['upcoming', 'پیش‌رو'], ['overdue', 'گذشته'], ['done', 'انجام‌شده'], ['all', 'همه']], f, 'rem-filter', 'f');
    var body = filtered.length ? '<ul class="item-list">' + filtered.map(function (r) { return reminderRow(r, now); }).join('') + '</ul>' :
      UI.emptyState('alarm', 'یادآوری در این فیلتر نیست', 'با فرم بالا یک یادآور جدید بسازید.');
    return form + '<div class="toolbar-row">' + filters + '</div><section class="card list-card" aria-label="فهرست یادآورها">' + body + '</section>';
  }

  function renderOrganizer(params) {
    if (params && ['tasks', 'notes', 'reminders'].indexOf(params[0]) !== -1) org.tab = params[0];
    return Promise.all([Store.getAll('tasks'), Store.getAll('notes'), Store.getAll('reminders')]).then(function (res) {
      var body;
      if (org.tab === 'tasks') body = renderTasks(res[0]);
      else if (org.tab === 'notes') body = renderNotes(res[1]);
      else body = renderReminders(res[2]);
      return '<section class="page-head"><h1 class="page-title">وظایف و یادداشت‌ها</h1>' +
        '<p class="page-sub">برنامه‌ریزی روزانه؛ همه‌چیز روی همین دستگاه</p></section>' +
        tabs() + '<div class="org-body">' + body + '</div>';
    });
  }

  /* ------------------------------ Task / note / reminder forms ------------------------------ */

  function openTaskEditor(task) {
    var t = task || { title: '', due: UI.localIsoDate(Date.now()), priority: 'normal' };
    UI.modal({
      title: task ? 'ویرایش کار' : 'کار جدید',
      body: '<div class="field"><label for="te-title">عنوان</label><input id="te-title" name="title" maxlength="200" required value="' + UI.esc(t.title) + '"></div>' +
        '<div class="field-row"><div class="field"><label for="te-due">تاریخ (اختیاری)</label><input id="te-due" type="date" name="due" value="' + UI.esc(t.due || '') + '"></div>' +
        '<div class="field"><label for="te-prio">اولویت</label><select id="te-prio" name="priority"><option value="normal"' + (t.priority !== 'high' ? ' selected' : '') + '>عادی</option><option value="high"' + (t.priority === 'high' ? ' selected' : '') + '>مهم</option></select></div></div>' +
        '<p class="error-text" role="alert" id="te-error"></p>',
      submitLabel: 'ذخیره',
      onSubmit: function (form) {
        var title = String(form.elements.title.value || '').trim();
        if (!title) { form.querySelector('#te-error').textContent = 'عنوان لازم است.'; return false; }
        var rec = Store.sanitizers.tasks({
          id: task ? task.id : Store.newId(), title: title, done: task ? task.done : false,
          due: form.elements.due.value, priority: form.elements.priority.value,
          createdAt: task ? task.createdAt : Date.now(), completedAt: task ? task.completedAt : null
        });
        return Store.put('tasks', rec).then(function () {
          UI.toast('کار ذخیره شد.', { type: 'success' });
          NS.Router.refresh();
          return true;
        });
      }
    });
  }

  function openNoteEditor(note) {
    var n = note || { title: '', body: '' };
    UI.modal({
      title: note ? 'ویرایش یادداشت' : 'یادداشت جدید',
      body: '<div class="field"><label for="ne-title">عنوان</label><input id="ne-title" name="title" maxlength="120" value="' + UI.esc(n.title) + '" placeholder="اختیاری"></div>' +
        '<div class="field"><label for="ne-body">متن</label><textarea id="ne-body" name="body" rows="8" maxlength="5000">' + UI.esc(n.body) + '</textarea></div>' +
        '<p class="error-text" role="alert" id="ne-error"></p>',
      submitLabel: 'ذخیره',
      onSubmit: function (form) {
        var title = String(form.elements.title.value || '').trim();
        var body = String(form.elements.body.value || '');
        var rec = Store.sanitizers.notes({
          id: note ? note.id : Store.newId(), title: title || (body.split('\n')[0].slice(0, 60)), body: body,
          favorite: note ? note.favorite : false, createdAt: note ? note.createdAt : Date.now(), updatedAt: Date.now()
        });
        if (!rec) { form.querySelector('#ne-error').textContent = 'یادداشت خالی است.'; return false; }
        return Store.put('notes', rec).then(function () {
          UI.toast('یادداشت ذخیره شد.', { type: 'success' });
          NS.Router.refresh();
          return true;
        });
      }
    });
  }

  function reminderFormBody(r) {
    var v = r || { title: '', dueAt: Date.now() + 3600000, recur: 'none' };
    return '<div class="field"><label for="re-title">متن یادآور</label><input id="re-title" name="title" maxlength="200" required value="' + UI.esc(v.title) + '"></div>' +
      '<div class="field-row"><div class="field"><label for="re-due">زمان</label><input id="re-due" type="datetime-local" name="due" required value="' + UI.toLocalInput(v.dueAt) + '"></div>' +
      '<div class="field"><label for="re-recur">تکرار</label><select id="re-recur" name="recur">' +
      Object.keys(RECUR_LABELS).map(function (k) { return '<option value="' + k + '"' + (v.recur === k ? ' selected' : '') + '>' + RECUR_LABELS[k] + '</option>'; }).join('') +
      '</select></div></div><p class="error-text" role="alert" id="re-error"></p>';
  }

  function saveReminderFromForm(form, existing) {
    var title = String(form.elements.title.value || '').trim();
    var due = UI.fromLocalInput(form.elements.due.value);
    var err = form.querySelector('#re-error') || form.querySelector('#rem-error');
    if (!title) { err.textContent = 'متن یادآور لازم است.'; return null; }
    if (due === null) { err.textContent = 'زمان معتبر وارد کنید.'; return null; }
    var rec = Store.sanitizers.reminders({
      id: existing ? existing.id : Store.newId(), title: title, dueAt: due,
      recur: form.elements.recur.value, done: existing ? existing.done : false,
      firedAt: existing ? existing.firedAt : null, createdAt: existing ? existing.createdAt : Date.now()
    });
    return rec;
  }

  /* ------------------------------ Dhikr ------------------------------ */

  var RING_C = 2 * Math.PI * 44;
  var TARGETS = [33, 99, 100, 500, 1000];

  function currentDhikr() {
    var r = Store.getRuntime().dhikrCurrent || {};
    return {
      label: String(r.label || 'ذکر').slice(0, 80),
      target: Math.max(1, Math.min(100000, Math.round(+r.target) || 33)),
      count: Math.max(0, Math.min(1000000, Math.round(+r.count) || 0)),
      startedAt: +r.startedAt || Date.now()
    };
  }

  function saveDhikr(patch) {
    var next = Object.assign(currentDhikr(), patch || {});
    Store.setRuntime({ dhikrCurrent: next });
    return next;
  }

  function ringOffset(count, target) {
    var p = Math.min(1, count / target);
    return RING_C * (1 - p);
  }

  function paintDhikr() {
    var c = currentDhikr();
    var countEl = document.getElementById('dhikr-count');
    if (!countEl) return;
    countEl.textContent = UI.num(c.count);
    var ring = document.getElementById('dhikr-ring');
    if (ring) ring.style.strokeDashoffset = String(ringOffset(c.count, c.target));
    var t = document.getElementById('dhikr-target-text');
    if (t) t.textContent = 'از ' + UI.num(c.target) + ' · ' + UI.num(Math.round(Math.min(100, c.count / c.target * 100))) + '٪';
    var rem = document.getElementById('dhikr-remaining');
    if (rem) rem.textContent = c.count >= c.target ? 'به هدف رسیدید' : 'باقی‌مانده: ' + UI.num(c.target - c.count);
  }

  function beep() {
    if (!UI.settings().dhikrSound) return;
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return;
    try {
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
      global.setTimeout(function () { ctx.close && ctx.close(); }, 300);
    } catch (e) { /* audio not available: silent fallback */ }
  }

  function renderDhikr() {
    var c = currentDhikr();
    var pct = Math.min(100, Math.round(c.count / c.target * 100));
    var targetChips = TARGETS.concat([]).map(function (t) {
      return '<button type="button" class="chip' + (c.target === t ? ' is-active' : '') + '" data-action="dhikr-target" data-t="' + t + '" aria-pressed="' + (c.target === t) + '">' + UI.num(t) + '</button>';
    }).join('');
    var custom = c.target && TARGETS.indexOf(c.target) === -1 ? '<span class="chip is-active">' + UI.num(c.target) + '</span>' : '';
    return Store.getAll('dhikr').then(function (sessions) {
      var todayIso = UI.localIsoDate(Date.now());
      var todaySessions = sessions.filter(function (s) { return s.date === todayIso; });
      var todayTotal = todaySessions.reduce(function (a, s) { return a + s.count; }, 0) + c.count;
      var hist = sessions.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 30).map(function (s) {
        return '<li class="item-row"><span class="item-text"><span class="item-title">' + UI.esc(s.label) + '</span>' +
          '<span class="item-meta"><span class="badge">' + UI.esc(UI.isoPersian(s.date)) + '</span><span class="badge">' + UI.num(s.count) + ' از ' + UI.num(s.target) + '</span>' +
          (s.count >= s.target ? '<span class="badge badge-gold">به هدف رسید</span>' : '') + '</span></span>' +
          '<span class="row-actions"><button type="button" class="icon-btn sm danger" data-action="dhikr-session-delete" data-id="' + UI.esc(s.id) + '" aria-label="حذف این جلسه">' + UI.icon('trash') + '</button></span></li>';
      }).join('');
      return '<section class="page-head"><h1 class="page-title">تسبیح و ذکر</h1>' +
        '<p class="page-sub">شمارنده‌ی ذکر با هدف، جلسه‌ها و پیشرفت روزانه</p></section>' +
        '<section class="card dhikr-card" aria-labelledby="dhikr-title">' +
        '<h2 class="card-title sr-only" id="dhikr-title">شمارنده</h2>' +
        '<div class="dhikr-label-row"><label for="dhikr-label" class="sr-only">عنوان ذکر</label>' +
        '<input id="dhikr-label" maxlength="80" value="' + UI.esc(c.label) + '" data-change="dhikr-label" placeholder="عنوان ذکر (مثلاً سبحان‌الله)"></div>' +
        '<div class="ring-wrap"><svg class="ring" viewBox="0 0 100 100" aria-hidden="true">' +
        '<circle cx="50" cy="50" r="44" class="ring-bg"/>' +
        '<circle id="dhikr-ring" cx="50" cy="50" r="44" class="ring-fg" style="stroke-dasharray:' + RING_C.toFixed(2) + '; stroke-dashoffset:' + ringOffset(c.count, c.target).toFixed(2) + '"/></svg>' +
        '<button type="button" class="counter-btn" data-action="dhikr-inc" aria-label="افزایش شمارش"><span id="dhikr-count" class="counter-num">' + UI.num(c.count) + '</span>' +
        '<span class="counter-hint small" id="dhikr-target-text">از ' + UI.num(c.target) + ' · ' + UI.num(pct) + '٪</span></button></div>' +
        '<p class="small muted center" id="dhikr-remaining" aria-live="polite">' + (c.count >= c.target ? 'به هدف رسیدید' : 'باقی‌مانده: ' + UI.num(c.target - c.count)) + '</p>' +
        '<div class="dhikr-ctrl"><button type="button" class="btn ghost round" data-action="dhikr-dec" aria-label="کم کردن یک">−</button>' +
        '<button type="button" class="btn primary round big" data-action="dhikr-inc" aria-label="افزودن یک">+</button>' +
        '<button type="button" class="btn ghost round" data-action="dhikr-reset" aria-label="ریست شمارنده">' + UI.icon('refresh') + '</button></div>' +
        '<div class="chips center">' + targetChips + custom + '</div>' +
        '<div class="field target-field"><label for="dhikr-custom">هدف دلخواه</label><div class="inline-form"><input id="dhikr-custom" inputmode="numeric" placeholder="مثلاً ۲۱۰"><button type="button" class="btn ghost sm" data-action="dhikr-custom">تنظیم</button></div></div>' +
        '<div class="actions-row center"><button type="button" class="btn primary" data-action="dhikr-save">ثبت جلسه و شروع تازه</button></div>' +
        '</section>' +
        '<section class="card" aria-labelledby="dsum-title"><h2 class="card-title" id="dsum-title">خلاصه‌ی امروز</h2>' +
        '<div class="stats"><div><span class="stat-num">' + UI.num(todayTotal) + '</span><span class="small muted">مجموع ذکر امروز</span></div>' +
        '<div><span class="stat-num">' + UI.num(todaySessions.length) + '</span><span class="small muted">جلسه‌ی ثبت‌شده</span></div></div></section>' +
        '<section class="card" aria-labelledby="dhist-title"><h2 class="card-title" id="dhist-title">تاریخچه‌ی جلسه‌ها</h2>' +
        (hist ? '<ul class="item-list">' + hist + '</ul>' : UI.emptyState('beads', 'هنوز جلسه‌ای ثبت نشده', 'با دکمه‌ی «ثبت جلسه» یک جلسه را ذخیره کنید.')) +
        '</section>' +
        '<p class="hint small center">این شمارنده فقط ابزار شمارش است و تفسیر یا توصیه‌ی شرعی ارائه نمی‌کند.</p>';
    });
  }

  function mountDhikr() {
    paintDhikr();
  }

  function dhikrStep(delta) {
    var c = currentDhikr();
    var next = Math.max(0, Math.min(1000000, c.count + delta));
    if (next === c.count) return;
    saveDhikr({ count: next });
    paintDhikr();
    if (delta > 0) {
      if (next === c.target) {
        UI.vibrate([60, 40, 60]);
        UI.toast('به هدف ' + UI.num(c.target) + ' رسیدید.', { type: 'success' });
      } else {
        UI.vibrate(10);
      }
      beep();
    } else {
      UI.vibrate(5);
    }
  }

  UI.registerAction('dhikr-inc', function () { dhikrStep(1); });
  UI.registerAction('dhikr-dec', function () { dhikrStep(-1); });
  UI.registerAction('dhikr-target', function (el) {
    saveDhikr({ target: +el.getAttribute('data-t') });
    NS.Router.refresh();
  });
  UI.registerAction('dhikr-custom', function () {
    var input = document.getElementById('dhikr-custom');
    var n = UI.parseNumber(input ? input.value : '');
    if (!isFinite(n) || n < 1 || n > 100000 || Math.round(n) !== n) {
      UI.toast('هدف باید عددی صحیح بین ۱ و ۱۰۰٬۰۰۰ باشد.', { type: 'error' });
      return;
    }
    saveDhikr({ target: n });
    NS.Router.refresh();
  });
  UI.registerChange('dhikr-label', function (el) {
    saveDhikr({ label: String(el.value || 'ذکر').trim().slice(0, 80) || 'ذکر' });
  });
  UI.registerAction('dhikr-reset', function () {
    var c = currentDhikr();
    if (c.count === 0) return;
    return UI.confirm({ title: 'ریست شمارنده', message: 'شمارش فعلی (' + UI.num(c.count) + ') بدون ثبت در تاریخچه پاک شود؟', okLabel: 'ریست', danger: true })
      .then(function (ok) {
        if (!ok) return;
        saveDhikr({ count: 0, startedAt: Date.now() });
        paintDhikr();
        UI.toast('شمارنده ریست شد.');
      });
  });
  UI.registerAction('dhikr-save', function () {
    var c = currentDhikr();
    if (c.count === 0) { UI.toast('هنوز شمارشی انجام نشده است.', { type: 'error' }); return; }
    var rec = Store.sanitizers.dhikr({
      id: Store.newId(), label: c.label, target: c.target, count: c.count,
      date: UI.localIsoDate(Date.now()), at: Date.now()
    });
    return Store.put('dhikr', rec).then(function () {
      saveDhikr({ count: 0, startedAt: Date.now() });
      UI.toast('جلسه ثبت شد.', { type: 'success' });
      NS.Router.refresh();
    });
  });
  UI.registerAction('dhikr-session-delete', function (el) {
    var id = el.getAttribute('data-id');
    return UI.confirm({ title: 'حذف جلسه', message: 'این جلسه از تاریخچه حذف شود؟', okLabel: 'حذف', danger: true }).then(function (ok) {
      if (!ok) return;
      return Store.remove('dhikr', id).then(function () { NS.Router.refresh(); });
    });
  });

  /* ------------------------------ Medications ------------------------------ */

  // Medication schedules are reminders only. They do not give dosage advice.
  var MED_DISCLAIMER = 'این بخش فقط یادآور است و جایگزین توصیه‌ی پزشک یا داروساز نیست. دوز و زمان مصرف را فقط طبق نسخه یا دستور پزشک خود تنظیم کنید. یادآور داخل برنامه وقتی برنامه باز است نمایش داده می‌شود و تضمین نمی‌شود که در پس‌زمینه یا هنگام بسته بودن برنامه اعلام شود.';

  function medActiveOn(med, iso) {
    if (!med.active) return false;
    if (med.start && iso < med.start) return false;
    if (med.end && iso > med.end) return false;
    return true;
  }

  function parseTimes(text) {
    var parts = Cal.toAsciiDigits(String(text || '')).split(/[,،\s]+/);
    var out = [];
    parts.forEach(function (p) {
      var m = /^(\d{1,2}):(\d{2})$/.exec(p.trim());
      if (!m) return;
      var h = +m[1], mi = +m[2];
      if (h > 23 || mi > 59) return;
      var v = (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
      if (out.indexOf(v) === -1) out.push(v);
    });
    return out.sort();
  }

  function renderMeds() {
    var today = UI.localIsoDate(Date.now());
    var nowHm = (function () { var d = new Date(); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); })();
    return Promise.all([Store.getAll('meds'), Store.getAll('medLogs')]).then(function (res) {
      var meds = res[0], logs = res[1];
      var todayLogs = logs.filter(function (l) { return l.date === today; });
      var slots = [];
      meds.forEach(function (m) {
        if (!medActiveOn(m, today)) return;
        m.times.forEach(function (t) {
          var log = todayLogs.filter(function (l) { return l.medId === m.id && l.time === t; })[0];
          slots.push({ med: m, time: t, log: log || null, late: !log && t < nowHm });
        });
      });
      slots.sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
      var pending = slots.filter(function (s) { return !s.log; });
      var nextSlot = pending.filter(function (s) { return s.time >= nowHm; })[0] || null;
      var scheduleHtml = slots.length ? '<ul class="item-list">' + slots.map(function (s) {
        var status = s.log ? (s.log.status === 'taken' ? '<span class="badge badge-ok">مصرف شد</span>' : '<span class="badge">رد شد</span>') :
          (s.late ? '<span class="badge badge-danger">عقب‌افتاده</span>' : '<span class="badge badge-gold">در انتظار</span>');
        var buttons = s.log ? '<button type="button" class="btn ghost sm" data-action="med-undo" data-med="' + UI.esc(s.med.id) + '" data-time="' + s.time + '">لغو ثبت</button>' :
          '<button type="button" class="btn primary sm" data-action="med-log" data-status="taken" data-med="' + UI.esc(s.med.id) + '" data-time="' + s.time + '">مصرف شد</button>' +
          '<button type="button" class="btn ghost sm" data-action="med-log" data-status="skipped" data-med="' + UI.esc(s.med.id) + '" data-time="' + s.time + '">رد کردن</button>';
        return '<li class="item-row med-slot"><span class="item-text"><span class="item-title">' + UI.esc(s.med.name) + (s.med.dose ? ' — ' + UI.esc(s.med.dose) : '') + '</span>' +
          '<span class="item-meta"><span class="badge">ساعت ' + UI.num(s.time) + '</span>' + status + '</span>' +
          '<span class="actions-row tight">' + buttons + '</span></span></li>';
      }).join('') + '</ul>' : UI.emptyState('pill', 'امروز دارویی برنامه‌ریزی نشده', 'با فرم زیر یک برنامه‌ی یادآوری بسازید.');
      var upcoming = nextSlot ? 'بعدی: ' + UI.esc(nextSlot.med.name) + ' ساعت ' + UI.num(nextSlot.time) : (pending.length ? 'موارد باقی‌مانده‌ی امروز گذشته‌اند.' : 'برای امروز موردی باقی نمانده است.');
      var medList = meds.length ? '<ul class="item-list">' + meds.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (m) {
        return '<li class="item-row"><span class="item-text"><span class="item-title">' + UI.esc(m.name) + '</span>' +
          '<span class="item-meta">' + (m.dose ? '<span class="badge">' + UI.esc(m.dose) + '</span>' : '') +
          '<span class="badge">' + UI.esc(m.times.map(UI.num).join('، ') || 'بدون ساعت') + '</span>' +
          (m.start ? '<span class="badge">از ' + UI.esc(UI.isoPersian(m.start)) + '</span>' : '') +
          (m.end ? '<span class="badge">تا ' + UI.esc(UI.isoPersian(m.end)) + '</span>' : '') +
          (!m.active ? '<span class="badge">متوقف</span>' : '') + '</span></span>' +
          '<span class="row-actions">' +
          '<button type="button" class="icon-btn sm" data-action="med-edit" data-id="' + UI.esc(m.id) + '" aria-label="ویرایش ' + UI.esc(m.name) + '">' + UI.icon('edit') + '</button>' +
          '<button type="button" class="icon-btn sm danger" data-action="med-delete" data-id="' + UI.esc(m.id) + '" aria-label="حذف ' + UI.esc(m.name) + '">' + UI.icon('trash') + '</button></span></li>';
      }).join('') + '</ul>' : '<p class="muted small">هنوز برنامه‌ای ثبت نشده است.</p>';
      var names = {};
      meds.forEach(function (m) { names[m.id] = m.name; });
      var history = logs.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 30).map(function (l) {
        return '<li class="item-row"><span class="item-text"><span class="item-title">' + UI.esc(names[l.medId] || 'دارو') + '</span>' +
          '<span class="item-meta"><span class="badge">' + UI.esc(UI.isoPersian(l.date)) + '</span><span class="badge">ساعت ' + UI.num(l.time) + '</span>' +
          '<span class="badge">' + (l.status === 'taken' ? 'مصرف شد' : 'رد شد') + '</span></span></span></li>';
      }).join('');
      return '<section class="page-head"><h1 class="page-title">یادآور دارو</h1>' +
        '<p class="page-sub">برنامه‌ی یادآوری شخصی</p></section>' +
        '<section class="notice warn" role="note"><strong>توجه:</strong> ' + UI.esc(MED_DISCLAIMER) + '</section>' +
        '<section class="card" aria-labelledby="today-meds"><div class="card-head"><h2 class="card-title" id="today-meds">برنامه‌ی امروز</h2>' +
        '<span class="small muted">' + upcoming + '</span></div>' + scheduleHtml + '</section>' +
        '<section class="card" aria-labelledby="med-form-title"><h2 class="card-title" id="med-form-title">افزودن یا ویرایش برنامه</h2>' +
        '<form class="form-stack" data-submit="med-save" novalidate>' +
        '<input type="hidden" name="id" value="">' +
        '<div class="field"><label for="med-name">نام دارو</label><input id="med-name" name="name" maxlength="120" required placeholder="نام دارو"></div>' +
        '<div class="field"><label for="med-dose">توضیح دوز (طبق دستور پزشک)</label><input id="med-dose" name="dose" maxlength="200" placeholder="مثلاً یک عدد — طبق نسخه"></div>' +
        '<div class="field"><label for="med-times">ساعت‌های یادآوری</label><input id="med-times" name="times" maxlength="100" placeholder="مثلاً ۰۸:۰۰، ۲۰:۰۰" inputmode="numeric"><small class="hint">با ویرگول جدا کنید؛ قالب ساعت: ساعت:دقیقه</small></div>' +
        '<div class="field-row"><div class="field"><label for="med-start">شروع</label><input id="med-start" type="date" name="start" value="' + today + '" required></div>' +
        '<div class="field"><label for="med-end">پایان (اختیاری)</label><input id="med-end" type="date" name="end"></div></div>' +
        '<label class="toggle-row"><input type="checkbox" name="active" checked><span>برنامه فعال باشد</span></label>' +
        '<p class="error-text" role="alert" id="med-error"></p>' +
        '<div class="actions-row"><button type="submit" class="btn primary">ذخیره‌ی برنامه</button>' +
        '<button type="button" class="btn ghost" data-action="med-reset-form">پاک کردن فرم</button></div></form></section>' +
        '<section class="card" aria-labelledby="med-list-title"><h2 class="card-title" id="med-list-title">برنامه‌های ثبت‌شده</h2>' + medList + '</section>' +
        '<section class="card" aria-labelledby="med-hist-title"><h2 class="card-title" id="med-hist-title">تاریخچه‌ی یادآورها</h2>' +
        (history ? '<ul class="item-list">' + history + '</ul>' : '<p class="muted small">هنوز ثبتی وجود ندارد.</p>') + '</section>';
    });
  }

  function medForm(med) {
    var f = document.querySelector('form[data-submit="med-save"]');
    if (!f) return;
    f.elements.id.value = med ? med.id : '';
    f.elements.name.value = med ? med.name : '';
    f.elements.dose.value = med ? med.dose : '';
    f.elements.times.value = med ? med.times.map(function (t) { return UI.num(t); }).join('، ') : '';
    f.elements.start.value = med && med.start ? med.start : UI.localIsoDate(Date.now());
    f.elements.end.value = med && med.end ? med.end : '';
    f.elements.active.checked = med ? med.active : true;
    f.elements.name.focus();
    f.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  UI.registerSubmit('med-save', function (form) {
    var err = form.querySelector('#med-error');
    var times = parseTimes(form.elements.times.value);
    var name = String(form.elements.name.value || '').trim();
    if (!name) { err.textContent = 'نام دارو لازم است.'; return false; }
    if (!times.length) { err.textContent = 'حداقل یک ساعت معتبر (مثلاً ۰۸:۰۰) وارد کنید.'; return false; }
    if (form.elements.end.value && form.elements.end.value < form.elements.start.value) {
      err.textContent = 'تاریخ پایان نباید قبل از شروع باشد.';
      return false;
    }
    err.textContent = '';
    var existingId = form.elements.id.value;
    var rec = Store.sanitizers.meds({
      id: existingId || Store.newId(), name: name, dose: form.elements.dose.value,
      times: times, start: form.elements.start.value, end: form.elements.end.value,
      active: form.elements.active.checked, createdAt: Date.now()
    });
    return Store.put('meds', rec).then(function () {
      UI.toast('برنامه‌ی دارو ذخیره شد.', { type: 'success' });
      NS.Router.refresh();
      return false;
    });
  });

  UI.registerAction('med-reset-form', function () { medForm(null); });

  UI.registerAction('med-edit', function (el) {
    return Store.getAll('meds').then(function (list) {
      var m = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (m) medForm(m);
    });
  });

  UI.registerAction('med-delete', function (el) {
    var id = el.getAttribute('data-id');
    return UI.confirm({ title: 'حذف برنامه‌ی دارو', message: 'این برنامه حذف شود؟ تاریخچه‌ی ثبت‌شده هم حذف می‌شود.', okLabel: 'حذف', danger: true })
      .then(function (ok) {
        if (!ok) return;
        return Store.getAll('medLogs').then(function (logs) {
          return Promise.all(logs.filter(function (l) { return l.medId === id; }).map(function (l) { return Store.remove('medLogs', l.id); }));
        }).then(function () { return Store.remove('meds', id); }).then(function () {
          UI.toast('برنامه حذف شد.');
          NS.Router.refresh();
        });
      });
  });

  UI.registerAction('med-log', function (el) {
    var status = el.getAttribute('data-status');
    var medId = el.getAttribute('data-med');
    var time = el.getAttribute('data-time');
    var today = UI.localIsoDate(Date.now());
    var rec = Store.sanitizers.medLogs({ id: Store.newId(), medId: medId, date: today, time: time, status: status, at: Date.now() });
    return Store.put('medLogs', rec).then(function () {
      UI.vibrate(15);
      UI.toast(status === 'taken' ? 'ثبت شد: مصرف شد.' : 'ثبت شد: رد شد.', { type: 'success' });
      NS.Router.refresh();
    });
  });

  UI.registerAction('med-undo', function (el) {
    var medId = el.getAttribute('data-med');
    var time = el.getAttribute('data-time');
    var today = UI.localIsoDate(Date.now());
    return Store.getAll('medLogs').then(function (logs) {
      var hit = logs.filter(function (l) { return l.medId === medId && l.time === time && l.date === today; });
      return Promise.all(hit.map(function (l) { return Store.remove('medLogs', l.id); }));
    }).then(function () { NS.Router.refresh(); });
  });

  /* ------------------------------ Weather ------------------------------ */

  var WMO = {
    0: 'آسمان صاف', 1: 'عمدتاً صاف', 2: 'کمی ابری', 3: 'ابری',
    45: 'مه', 48: 'مه یخ‌زده',
    51: 'نم‌نم باران خفیف', 53: 'نم‌نم باران', 55: 'نم‌نم باران شدید',
    56: 'نم‌نم یخ‌زده', 57: 'نم‌نم یخ‌زده شدید',
    61: 'باران خفیف', 63: 'باران', 65: 'باران شدید',
    66: 'باران یخ‌زده', 67: 'باران یخ‌زده شدید',
    71: 'برف خفیف', 73: 'برف', 75: 'برف شدید', 77: 'دانه‌های برف',
    80: 'رگبار خفیف', 81: 'رگبار', 82: 'رگبار شدید',
    85: 'بارش برف خفیف', 86: 'بارش برف شدید',
    95: 'طوفان رعد و برق', 96: 'طوفان با تگرگ خفیف', 99: 'طوفان با تگرگ شدید'
  };
  var WEATHER_KEY = 'fetros.weather.cache';

  function describe(code) {
    return WMO[code] || 'وضعیت نامشخص';
  }

  function fmtTime(ms) {
    var d = new Date(ms);
    var jdn = Cal.gregorianToJdn(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return UI.persianLong(jdn) + '، ساعت ' + UI.clockOf(ms);
  }

  function cached() {
    try {
      var raw = global.localStorage.getItem(WEATHER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCache(obj) {
    try { global.localStorage.setItem(WEATHER_KEY, JSON.stringify(obj)); } catch (e) { /* storage full: ignore */ }
  }

  // Open-Meteo: free for non-commercial use, no API key. Attribution is shown in the UI.
  function fetchWeather(cityId) {
    var city = NS.Data.findCity(cityId) || NS.Data.cities[0];
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.lat + '&longitude=' + city.lon +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=auto&forecast_days=5';
    if (global.navigator && global.navigator.onLine === false) {
      return Promise.reject(new Error('offline'));
    }
    var ctrl = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    var timer = global.setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);
    return global.fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error('http-' + r.status);
        return r.json();
      }).then(function (j) {
        var c = j && j.current;
        var d = j && j.daily;
        if (!c || typeof c.temperature_2m !== 'number') throw new Error('bad-data');
        var data = {
          current: {
            temp: c.temperature_2m, humidity: c.relative_humidity_2m, wind: c.wind_speed_10m,
            code: c.weather_code, time: c.time
          },
          daily: (d && d.time ? d.time : []).map(function (day, i) {
            return { date: day, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], code: d.weather_code[i] };
          })
        };
        var entry = { cityId: city.id, cityName: city.name, fetchedAt: Date.now(), data: data };
        writeCache(entry);
        return entry;
      }).finally(function () { global.clearTimeout(timer); });
  }

  function renderWeather() {
    var s = UI.settings();
    var city = NS.Data.findCity(s.weatherCityId) || NS.Data.cities[0];
    var cache = cached();
    var mine = cache && cache.cityId === city.id ? cache : null;
    var cityOpts = NS.Data.cities.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === city.id ? ' selected' : '') + '>' + UI.esc(c.name) + '</option>';
    }).join('');
    var body;
    if (!mine) {
      body = UI.emptyState('cloud', 'داده‌ی هواشناسی برای این شهر نیست', 'با دکمه‌ی بروزرسانی، داده‌ی جدید دریافت می‌شود. این بخش به اینترنت نیاز دارد.');
    } else {
      var d = mine.data;
      var c = d.current;
      body = '<div class="weather-row big"><div class="weather-temp">' + UI.num(Math.round(c.temp)) + '°</div>' +
        '<div><div class="wx-desc">' + UI.esc(describe(c.code)) + '</div>' +
        '<div class="small muted">' + UI.esc(mine.cityName) + '</div></div></div>' +
        '<div class="stats three"><div><span class="stat-num">' + UI.num(Math.round(c.humidity)) + '٪</span><span class="small muted">رطوبت</span></div>' +
        '<div><span class="stat-num">' + UI.num(Math.round(c.wind)) + '</span><span class="small muted">کیلومتر بر ساعت باد</span></div>' +
        '<div><span class="stat-num">' + UI.num(Math.round(c.temp)) + '°</span><span class="small muted">دما</span></div></div>' +
        '<h3 class="sub-title">پیش‌بینی ۵ روز</h3><ul class="forecast">' + d.daily.map(function (x) {
          var jdn = Cal.gregorianToJdn(+x.date.slice(0, 4), +x.date.slice(5, 7), +x.date.slice(8, 10));
          return '<li><span class="fc-day">' + UI.esc(Cal.WEEKDAYS[Cal.weekdayOf(jdn)]) + '</span>' +
            '<span class="fc-desc">' + UI.esc(describe(x.code)) + '</span>' +
            '<span class="fc-temp">' + UI.num(Math.round(x.tmax)) + '° / ' + UI.num(Math.round(x.tmin)) + '°</span></li>';
        }).join('') + '</ul>' +
        '<p class="small muted">آخرین بروزرسانی: ' + UI.esc(fmtTime(mine.fetchedAt)) + '</p>';
    }
    return '<section class="page-head"><h1 class="page-title">هواشناسی</h1>' +
      '<p class="page-sub">اختیاری؛ فقط با اتصال اینترنت</p></section>' +
      '<section class="card" aria-labelledby="wx-city"><h2 class="card-title" id="wx-city">شهر</h2>' +
      '<div class="field"><label for="wx-select">انتخاب شهر</label><select id="wx-select" data-change="weather-city">' + cityOpts + '</select></div>' +
      '<div class="actions-row"><button type="button" class="btn primary sm" data-action="weather-refresh" id="wx-refresh">' + UI.icon('refresh') + ' بروزرسانی</button>' +
      '<label class="toggle-row"><input type="checkbox" data-change="setting-toggle" data-key="weatherEnabled"' + (s.weatherEnabled ? ' checked' : '') + '><span>نمایش کارت هوا در خانه</span></label></div>' +
      '<p id="wx-status" class="small muted" role="status" aria-live="polite"></p></section>' +
      '<section class="card" id="wx-body" aria-live="polite">' + body + '</section>' +
      '<section class="card"><p class="small muted">داده‌ها از Open-Meteo.com با مجوز CC BY 4.0 دریافت می‌شوند؛ برای استفاده‌ی غیرتجاری بدون کلید API. هنگام نمایش، منبع ذکر می‌شود. پیش‌بینی‌ها تقریبی‌اند و برای تصمیم‌های حیاتی به هشدارهای رسمی هواشناسی مراجعه کنید.</p></section>';
  }

  function mountWeather() {
    var s = UI.settings();
    var c = cached();
    var stale = !c || c.cityId !== s.weatherCityId || Date.now() - c.fetchedAt > 3 * 3600000;
    if (s.weatherEnabled && stale && global.navigator.onLine !== false) {
      refreshWeather(s.weatherCityId);
    }
  }

  function refreshWeather(cityId) {
    var status = document.getElementById('wx-status');
    var btn = document.getElementById('wx-refresh');
    if (status) status.textContent = 'در حال دریافت داده…';
    if (btn) btn.disabled = true;
    return fetchWeather(cityId).then(function () {
      NS.Router.refresh();
    }).catch(function (err) {
      var msg = err && err.message === 'offline' ? 'اتصال اینترنت برقرار نیست. آخرین داده‌ی ذخیره‌شده نمایش داده می‌شود.' :
        'دریافت داده‌ی هواشناسی ممکن نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';
      if (status) { status.textContent = msg; status.className = 'small text-danger'; }
      UI.toast(msg, { type: 'error' });
      if (btn) btn.disabled = false;
    });
  }

  UI.registerChange('weather-city', function (el) {
    NS.Store.setSettings({ weatherCityId: el.value });
    NS.Router.refresh();
  });
  UI.registerAction('weather-refresh', function () {
    return refreshWeather(UI.settings().weatherCityId);
  });

  /* ------------------------------ Actions: organizer ------------------------------ */

  UI.registerAction('org-tab', function (el) {
    org.tab = el.getAttribute('data-tab');
    NS.Router.navigate('#/organizer/' + org.tab);
  });
  UI.registerAction('task-filter', function (el) { org.taskFilter = el.getAttribute('data-f'); NS.Router.refresh(); });
  UI.registerAction('note-filter', function (el) { org.noteFilter = el.getAttribute('data-f'); NS.Router.refresh(); });
  UI.registerAction('rem-filter', function (el) { org.reminderFilter = el.getAttribute('data-f'); NS.Router.refresh(); });
  UI.registerChange('task-sort', function (el) { org.taskSort = el.value; NS.Router.refresh(); });

  UI.registerSubmit('task-add', function (form) {
    var title = String(form.elements.title.value || '').trim();
    var err = form.querySelector('#task-error');
    if (!title) { err.textContent = 'عنوان کار را وارد کنید.'; return false; }
    err.textContent = '';
    var rec = Store.sanitizers.tasks({
      id: Store.newId(), title: title, done: false, due: form.elements.due.value,
      priority: form.elements.high.checked ? 'high' : 'normal', createdAt: Date.now()
    });
    return Store.put('tasks', rec).then(function () {
      UI.toast('کار اضافه شد.', { type: 'success' });
      NS.Router.refresh();
      return false;
    });
  });

  UI.registerChange('task-toggle', function (el) {
    return Store.getAll('tasks').then(function (list) {
      var t = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (!t) return;
      var next = Store.sanitizers.tasks(Object.assign({}, t, { done: el.checked, completedAt: el.checked ? Date.now() : null }));
      return Store.put('tasks', next).then(function () {
        if (el.checked) UI.vibrate(10);
        NS.Router.refresh();
      });
    });
  });
  UI.registerAction('task-edit', function (el) {
    return Store.getAll('tasks').then(function (list) {
      var t = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (t) openTaskEditor(t);
    });
  });
  UI.registerAction('task-delete', function (el) {
    var id = el.getAttribute('data-id');
    return UI.confirm({ title: 'حذف کار', message: 'این کار حذف شود؟', okLabel: 'حذف', danger: true }).then(function (ok) {
      if (!ok) return;
      return Store.remove('tasks', id).then(function () { UI.toast('کار حذف شد.'); NS.Router.refresh(); });
    });
  });

  UI.registerAction('note-new', function () { openNoteEditor(null); });
  UI.registerAction('note-edit', function (el) {
    return Store.getAll('notes').then(function (list) {
      var n = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (n) openNoteEditor(n);
    });
  });
  UI.registerAction('note-fav', function (el) {
    return Store.getAll('notes').then(function (list) {
      var n = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (!n) return;
      return Store.put('notes', Store.sanitizers.notes(Object.assign({}, n, { favorite: !n.favorite, updatedAt: n.updatedAt }))).then(function () {
        NS.Router.refresh();
      });
    });
  });
  UI.registerAction('note-delete', function (el) {
    var id = el.getAttribute('data-id');
    return UI.confirm({ title: 'حذف یادداشت', message: 'این یادداشت برای همیشه حذف شود؟', okLabel: 'حذف', danger: true }).then(function (ok) {
      if (!ok) return;
      return Store.remove('notes', id).then(function () { UI.toast('یادداشت حذف شد.'); NS.Router.refresh(); });
    });
  });
  UI.registerInput('note-search', UI.debounce(function (el) {
    org.noteQuery = el.value;
    Store.getAll('notes').then(function (list) {
      var box = document.getElementById('note-results');
      if (!box) return;
      var html = renderNotes(list);
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      var fresh = tmp.querySelector('#note-results');
      box.innerHTML = fresh ? fresh.innerHTML : '';
    });
  }, 200));

  UI.registerSubmit('reminder-add', function (form) {
    var rec = saveReminderFromForm(form, null);
    if (!rec) return false;
    if (rec.dueAt <= Date.now()) {
      form.querySelector('#rem-error').textContent = 'زمان یادآور باید در آینده باشد.';
      return false;
    }
    return Store.put('reminders', rec).then(function () {
      UI.toast('یادآور ثبت شد.', { type: 'success' });
      NS.Router.refresh();
      return false;
    });
  });
  UI.registerChange('reminder-toggle', function (el) {
    return Store.getAll('reminders').then(function (list) {
      var r = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (!r) return;
      return Store.put('reminders', Store.sanitizers.reminders(Object.assign({}, r, { done: el.checked }))).then(function () {
        NS.Router.refresh();
      });
    });
  });
  UI.registerAction('reminder-edit', function (el) {
    return Store.getAll('reminders').then(function (list) {
      var r = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (!r) return;
      UI.modal({
        title: 'ویرایش یادآور',
        body: reminderFormBody(r),
        submitLabel: 'ذخیره',
        onSubmit: function (form) {
          var rec = saveReminderFromForm(form, r);
          if (!rec) return false;
          return Store.put('reminders', rec).then(function () {
            UI.toast('یادآور ذخیره شد.', { type: 'success' });
            NS.Router.refresh();
            return true;
          });
        }
      });
    });
  });
  UI.registerAction('reminder-delete', function (el) {
    var id = el.getAttribute('data-id');
    return UI.confirm({ title: 'حذف یادآور', message: 'این یادآور حذف شود؟', okLabel: 'حذف', danger: true }).then(function (ok) {
      if (!ok) return;
      return Store.remove('reminders', id).then(function () { UI.toast('یادآور حذف شد.'); NS.Router.refresh(); });
    });
  });

  /* ------------------------------ Checker (while app is open) ------------------------------ */

  // Called every ~20 seconds by script.js. Fires due reminders and medication slots.
  var MED_WINDOW_MIN = 20; // minutes after a dose time during which a medication alert fires

  function tick() {
    var now = Date.now();
    var settings = Store.getSettings();
    var rt = Store.getRuntime();
    var medSeen = rt.medSeen || {};
    var changed = false;
    var jobs = [];

    jobs.push(Store.getAll('reminders').then(function (list) {
      var writes = [];
      list.forEach(function (r) {
        if (r.done || r.dueAt > now) return;
        if (r.firedAt && r.firedAt >= r.dueAt) return;
        var next = Object.assign({}, r, { firedAt: now });
        if (r.recur && r.recur !== 'none') next.dueAt = nextDue(r.dueAt, r.recur, now);
        writes.push(Store.put('reminders', Store.sanitizers.reminders(next)));
        if (settings.notifyReminders) notify('یادآور: ' + r.title, '', 'rem-' + r.id);
        else UI.toast('یادآور: ' + r.title, { type: 'info', timeout: 6000 });
        UI.vibrate([80, 60, 80]);
      });
      return Promise.all(writes).then(function (out) {
        if (out.length && NS.Router) NS.Router.refreshIfOn(['organizer', 'home']);
      });
    }));

    if (settings.notifyMeds) {
      jobs.push(Promise.all([Store.getAll('meds'), Store.getAll('medLogs')]).then(function (res) {
        var today = UI.localIsoDate(now);
        var d = new Date(now);
        var nowMin = d.getHours() * 60 + d.getMinutes();
        res[0].forEach(function (m) {
          if (!medActiveOn(m, today)) return;
          m.times.forEach(function (t) {
            // Only slots from the last MED_WINDOW_MIN minutes: a slot that passed
            // hours ago (e.g. added after the time) must not alert on first open.
            var slotMin = Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
            var late = nowMin - slotMin;
            if (late < 0 || late > MED_WINDOW_MIN) return;
            var key = today + '|' + m.id + '|' + t;
            if (medSeen[key]) return;
            var logged = res[1].some(function (l) { return l.medId === m.id && l.date === today && l.time === t; });
            if (logged) return;
            medSeen[key] = true;
            changed = true;
            notify('یادآور دارو: ' + m.name, 'ساعت ' + UI.num(t) + ' — طبق دستور پزشک', 'med-' + key);
          });
        });
      }));
    }

    return Promise.all(jobs).then(function () {
      if (changed) {
        // keep the map small
        var keys = Object.keys(medSeen);
        if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(function (k) { delete medSeen[k]; });
        Store.setRuntime({ medSeen: medSeen });
      }
    });
  }

  /* ------------------------------ Registration ------------------------------ */

  NS.Views = NS.Views || {};
  NS.Views.tools = { title: 'ابزارها', render: renderTools };
  NS.Views.organizer = { title: 'وظایف و یادداشت‌ها', render: renderOrganizer, mount: function () { } };
  NS.Views.dhikr = { title: 'تسبیح و ذکر', render: renderDhikr, mount: mountDhikr };
  NS.Views.meds = { title: 'یادآور دارو', render: renderMeds, mount: function () { } };
  NS.Views.weather = { title: 'هواشناسی', render: renderWeather, mount: mountWeather };

  NS.Weather = { cached: cached, describe: describe, fmtTime: fmtTime, fetch: fetchWeather };
  NS.Notify = { show: notify };
  NS.Tools = { tick: tick, nextDue: nextDue, parseTimes: parseTimes, openTaskEditor: openTaskEditor, openNoteEditor: openNoteEditor };
})(typeof window !== 'undefined' ? window : globalThis);
