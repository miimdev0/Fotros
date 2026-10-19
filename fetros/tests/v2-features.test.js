'use strict';
// Version 2 features: the native alert plan (pure), calendar export (.ics),
// the text-size setting, and the manifest shortcuts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEngines, APP_ROOT } = require('./helpers/load-engines');

const FILES = ['js/storage.js', 'js/calendar-engine.js', 'js/prayer-engine.js', 'js/native.js', 'js/ics.js'];

// Same rule as view-tools.js: a reminder that is due again moves forward by its recurrence.
function nextDue(dueAt, recur, now) {
  const d = new Date(dueAt);
  let guard = 0;
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

const TEHRAN = { lat: 35.6892, lon: 51.389, tz: 'Asia/Tehran' };
const BASE_SETTINGS = {
  notifyPrayer: false, notifyMeds: false, notifyReminders: false,
  method: 'tehran', asr: 'shafi', adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, sunset: 0, maghrib: 0, isha: 0 },
  numeralsPersian: 'fa'
};

// Local 05:00 on 17 Oct 2026: every slot used below is still in the future.
const NOW = new Date(2026, 9, 17, 5, 0).getTime();

function plan(NS, overrides) {
  return NS.Native.buildPlan(Object.assign({
    now: NOW,
    settings: Object.assign({}, BASE_SETTINGS),
    loc: TEHRAN,
    reminders: [],
    meds: [],
    medLogs: [],
    nextDue: nextDue
  }, overrides || {}));
}

function unfold(text) {
  return text.replace(/\r\n /g, '').split('\r\n');
}

test('native plan is empty when every alert type is switched off', function () {
  const NS = loadEngines(FILES);
  assert.equal(plan(NS).length, 0);
});

test('prayer alerts: future only, sorted, unique ids, no sunrise or sunset, exact times', function () {
  const NS = loadEngines(FILES);
  const items = plan(NS, { settings: Object.assign({}, BASE_SETTINGS, { notifyPrayer: true }) });
  assert.ok(items.length >= 30 && items.length <= 35, 'about five prayers per day for seven days, got ' + items.length);
  const ids = new Set(items.map(function (n) { return n.id; }));
  assert.equal(ids.size, items.length, 'ids are unique');
  items.forEach(function (n, i) {
    assert.ok(n.at > NOW && n.at <= NOW + 7 * 86400000, 'within the horizon');
    assert.ok(Number.isInteger(n.id) && n.id > 0 && n.id < 2147483648, 'valid 31-bit id');
    if (i > 0) assert.ok(items[i - 1].at <= n.at, 'sorted by time');
    assert.ok(!/طلوع|غروب/.test(n.title), 'sunrise and sunset are not alerts');
  });
  // The alert time equals the calculated time for the same day (no drift in scheduling).
  const day = NS.Prayer.computeDay({ lat: TEHRAN.lat, lon: TEHRAN.lon, tz: TEHRAN.tz, y: 2026, m: 10, d: 17,
    method: 'tehran', asr: 'shafi', adjust: BASE_SETTINGS.adjust });
  const dhuhr = day.items.find(function (it) { return it.key === 'dhuhr'; });
  assert.ok(items.some(function (n) { return n.at === dhuhr.ms; }), 'dhuhr of 17 Oct 2026 is scheduled at its calculated time');
});

test('medication alerts: a logged slot is not scheduled, the other slots are, and doses are shown', function () {
  const NS = loadEngines(FILES);
  const meds = [{ id: 'm1', name: 'متفورمین', dose: '500 mg', times: ['08:00', '20:00'], start: '', end: '', active: true }];
  const logs = [{ id: 'l1', medId: 'm1', date: '2026-10-17', time: '08:00', status: 'taken' }];
  const items = plan(NS, { settings: Object.assign({}, BASE_SETTINGS, { notifyMeds: true }), meds: meds, medLogs: logs });
  const keys = items.map(function (n) { return n.key; });
  assert.ok(!keys.includes('med|m1|2026-10-17|08:00'), 'today 08:00 is already logged');
  assert.ok(keys.includes('med|m1|2026-10-17|20:00'), 'today 20:00 is scheduled');
  assert.ok(keys.includes('med|m1|2026-10-18|08:00'), 'tomorrow 08:00 is scheduled');
  const evening = items.find(function (n) { return n.key === 'med|m1|2026-10-17|20:00'; });
  assert.match(evening.body, /500 mg/);
  assert.match(evening.body, /طبق دستور پزشک/);
});

