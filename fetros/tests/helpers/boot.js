'use strict';
// Boots the real index.html in jsdom, served over HTTP, so the classic scripts
// run exactly as they would in a browser (same load order, same DOM).
const { JSDOM, VirtualConsole } = require('jsdom');
const { startServer } = require('./static-server');
const { APP_ROOT } = require('./load-engines');

const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

// options:
//   storage: 'indexeddb' (fake-indexeddb injected) | 'fallback' (no IndexedDB)
//   fetch:   optional async (url, init) => Response-like, for offline/weather tests
async function bootApp(options) {
  const opts = options || {};
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { errors.push('jsdomError: ' + (e && e.message ? e.message : e)); });
  vc.on('error', function (e) { errors.push('console.error: ' + (e && e.message ? e.message : String(e))); });

  const served = await startServer(APP_ROOT);
  let fakeIdb = null;
  if (opts.storage === 'indexeddb') fakeIdb = require('fake-indexeddb');

  const dom = await JSDOM.fromURL(served.url, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse: function (win) {
      // jsdom does not implement these browser APIs; the app only needs them to exist.
      win.scrollTo = function () {};
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.matchMedia = win.matchMedia || function () {
        return { matches: false, addListener: function () {}, removeListener: function () {},
          addEventListener: function () {}, removeEventListener: function () {} };
      };
      if (fakeIdb) {
        win.indexedDB = fakeIdb.indexedDB;
        win.IDBKeyRange = fakeIdb.IDBKeyRange;
      }
      if (opts.fetch) win.fetch = opts.fetch;
      if (opts.geolocation) win.navigator.geolocation = opts.geolocation;
    }
  });

  const win = dom.window;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (win.FETROS && win.FETROS.Router && win.FETROS.Store && win.FETROS.Store.mode() !== 'none') break;
    await wait(40);
  }
  // The splash keeps a minimum display time; wait until it is dismissed.
  const splashDeadline = Date.now() + 5000;
  while (Date.now() < splashDeadline) {
    const splash = win.document.getElementById('splash');
    if (!splash || splash.classList.contains('done')) break;
    await wait(50);
  }
  await wait(120);

  return {
    win: win,
    doc: win.document,
    NS: win.FETROS,
    errors: errors,
    close: function () { win.close(); served.server.close(); },
    wait: wait
  };
}

module.exports = { bootApp: bootApp, wait: wait };
