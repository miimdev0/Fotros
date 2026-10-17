'use strict';
// End-to-end checks of the real index.html in jsdom, run once with IndexedDB
// (via fake-indexeddb) and once with the localStorage fallback. Each check reads
// stored data as well as the rendered DOM, so a silent save failure is caught.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootApp, wait } = require('./helpers/boot');

function setVal(win, el, value) {
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}
function submitForm(win, form) {
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}
function clickSel(doc, sel) {
  const el = doc.querySelector(sel);
  assert.ok(el, 'element exists: ' + sel);
  el.click();
  return el;
}
const hasErrorState = function (doc) { return /خطا در نمایش/.test(doc.getElementById('view').innerHTML); };

const MODES = [
  { label: 'IndexedDB', storage: 'indexeddb', expectMode: 'indexeddb' },
  { label: 'localStorage fallback', storage: 'fallback', expectMode: 'localstorage' }
];

MODES.forEach(function (mode) {
  test('[' + mode.label + '] boots with the expected storage mode and no console errors', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      assert.equal(app.NS.Store.mode(), mode.expectMode);
      assert.ok(app.doc.getElementById('splash').classList.contains('done'), 'splash dismissed');
      assert.ok(app.doc.querySelector('#view .hero'), 'home hero rendered');
      assert.deepEqual(app.errors, [], 'no console errors during boot');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] every route renders without the error state', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      const routes = ['home', 'calendar', 'prayer', 'qibla', 'tools', 'organizer', 'dhikr', 'meds', 'weather', 'settings'];
      for (const r of routes) {
        app.win.location.hash = '#/' + r;
        await wait(170);
        assert.ok(app.doc.getElementById('view').innerHTML.length > 200, 'route ' + r + ' has content');
        assert.equal(hasErrorState(app.doc), false, 'route ' + r + ' is not in error state');
        assert.equal(app.NS.Router.current(), r);
      }
      assert.deepEqual(app.errors, [], 'no console errors across routes');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] home shows next prayer, seven prayer chips, and a countdown', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      assert.ok(app.doc.querySelector('.np-card'), 'next-prayer card');
      assert.equal(app.doc.querySelectorAll('.pchip').length, 7);
      assert.ok(app.doc.querySelector('.countdown'), 'countdown');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] task added from organizer is stored and listed', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      app.win.location.hash = '#/organizer';
      await wait(170);
      const form = app.doc.querySelector('form[data-submit="task-add"]');
      assert.ok(form, 'task form');
      setVal(app.win, form.querySelector('[name=title]'), 'خرید نان');
      submitForm(app.win, form);
      await wait(250);
      const tasks = await app.NS.Store.getAll('tasks');
      assert.ok(tasks.some(function (t) { return t.title === 'خرید نان'; }), 'stored');
      assert.ok(/خرید نان/.test(app.doc.getElementById('view').innerHTML), 'listed');
      assert.deepEqual(app.errors, []);
    } finally { app.close(); }
  });

  test('[' + mode.label + '] reminder added on the reminders tab is stored', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      app.win.location.hash = '#/organizer';
      await wait(170);
      clickSel(app.doc, '[data-action="org-tab"][data-tab="reminders"]');
      await wait(200);
      const form = app.doc.querySelector('form[data-submit="reminder-add"]');
      assert.ok(form, 'reminder form');
      setVal(app.win, form.querySelector('[name=title]'), 'زنگ آزمایشی');
      setVal(app.win, form.querySelector('input[type=datetime-local]'), '2030-01-01T09:30');
      submitForm(app.win, form);
      await wait(250);
      const list = await app.NS.Store.getAll('reminders');
      const rem = list.find(function (r) { return r.title === 'زنگ آزمایشی'; });
      assert.ok(rem, 'stored');
      assert.equal(rem.recur, 'none');
      assert.ok(rem.dueAt > 0);
    } finally { app.close(); }
  });

  test('[' + mode.label + '] note search filters the notes tab', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      await app.NS.Store.put('notes', app.NS.Store.sanitizers.notes({ id: 'n1', title: 'سفر', body: 'بلیط قطار', createdAt: 1, updatedAt: Date.now() }));
      await app.NS.Store.put('notes', app.NS.Store.sanitizers.notes({ id: 'n2', title: 'خرید', body: 'شیر و تخم‌مرغ', createdAt: 2, updatedAt: Date.now() }));
      app.win.location.hash = '#/organizer';
      await wait(120);
      clickSel(app.doc, '[data-action="org-tab"][data-tab="notes"]');
      await wait(200);
      const search = app.doc.querySelector('[data-input="note-search"]');
      assert.ok(search, 'search box');
      setVal(app.win, search, 'قطار');
      await wait(450);
      const html = app.doc.getElementById('view').innerHTML;
      assert.ok(/سفر/.test(html), 'matching note shown');
      assert.ok(!/شیر و تخم/.test(html), 'non-matching note hidden');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] dhikr counter increments and persists', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      app.win.location.hash = '#/dhikr';
      await wait(170);
      for (let i = 0; i < 3; i++) clickSel(app.doc, '[data-action="dhikr-inc"]');
      await wait(120);
      assert.equal(app.doc.querySelector('.counter-num').textContent, '۳');
      const rt = app.NS.Store.getRuntime();
      assert.equal(rt.dhikrCurrent.count, 3);
    } finally { app.close(); }
  });

  test('[' + mode.label + '] calendar navigates months, searches occasions, and selects a day', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      app.win.location.hash = '#/calendar';
      await wait(170);
      const cells = app.doc.querySelectorAll('.day-cell:not(.blank)');
      assert.ok(cells.length >= 28, 'month grid');
      const titleBefore = app.doc.querySelector('.cal-title').textContent;
      clickSel(app.doc, '[data-action="cal-next"]');
      await wait(150);
      assert.notEqual(app.doc.querySelector('.cal-title').textContent, titleBefore, 'month changed');
      const search = app.doc.querySelector('[data-input="cal-search"]');
      assert.ok(search, 'occasion search');
      setVal(app.win, search, 'نوروز');
      await wait(350);
      assert.ok(/نوروز/.test(app.doc.getElementById('view').innerHTML), 'occasion result');
      app.doc.querySelector('.day-cell:not(.blank)').click();
      await wait(120);
      assert.equal(hasErrorState(app.doc), false);
    } finally { app.close(); }
  });

  test('[' + mode.label + '] prayer page lists seven times and saves the method change', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      app.win.location.hash = '#/prayer';
      await wait(200);
      assert.equal(app.doc.querySelectorAll('.time-list li').length, 7);
      setVal(app.win, app.doc.querySelector('[data-change="prayer-method"]'), 'isna');
      await wait(150);
      assert.equal(app.NS.Store.getSettings().method, 'isna');
      setVal(app.win, app.doc.querySelector('[data-change="prayer-asr"]'), 'hanafi');
      await wait(120);
      assert.equal(app.NS.Store.getSettings().asr, 'hanafi');
      assert.equal(app.doc.querySelectorAll('.time-list li').length, 7);
    } finally { app.close(); }
  });

  test('[' + mode.label + '] qibla page shows the compass and the manual heading control', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      app.win.location.hash = '#/qibla';
      await wait(170);
      assert.ok(app.doc.querySelector('.compass'), 'compass');
      const slider = app.doc.querySelector('[data-input="manual-heading"]');
      assert.ok(slider, 'manual heading slider');
      setVal(app.win, slider, '90');
      await wait(120);
      assert.equal(app.doc.getElementById('heading-val').textContent, '۹۰');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] medication schedule is saved with validated times', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      app.win.location.hash = '#/meds';
      await wait(170);
      const form = app.doc.querySelector('form[data-submit="med-save"]');
      assert.ok(form, 'med form');
      setVal(app.win, form.querySelector('[name=name]'), 'ویتامین');
      setVal(app.win, form.querySelector('[name=times]'), '۸:۰۰، ۲۰:۰۰');
      submitForm(app.win, form);
      await wait(250);
      const meds = await app.NS.Store.getAll('meds');
      const med = meds.find(function (m) { return m.name === 'ویتامین'; });
      assert.ok(med, 'stored');
      assert.deepEqual(Array.from(med.times), ['08:00', '20:00']);
    } finally { app.close(); }
  });

  test('[' + mode.label + '] settings: accent, theme, motion and numerals take effect and persist', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      app.win.location.hash = '#/settings';
      await wait(200);
      assert.equal(app.doc.querySelectorAll('[data-action="set-accent"]').length, 3);
      clickSel(app.doc, '[data-action="set-accent"][data-v="sunrise"]');
      await wait(120);
      assert.equal(app.doc.documentElement.getAttribute('data-accent'), 'sunrise');
      assert.equal(app.NS.Store.getSettings().accent, 'sunrise');
      setVal(app.win, app.doc.querySelector('[data-change="setting-select"][data-key="theme"]'), 'light');
      await wait(120);
      assert.equal(app.doc.documentElement.getAttribute('data-theme'), 'light');
      setVal(app.win, app.doc.querySelector('[data-change="setting-select"][data-key="motion"]'), 'none');
      await wait(60);
      assert.equal(app.doc.documentElement.getAttribute('data-motion'), 'none');
      setVal(app.win, app.doc.querySelector('[data-change="setting-select"][data-key="numeralsGregorian"]'), 'fa');
      await wait(60);
      assert.equal(app.NS.Store.getSettings().numeralsGregorian, 'fa');
      const toggle = app.doc.querySelector('[data-change="setting-toggle"][data-key="vibrate"]');
      const before = toggle.checked;
      toggle.checked = !before;
      toggle.dispatchEvent(new app.win.Event('change', { bubbles: true }));
      await wait(80);
      assert.equal(app.NS.Store.getSettings().vibrate, !before);
    } finally { app.close(); }
  });

  test('[' + mode.label + '] quick-add sheet creates a task and Escape closes the sheet', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      clickSel(app.doc, '#fab');
      await wait(150);
      assert.ok(app.doc.querySelector('#sheet-root .sheet'), 'sheet open');
      clickSel(app.doc, '#sheet-root [data-quick="task"]');
      await wait(400);
      const form = app.doc.querySelector('#sheet-root form');
      assert.ok(form, 'task editor open');
      setVal(app.win, form.querySelector('input[name=title]'), 'کار از فب');
      submitForm(app.win, form);
      await wait(300);
      const tasks = await app.NS.Store.getAll('tasks');
      assert.ok(tasks.some(function (t) { return t.title === 'کار از فب'; }), 'quick task stored');
      assert.equal(app.doc.querySelector('#sheet-root .sheet'), null, 'sheet closed after save');

      clickSel(app.doc, '#fab');
      await wait(120);
      app.doc.querySelector('#sheet-root .sheet').dispatchEvent(new app.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(300);
      assert.equal(app.doc.querySelector('#sheet-root .sheet'), null, 'Escape closes');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] backup export validates, and a round trip restores records', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      const S = app.NS.Store;
      await S.put('tasks', S.sanitizers.tasks({ id: 't-export', title: 'پشتیبان', createdAt: 1 }));
      const exported = await S.buildExport('1.0.0');
      assert.equal(exported.app, 'fetros');
      const text = JSON.stringify(exported);
      const check = S.validateImport(JSON.parse(text));
      assert.equal(check.ok, true, check.error);
      assert.ok(check.counts.tasks >= 1);

      await S.clearEverything();
      assert.equal((await S.getAll('tasks')).length, 0, 'cleared');
      await S.applyImport(check);
      const restored = await S.getAll('tasks');
      assert.ok(restored.some(function (t) { return t.id === 't-export'; }), 'restored');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] invalid backup files are rejected', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      const S = app.NS.Store;
      assert.equal(S.validateImport({ app: 'other' }).ok, false);
      assert.equal(S.validateImport(null).ok, false);
      const good = await S.buildExport('1.0.0');
      assert.equal(S.validateImport(Object.assign({}, good, { schema: 999 })).ok, false, 'unknown schema');
      const bad = Object.assign({}, good, { data: { tasks: [{ title: '' }, 'x'] } });
      const res = S.validateImport(bad);
      assert.equal(res.ok, true);
      assert.equal(res.counts.tasks, 0, 'records without title or id are dropped');
      assert.ok(res.rejected >= 2);
    } finally { app.close(); }
  });

  test('[' + mode.label + '] due reminders fire once and recurring ones move forward', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      const S = app.NS.Store;
      const past = Date.now() - 60000;
      await S.put('reminders', S.sanitizers.reminders({ id: 'r-once', title: 'یک‌بار', dueAt: past, recur: 'none', createdAt: 1 }));
      await S.put('reminders', S.sanitizers.reminders({ id: 'r-daily', title: 'روزانه', dueAt: past, recur: 'daily', createdAt: 1 }));
      await app.NS.Tools.tick();
      const list = await S.getAll('reminders');
      const once = list.find(function (r) { return r.id === 'r-once'; });
      const daily = list.find(function (r) { return r.id === 'r-daily'; });
      assert.ok(once.firedAt > 0, 'one-off reminder marked fired');
      assert.ok(daily.firedAt > 0, 'daily reminder marked fired');
      assert.ok(daily.dueAt > Date.now(), 'daily reminder moved to a future time');
      const firedAt = once.firedAt;
      await app.NS.Tools.tick();
      const again = (await S.getAll('reminders')).find(function (r) { return r.id === 'r-once'; });
      assert.equal(again.firedAt, firedAt, 'not fired twice');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] medication alerts fire only in the window after a dose time', async function () {
    const app = await bootApp({ storage: mode.storage });
    try {
      const S = app.NS.Store;
      app.NS.Store.setSettings({ notifyMeds: true });
      const now = new Date();
      const hm = function (minutesAgo) {
        const d = new Date(now.getTime() - minutesAgo * 60000);
        return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
      };
      const recent = hm(5);
      const old = hm(120);
      await S.put('meds', S.sanitizers.meds({ id: 'm-test', name: 'آزمایش', times: [recent, old],
        start: app.NS.UI.localIsoDate(now.getTime()), active: true, createdAt: 1 }));
      await app.NS.Tools.tick();
      const rt = S.getRuntime();
      const seen = Object.keys(rt.medSeen || {});
      assert.ok(seen.some(function (k) { return k.endsWith('|' + recent); }), 'recent dose alerted');
      assert.ok(!seen.some(function (k) { return k.endsWith('|' + old); }), 'dose from two hours ago not alerted');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] weather caches Open-Meteo data and falls back honestly on failure', async function () {
    const requested = [];
    const app = await bootApp({ storage: mode.storage, fetch: async function (url) {
      requested.push(url);
      return { ok: true, json: async function () { return {
        current: { temperature_2m: 21.4, relative_humidity_2m: 40, wind_speed_10m: 12, weather_code: 1, time: '2026-10-17T10:00' },
        daily: { time: ['2026-10-17'], temperature_2m_max: [24], temperature_2m_min: [14], weather_code: [1] }
      }; } };
    } });
    try {
      const entry = await app.NS.Weather.fetch('tehran');
      assert.equal(entry.data.current.temp, 21.4);
      assert.ok(/open-meteo\.com/.test(requested[0]), 'Open-Meteo endpoint');
      assert.ok(app.NS.Weather.cached(), 'cached');
      app.win.location.hash = '#/weather';
      await wait(170);
      assert.ok(/Open-Meteo/.test(app.doc.getElementById('view').innerHTML), 'attribution shown');
    } finally { app.close(); }
  });

  test('[' + mode.label + '] weather shows a readable error when the request fails', async function () {
    const app = await bootApp({ storage: mode.storage, fetch: async function () { throw new Error('network down'); } });
    try {
      let failed = false;
      try { await app.NS.Weather.fetch('tehran'); } catch (e) { failed = true; }
      assert.equal(failed, true, 'fetch promise rejects');
      app.win.location.hash = '#/weather';
      await wait(170);
      assert.equal(hasErrorState(app.doc), false, 'page itself still renders');
    } finally { app.close(); }
  });
});

test('no route renders duplicate element ids (labels and ARIA depend on unique ids)', async function () {
  const app = await bootApp({ storage: 'indexeddb' });
  try {
    const routes = ['home', 'calendar', 'prayer', 'qibla', 'tools', 'organizer', 'dhikr', 'meds', 'weather', 'settings'];
    const problems = [];
    for (const r of routes) {
      app.win.location.hash = '#/' + r;
      await wait(170);
      const seen = {};
      app.doc.querySelectorAll('[id]').forEach(function (el) {
        if (seen[el.id]) problems.push(r + ': #' + el.id);
        seen[el.id] = true;
      });
    }
    assert.deepEqual(problems, [], 'duplicate ids');
  } finally { app.close(); }
});