test('medication alerts respect start and end dates and the active flag', function () {
  const NS = loadEngines(FILES);
  const meds = [
    { id: 'off', name: 'الف', dose: '', times: ['09:00'], start: '', end: '', active: false },
    { id: 'ended', name: 'ب', dose: '', times: ['09:00'], start: '', end: '2026-10-16', active: true },
    { id: 'later', name: 'پ', dose: '', times: ['09:00'], start: '2026-10-20', end: '', active: true }
  ];
  const items = plan(NS, { settings: Object.assign({}, BASE_SETTINGS, { notifyMeds: true }), meds: meds });
  // Only the medication that starts on 20 Oct is scheduled, and only from that date on (20 to 23 Oct inside the horizon).
  assert.ok(items.every(function (n) { return n.key.indexOf('med|later|') === 0; }), 'inactive and ended medications are skipped');
  assert.ok(items.every(function (n) { return n.key.split('|')[2] >= '2026-10-20'; }), 'nothing before the start date');
  assert.equal(items.length, 4, 'four days (20 to 23 Oct) inside the seven-day horizon');
});

test('reminders: undone future ones, recurring occurrences inside the horizon, done and past ones skipped', function () {
  const NS = loadEngines(FILES);
  const day = 86400000;
  const reminders = [
    { id: 'once', title: 'تماس', dueAt: NOW + 3 * 3600000, recur: 'none', done: false },
    { id: 'done', title: 'انجام شد', dueAt: NOW + 3600000, recur: 'none', done: true },
    { id: 'past', title: 'گذشته', dueAt: NOW - 3600000, recur: 'none', done: false },
    { id: 'daily', title: 'آب', dueAt: NOW - 10 * day, recur: 'daily', done: false }
  ];
  const items = plan(NS, { settings: Object.assign({}, BASE_SETTINGS, { notifyReminders: true }), reminders: reminders });
  const count = function (prefix) { return items.filter(function (n) { return n.key.indexOf(prefix) === 0; }).length; };
  assert.equal(count('rem|once|'), 1);
  assert.equal(count('rem|done|'), 0, 'done reminders are not scheduled');
  assert.equal(count('rem|past|'), 0, 'past one-off reminders are not scheduled');
  assert.equal(count('rem|daily|'), 7, 'a daily reminder yields one alert per day inside the seven-day horizon');
});

test('plan can be capped without breaking order', function () {
  const NS = loadEngines(FILES);
  const reminders = [];
  for (let i = 0; i < 300; i++) reminders.push({ id: 'x' + i, title: 't' + i, dueAt: NOW + (i + 1) * 60000, recur: 'none', done: false });
  const items = plan(NS, { settings: Object.assign({}, BASE_SETTINGS, { notifyReminders: true }), reminders: reminders });
  assert.equal(items.length, 200, 'capped at MAX_NOTIFICATIONS');
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].at <= items[i].at);
});

