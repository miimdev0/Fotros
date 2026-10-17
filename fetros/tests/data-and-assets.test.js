'use strict';
// Data integrity, sample-data labelling, record sanitising, PWA files, service
// worker precache completeness, and privacy checks on outbound URLs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadEngines, APP_ROOT } = require('./helpers/load-engines');

function read(rel) { return fs.readFileSync(path.join(APP_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(APP_ROOT, rel)); }

// Walk the app folder for shipped files (excludes tests and generated folders).
function listAppFiles(dir, base, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    if (ent.name === 'tests' || ent.name === 'node_modules') return;
    const full = path.join(dir, ent.name);
    const rel = (base ? base + '/' : '') + ent.name;
    if (ent.isDirectory()) listAppFiles(full, rel, out);
    else out.push(rel);
  });
  return out;
}

test('cities: 29 entries with valid coordinates, unique ids, and Tehran as the default', function () {
  const NS = loadEngines(['js/data/cities.js']);
  const cities = NS.Data.cities;
  assert.equal(cities.length, 29);
  const ids = new Set(cities.map(function (c) { return c.id; }));
  assert.equal(ids.size, cities.length, 'ids are unique');
  cities.forEach(function (c) {
    assert.ok(c.lat >= -90 && c.lat <= 90 && c.lon >= -180 && c.lon <= 180, c.id);
    assert.ok(c.name && c.tz, c.id);
  });
  assert.equal(cities[0].id, 'tehran');
  assert.ok(NS.Data.findCity('ashburn'), 'Ashburn is available');
  assert.ok(!NS.Data.findCity('no-such-city'), 'unknown ids return a falsy value');
});

test('occasions dataset is labelled as sample data in code and metadata', function () {
  const src = read('js/data/occasions.js');
  assert.match(src, /SAMPLE DATA/);
  const NS = loadEngines(['js/data/occasions.js']);
  const occ = NS.Data.occasions;
  assert.equal(occ.meta.status, 'sample');
  assert.match(occ.meta.warning, /نمونه/);
  assert.ok(occ.items.length > 0, 'dataset has entries');
  assert.ok(occ.items.every(function (i) { return i.id && i.title && i.calendar; }), 'every entry has id, title and calendar');
});

test('sanitisers accept valid records and reject empty or malformed ones', function () {
  const NS = loadEngines(['js/storage.js']);
  const S = NS.Store.sanitizers;
  assert.equal(S.tasks({ id: 'a', title: '   ' }), null);
  assert.equal(S.tasks({ id: 'a', title: 'ok' }).priority, 'normal');
  assert.equal(S.reminders({ id: 'r', title: 'x', dueAt: NaN }), null);
  assert.equal(S.reminders({ id: 'r', title: 'x', dueAt: 1700000000000, recur: 'hourly' }).recur, 'none');
  assert.equal(S.events({ id: 'e', title: 'x', date: '2026-02-30' }), null, 'invalid calendar date');
  assert.equal(S.meds({ id: 'm', name: 'x', times: ['8:00', '25:99', '20:30'] }).times.join(','), '20:30',
    'only zero-padded HH:MM times are valid');
  assert.equal(S.dhikr({ id: 'd', target: 0, count: 1 }), null, 'target below 1 is rejected');
  assert.equal(S.dhikr({ id: 'd', target: 33, count: 1000001 }), null, 'count above the limit is rejected');
  assert.equal(S.medLogs({ id: 'l', medId: 'm', date: '2026-10-17', status: 'maybe' }), null);
});

test('settings sanitising clamps values and falls back to defaults', function () {
  const NS = loadEngines(['js/storage.js']);
  const s = NS.Store.sanitizeSettings({ hijriOffset: 99, theme: 'neon', accent: 'pink', motion: 'wild' });
  assert.equal(s.hijriOffset, 2);
  assert.equal(s.theme, NS.Store.DEFAULT_SETTINGS.theme);
  assert.equal(s.accent, NS.Store.DEFAULT_SETTINGS.accent);
  assert.equal(s.motion, NS.Store.DEFAULT_SETTINGS.motion);
});

