'use strict';
// Tests for the v1.2 visual and motion layer: font wiring, reduced-motion rules,
// feature showcase data, icon files, shell caching and version consistency.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEngines } = require('./helpers/load-engines');

const APP_ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(APP_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(APP_ROOT, rel)); }

// PNG files start with an 8-byte signature, then the IHDR chunk: width and height are big-endian uint32 at bytes 16 and 20.
function pngSize(rel) {
  const buf = fs.readFileSync(path.join(APP_ROOT, rel));
  assert.equal(buf.slice(1, 4).toString('ascii'), 'PNG', rel + ' is a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('index.html loads the motion layer and feature data before the views', function () {
  const html = read('index.html');
  assert.match(html, /<script src="js\/data\/features\.js"><\/script>/);
  assert.match(html, /<script src="js\/fx\.js"><\/script>/);
  assert.ok(html.indexOf('js/fx.js') < html.indexOf('js/view-home.js'), 'fx.js loads before view-home.js');
  assert.match(html, /id="splash-pct"/);
  assert.match(html, /id="splash-bar"/);
  assert.match(html, /class="bg-scene"/);
  assert.match(html, /<symbol id="fx-emblem"/);
});

test('Rokh is declared with a Vazirmatn fallback and the file path is fonts/Rokh.ttf', function () {
  const css = read('style.css');
  assert.match(css, /@font-face\s*\{\s*font-family: 'Rokh';\s*src: url\('fonts\/Rokh\.ttf'\)/);
  assert.match(css, /--font-display: 'Rokh', 'Vazirmatn'/);
  // Vazirmatn stays available as the body font and the fallback face.
  assert.ok(exists('fonts/Vazirmatn-Variable.woff2'));
});

test('the Rokh preload is not added while the licensed file is missing', function () {
  // A preload for a file that does not exist would log an error on every start.
  assert.doesNotMatch(read('index.html'), /rel="preload" href="fonts\/Rokh\.ttf"/);
});

test('motion levels are honoured in CSS for subtle and none, and for the OS preference', function () {
  const css = read('style.css');
  assert.match(css, /html\[data-motion='none'\]/);
  assert.match(css, /html\[data-motion='subtle'\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\.fx-on \[data-rv\]:not\(\.is-in\)/);
});

test('motion engine has no URLs and no duplicate SVG gradient ids', function () {
  const src = read('js/fx.js');
  assert.doesNotMatch(src, /https?:\/\//);
  // Gradients are defined once in the page header (fx-grad). Re-defining one per SVG breaks unique ids.
  assert.doesNotMatch(src, /<linearGradient id=/);
  assert.match(src, /url\(#fx-grad\)/);
});

test('feature showcase data has six unique features with real routes and known artwork', function () {
  const NS = loadEngines(['js/data/features.js']);
  const list = NS.Data.features;
  assert.equal(list.length, 6);
  const ids = list.map(function (f) { return f.id; });
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  const fxSrc = read('js/fx.js');
  list.forEach(function (f) {
    assert.match(f.route, /^#\/[a-z/]+$/, 'route for ' + f.id);
    assert.ok(f.title && f.short && f.text, 'copy for ' + f.id);
    assert.match(fxSrc, new RegExp("\\n\\s+" + f.art + ": '"), 'artwork ' + f.art + ' exists in js/fx.js');
  });
});

test('feature copy does not promise network-only or paid features', function () {
  const text = read('js/data/features.js');
  assert.doesNotMatch(text, /https?:\/\//);
  assert.doesNotMatch(text, /اشتراک|پریمیوم/);
});

test('app icon files exist with the right sizes and the SVG has no external references', function () {
  assert.equal(JSON.stringify(pngSize('icons/icon-192.png')), JSON.stringify({ width: 192, height: 192 }));
  assert.equal(JSON.stringify(pngSize('icons/icon-512.png')), JSON.stringify({ width: 512, height: 512 }));
  const svg = read('icons/icon.svg');
  assert.match(svg, /<svg[^>]+viewBox="0 0 512 512"/);
  // The xmlns namespace URL is not a request; only href/src attributes would fetch anything.
  assert.doesNotMatch(svg, /(href|src)="https?:\/\//);
  assert.doesNotMatch(svg, /<image\b/);
});

test('manifest references the icon files that exist', function () {
  const manifest = JSON.parse(read('manifest.json'));
  manifest.icons.forEach(function (icon) {
    assert.ok(exists(icon.src), 'icon exists: ' + icon.src);
  });
});

test('service worker precaches the new motion layer and feature data', function () {
  const sw = read('sw.js');
  assert.match(sw, /'js\/fx\.js'/);
  assert.match(sw, /'js\/data\/features\.js'/);
  assert.match(sw, /'icons\/icon-512\.png'/);
  assert.doesNotMatch(sw, /'fonts\/Rokh\.ttf'/, 'Rokh is not precached because it may be absent');
});

test('package.json version matches APP_VERSION', function () {
  const pkg = JSON.parse(read('../package.json'));
  const appVersion = /APP_VERSION = '([^']+)'/.exec(read('script.js'))[1];
  assert.equal(pkg.version, appVersion);
  assert.equal(appVersion, '3.0.0');
});