test('ICS: CRLF line endings, folded lines within 75 octets, escaped text, balanced blocks', function () {
  const NS = loadEngines(FILES);
  const text = NS.Ics.build({
    now: NOW,
    calendarName: 'فطرس',
    events: [{ id: 'e1', title: 'سالگرد, ازدواج; با "نقل"', date: '2026-10-17', recur: 'none', kind: 'anniversary', note: 'خط۱\nخط۲' }],
    reminders: [
      { id: 'r1', title: 'داروخانه', dueAt: Date.UTC(2026, 9, 18, 6, 30), recur: 'weekly', done: false },
      { id: 'r2', title: 'انجام شده', dueAt: Date.UTC(2026, 9, 18, 6, 30), recur: 'none', done: true }
    ]
  });
  assert.ok(text.endsWith('\r\n'), 'ends with CRLF');
  assert.equal(text.replace(/\r\n/g, '').indexOf('\n'), -1, 'no bare LF');
  text.split('\r\n').filter(Boolean).forEach(function (line) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'line within 75 octets: ' + line.slice(0, 30));
  });
  const lines = unfold(text);
  assert.equal(lines.filter(function (l) { return l === 'BEGIN:VEVENT'; }).length, 2, 'one event and one reminder (done one skipped)');
  assert.equal(lines.filter(function (l) { return l === 'END:VEVENT'; }).length, 2);
  assert.ok(lines.includes('SUMMARY:سالگرد\\, ازدواج\\; با "نقل"'), 'comma and semicolon escaped');
  assert.ok(lines.includes('DESCRIPTION:خط۱\\nخط۲'), 'newline escaped');
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261017'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261018'));
  assert.ok(lines.includes('DTSTART:20261018T063000Z'), 'reminder in UTC');
  assert.ok(lines.includes('RRULE:FREQ=WEEKLY'));
  assert.ok(lines.includes('TRIGGER:PT0M'));
});

test('ICS: Gregorian yearly events repeat by rule; Persian yearly events become explicit dates', function () {
  const NS = loadEngines(FILES);
  const text = NS.Ics.build({
    now: NOW,
    events: [
      { id: 'g', title: 'تولد', date: '1990-03-21', recur: 'yearly-gregorian', kind: 'birthday' },
      { id: 'p', title: 'نوروز شخصی', date: '2026-03-21', recur: 'yearly-persian', kind: 'personal' }
    ],
    reminders: []
  });
  const lines = unfold(text);
  assert.ok(lines.includes('RRULE:FREQ=YEARLY'), 'Gregorian yearly uses a rule');
  const starts = lines.filter(function (l) { return /^DTSTART;VALUE=DATE:/.test(l); }).map(function (l) { return l.split(':')[1]; });
  // Persian 1 Farvardin of 1406, 1407 and 1408 fall on these Gregorian dates (checked against the calendar engine).
  assert.ok(starts.includes('20270321'), '1 Farvardin 1406 = 21 Mar 2027');
  assert.ok(starts.includes('20280320'), '1 Farvardin 1407 = 20 Mar 2028');
  assert.equal(lines.filter(function (l) { return l === 'BEGIN:VEVENT'; }).length, 1 + 6, 'one Gregorian block and six Persian years (1405 to 1410)');
});

test('ICS: foldLine never splits a multi-byte character', function () {
  const NS = loadEngines(FILES);
  const long = 'سلام'.repeat(40);
  const folded = NS.Ics.foldLine('SUMMARY:' + long);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1, 'folded');
  assert.equal(parts.map(function (p, i) { return i === 0 ? p : p.slice(1); }).join(''), 'SUMMARY:' + long, 'nothing lost');
  parts.forEach(function (p) { assert.ok(Buffer.byteLength(p, 'utf8') <= 75, 'every physical line is at most 75 octets'); });
});

test('settings: textSize accepts only known values and defaults to normal', function () {
  const NS = loadEngines(FILES);
  assert.equal(NS.Store.sanitizeSettings({ textSize: 'huge' }).textSize, 'normal');
  assert.equal(NS.Store.sanitizeSettings({ textSize: 'large' }).textSize, 'large');
  assert.equal(NS.Store.sanitizeSettings({}).textSize, 'normal');
});

test('manifest shortcuts point to real routes', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'manifest.json'), 'utf8'));
  const shortcuts = manifest.shortcuts || [];
  assert.ok(shortcuts.length >= 2 && shortcuts.length <= 4, 'two to four shortcuts');
  const routes = ['prayer', 'organizer/reminders', 'calendar'];
  shortcuts.forEach(function (sc) {
    assert.ok(sc.name && sc.url, 'named and linked');
    assert.ok(sc.url.indexOf('./index.html#/') === 0, 'relative app URL: ' + sc.url);
    assert.ok(routes.indexOf(sc.url.replace('./index.html#/', '')) !== -1, 'known route: ' + sc.url);
    (sc.icons || []).forEach(function (ic) {
      assert.ok(fs.existsSync(path.join(APP_ROOT, ic.src)), 'icon exists: ' + ic.src);
    });
  });
});