test('service worker precache list covers every shipped app file that the browser needs', function () {
  const sandboxCaches = {};
  let installPromise = null;
  const listeners = {};
  const self = {
    registration: { scope: 'https://example.test/fetros/' },
    location: { origin: 'https://example.test' },
    addEventListener: function (type, fn) { listeners[type] = fn; },
    skipWaiting: function () {},
    clients: { claim: function () { return Promise.resolve(); } }
  };
  const caches = {
    open: function (name) {
      sandboxCaches.name = name;
      return Promise.resolve({ addAll: function (urls) { sandboxCaches.urls = urls; return Promise.resolve(); } });
    },
    keys: function () { return Promise.resolve([]); },
    delete: function () { return Promise.resolve(true); },
    match: function () { return Promise.resolve(undefined); }
  };
  const sandbox = { self: self, caches: caches, URL: URL, Promise: Promise, Response: function () {}, console: console };
  vm.createContext(sandbox);
  vm.runInContext(read('sw.js'), sandbox, { filename: 'sw.js' });
  listeners.install({ waitUntil: function (p) { installPromise = p; } });
  return installPromise.then(function () {
    assert.match(sandboxCaches.name, /^fetros-cache-\d+\.\d+\.\d+$/);
    const cached = new Set(sandboxCaches.urls.map(function (u) { return u.replace('https://example.test/fetros/', ''); }));
    const required = listAppFiles(APP_ROOT, '', []).filter(function (f) {
      return f === 'index.html' || f === 'style.css' || f === 'script.js' || f === 'manifest.json' ||
        /^js\//.test(f) || /^icons\//.test(f) || /^fonts\/Vazirmatn/.test(f);
    });
    required.forEach(function (f) {
      assert.ok(cached.has(f), 'precached: ' + f);
    });
    assert.ok(cached.has(''), 'root URL precached');
  });
});

test('CACHE_VERSION in sw.js matches APP_VERSION in script.js', function () {
  const swVersion = /CACHE_VERSION = '([^']+)'/.exec(read('sw.js'))[1];
  const appVersion = /APP_VERSION = '([^']+)'/.exec(read('script.js'))[1];
  assert.equal(swVersion, appVersion);
});

test('manifest.json is valid, RTL, Persian, standalone, and lists existing icons', function () {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.dir, 'rtl');
  assert.equal(m.lang, 'fa');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url.indexOf('./'), 0);
  const sizes = m.icons.map(function (i) { return i.sizes; });
  assert.ok(sizes.indexOf('192x192') !== -1 && sizes.indexOf('512x512') !== -1);
  m.icons.forEach(function (i) {
    assert.ok(exists(i.src), 'icon exists: ' + i.src);
  });
});

test('PNG icons have the declared pixel sizes', function () {
  [[192, 'icons/icon-192.png'], [512, 'icons/icon-512.png']].forEach(function (pair) {
    const buf = fs.readFileSync(path.join(APP_ROOT, pair[1]));
    assert.equal(buf.readUInt32BE(16), pair[0], 'width of ' + pair[1]);
    assert.equal(buf.readUInt32BE(20), pair[0], 'height of ' + pair[1]);
  });
});

test('index.html references only files that exist', function () {
  const html = read('index.html');
  const refs = [];
  html.replace(/(?:href|src)="([^"#:]+)"/g, function (_, ref) { refs.push(ref); return _; });
  refs.forEach(function (ref) {
    assert.ok(exists(ref), 'referenced file exists: ' + ref);
  });
  assert.match(html, /<html lang="fa" dir="rtl"/);
});

test('fonts ship with their OFL license', function () {
  assert.ok(exists('fonts/Vazirmatn-Variable.woff2'));
  assert.match(read('fonts/OFL.txt'), /SIL OPEN FONT LICENSE/i);
});

test('no ES module syntax or Node-only APIs in shipped browser code', function () {
  const files = listAppFiles(APP_ROOT, '', []).filter(function (f) { return /\.js$/.test(f) && !/^tests\//.test(f); });
  files.forEach(function (f) {
    const src = read(f);
    assert.doesNotMatch(src, /^\s*import\s.+from\s/m, f + ' uses import');
    assert.doesNotMatch(src, /^\s*export\s/m, f + ' uses export');
    assert.doesNotMatch(src, /require\(/, f + ' uses require');
    assert.doesNotMatch(src, /process\.env/, f + ' uses process');
  });
});

test('privacy: no analytics, advertising, or third-party script tags', function () {
  const files = listAppFiles(APP_ROOT, '', []).filter(function (f) { return /\.(html|js|css)$/.test(f); });
  const banned = /google-analytics|googletagmanager|gtag\(|doubleclick|adsbygoogle|sentry|hotjar|mixpanel|facebook\.net|segment\.io|clarity\.ms/i;
  files.forEach(function (f) {
    assert.doesNotMatch(read(f), banned, f);
  });
});

test('only the Open-Meteo weather API is contacted over the network', function () {
  const files = listAppFiles(APP_ROOT, '', []).filter(function (f) { return /\.(html|js|css)$/.test(f); });
  const allowedHosts = ['api.open-meteo.com', 'www.w3.org'];
  files.forEach(function (f) {
    const src = read(f);
    const urls = src.match(/https?:\/\/[^\s'"`)<>]+/g) || [];
    urls.forEach(function (u) {
      const host = new URL(u).host;
      assert.ok(allowedHosts.indexOf(host) !== -1, f + ' references ' + host);
    });
  });
});
