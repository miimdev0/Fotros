'use strict';
// Version 3.0.0 checks: Umm al-Qura calendar, search, backup reminder and release wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEngines } = require('./helpers/load-engines');

const APP_ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(APP_ROOT, rel), 'utf8'); }
// Copies a sandbox-realm object into main-realm values so deepStrictEqual compares cleanly.
function ymd(h) { return [h.y, h.m, h.d]; }

const NS = loadEngines(['js/calendar-engine.js', 'js/data/umm-alqura.js', 'js/view-search.js']);
const C = NS.Calendar;

test('Umm al-Qura table: anchor is 1 Muharram 1402 AH on 1981-10-28', function () {
  const D = NS.Data.ummAlQura;
  assert.equal(D.firstYear, 1402);
  assert.equal(D.lastYear, 1500);
  assert.equal(D.anchorJdn, C.gregorianToJdn(1981, 10, 28));
  assert.equal(D.monthBits.length, (1500 - 1402 + 1) * 12);
  assert.match(D.monthBits, /^[01]+$/);
});

test('Umm al-Qura: 17 October 2026 is 1448/5/6, while the tabular method gives 1448/5/5', function () {
  // 1448/5/6 was checked against moment-hijri 3.0.0 (Umm al-Qura data).
  // The one-day difference from the tabular method is expected.
  const jdn = C.gregorianToJdn(2026, 10, 17);
  C.setHijriMethod('ummalqura');
  assert.deepEqual(ymd(C.jdnToHijri(jdn, 0)), [1448, 5, 6]);
  C.setHijriMethod('tabular');
  assert.deepEqual(ymd(C.jdnToHijri(jdn, 0)), [1448, 5, 5]);
  C.setHijriMethod('ummalqura');
});

test('Umm al-Qura: known month starts agree with moment-hijri', function () {
  // Each pair was checked against moment-hijri 3.0.0 (Umm al-Qura data).
  const samples = [
    [[2026, 10, 17], [1448, 5, 6]],
    [[1981, 10, 28], [1402, 1, 1]],
    [[2000, 1, 1], [1420, 9, 24]],
    [[2024, 3, 11], [1445, 9, 1]]
  ];
  samples.forEach(function (s) {
    const jdn = C.gregorianToJdn(s[0][0], s[0][1], s[0][2]);
    const h = C.jdnToHijri(jdn, 0);
    assert.deepEqual([h.y, h.m, h.d], s[1], 'date ' + s[0].join('-'));
  });
});

test('Umm al-Qura: every day from 1402 to 1500 AH round-trips', function () {
  const start = NS.Data.ummAlQura.anchorJdn;
  const end = start + 35084;
  C.setHijriMethod('ummalqura');
  let checked = 0;
  for (let jdn = start; jdn < end; jdn++) {
    const h = C.jdnToHijri(jdn, 0);
    assert.equal(C.hijriToJdn(h.y, h.m, h.d, 0), jdn, 'round trip at ' + jdn);
    checked++;
  }
  assert.equal(checked, 35084);
});

test('outside the table the tabular calendar is used and still round-trips', function () {
  C.setHijriMethod('ummalqura');
  for (let jdn = C.gregorianToJdn(1950, 1, 1); jdn < C.gregorianToJdn(1981, 10, 27); jdn += 3) {
    const h = C.jdnToHijri(jdn, 0);
    assert.equal(C.hijriToJdn(h.y, h.m, h.d, 0), jdn);
  }
});

test('the hijri offset still shifts dates by whole days with the Umm al-Qura method', function () {
  const jdn = C.gregorianToJdn(2026, 10, 17);
  C.setHijriMethod('ummalqura');
  assert.deepEqual(ymd(C.jdnToHijri(jdn, 1)), [1448, 5, 7]);
  assert.deepEqual(ymd(C.jdnToHijri(jdn, -1)), [1448, 5, 5]);
});

test('setHijriMethod accepts only the two known methods', function () {
  C.setHijriMethod('nonsense');
  assert.equal(C.getHijriMethod(), 'ummalqura');
  C.setHijriMethod('tabular');
  assert.equal(C.getHijriMethod(), 'tabular');
  C.setHijriMethod('ummalqura');
});

test('search normalisation folds Arabic letters, diacritics and digit styles', function () {
  const n = NS.Search.normalize;
  assert.equal(n('كتاب'), n('کتاب'));
  assert.equal(n('يادآور'), n('یادآور'));
  assert.equal(n('۱۲ دارو'), n('12 دارو'));
  assert.equal(n('عَلِيّ'), n('علی'));
  assert.equal(n('  خرید   نان  '), 'خرید نان');
  assert.equal(n('a\u200cb'), 'a b');
});

test('search matches every word, in any field, and needs two characters', function () {
  const items = [
    { kind: 'task', title: 'خرید نان', text: '' },
    { kind: 'note', title: 'ایده', text: 'نان و پنیر برای صبحانه' },
    { kind: 'med', title: 'ویتامین دی', text: '۲۰۰ واحد' }
  ];
  assert.equal(NS.Search.matchItems(items, 'ن').length, 0, 'one character is too short');
  assert.deepEqual(Array.from(NS.Search.matchItems(items, 'نان'), function (i) { return i.kind; }), ['task', 'note']);
  assert.deepEqual(Array.from(NS.Search.matchItems(items, 'نان پنیر'), function (i) { return i.kind; }), ['note']);
  assert.equal(NS.Search.matchItems(items, '200').length, 1, 'Latin digits match Persian digits');
  assert.equal(NS.Search.matchItems(items, 'موجود نیست').length, 0);
});

test('script.js is version 3.0.0 and the cache name matches it', function () {
  const script = read('script.js');
  const sw = read('sw.js');
  assert.match(script, /var APP_VERSION = '3\.0\.0';/);
  assert.match(sw, /var CACHE_VERSION = '3\.0\.0';/);
  const pkg = JSON.parse(read('../package.json'));
  assert.equal(pkg.version, '3.0.0');
});

test('service worker caches the new calendar data and the search view', function () {
  const sw = read('sw.js');
  assert.match(sw, /'js\/data\/umm-alqura\.js'/);
  assert.match(sw, /'js\/view-search\.js'/);
});

test('index.html loads the new scripts, and the search route is registered', function () {
  const html = read('index.html');
  assert.match(html, /<script src="js\/data\/umm-alqura\.js"><\/script>/);
  assert.match(html, /<script src="js\/view-search\.js"><\/script>/);
  assert.match(read('script.js'), /search: \{ nav: 'tools' \}/);
});

test('backup reminder is on by default, and the export records when a backup was made', function () {
  assert.match(read('js/storage.js'), /backupReminder: true/);
  const script = read('script.js');
  assert.match(script, /NS\.Store\.setRuntime\(\{ lastExportAt: Date\.now\(\) \}\)/);
  assert.match(script, /function checkBackup\(\)/);
  assert.match(script, /checkBackup\(\)\.catch/);
});

test('new v3 files make no network calls', function () {
  // The attribution comment in umm-alqura.js may name the source URL; code must not fetch anything.
  ['js/view-search.js', 'js/data/umm-alqura.js'].forEach(function (rel) {
    assert.doesNotMatch(read(rel), /\bfetch\s*\(|XMLHttpRequest|\bimport\s*\(|new\s+WebSocket/, rel);
  });
});
