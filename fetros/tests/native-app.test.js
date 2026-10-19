'use strict';
// Native (Android) alert sync inside the real page, with a fake Capacitor
// LocalNotifications plugin that records every call. In a browser the same
// functions must do nothing and the share helper must return null.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('./helpers/boot');

function fakePlugin(options) {
  const opts = options || {};
  const calls = { schedule: [], cancel: [], pending: [] };
  const pending = [];
  return {
    calls: calls,
    plugin: {
      checkPermissions: function () { return Promise.resolve({ display: opts.display || 'granted' }); },
      requestPermissions: function () { return Promise.resolve({ display: 'granted' }); },
      getPending: function () { return Promise.resolve({ notifications: pending.slice() }); },
      schedule: function (req) {
        calls.schedule.push(req);
        req.notifications.forEach(function (n) { pending.push({ id: n.id }); });
        return Promise.resolve();
      },
      cancel: function (req) {
        calls.cancel.push(req);
        req.notifications.forEach(function (n) {
          const i = pending.findIndex(function (p) { return p.id === n.id; });
          if (i !== -1) pending.splice(i, 1);
        });
        return Promise.resolve();
      }
    }
  };
}

test('browser: native helpers stay inactive and the share helper returns null', async function () {
  const app = await bootApp({ storage: 'indexeddb' });
  try {
    const N = app.NS.Native;
    assert.equal(N.isNative(), false);
    assert.equal(N.shareFile('fetros-test.json', '{}'), null, 'no share sheet in a browser');
    const res = await N.syncSchedules();
    assert.equal(res.reason, 'not-native');
    assert.equal(res.scheduled, 0);
    assert.equal(await N.permissionState(), 'unsupported');
  } finally {
    app.close();
  }
});

test('android: the sync schedules future alerts with unique ids and replaces the previous plan', async function () {
  const app = await bootApp({ storage: 'indexeddb' });
  try {
    const fake = fakePlugin();
    app.win.Capacitor = { Plugins: { LocalNotifications: fake.plugin } };
    app.NS.Store.setSettings({ notifyPrayer: true, notifyReminders: true, notifyMeds: true });
    assert.equal(app.NS.Native.isNative(), true);

    const first = await app.NS.Native.syncSchedules();
    assert.equal(first.reason, 'ok');
    assert.ok(first.scheduled >= 30, 'a week of prayer alerts, got ' + first.scheduled);
    assert.equal(fake.calls.cancel.length, 0, 'nothing to cancel on the first run');
    const sent = [].concat.apply([], fake.calls.schedule.map(function (c) { return c.notifications; }));
    assert.equal(sent.length, first.scheduled);
    const ids = new Set(sent.map(function (n) { return n.id; }));
    assert.equal(ids.size, sent.length, 'ids are unique');
    const now = Date.now();
    sent.forEach(function (n) {
      assert.ok(Number.isFinite(Number(n.schedule.at)) && Number(n.schedule.at) > now, 'future time');
      assert.equal(n.schedule.allowWhileIdle, true);
      assert.ok(n.title && n.body !== undefined, 'has title');
    });

    const second = await app.NS.Native.syncSchedules();
    assert.equal(second.reason, 'ok');
    assert.equal(fake.calls.cancel.length, 1, 'the previous plan is cancelled first');
    assert.equal(fake.calls.cancel[0].notifications.length, first.scheduled);
  } finally {
    app.close();
  }
});

test('android: without permission nothing is scheduled', async function () {
  const app = await bootApp({ storage: 'indexeddb' });
  try {
    const fake = fakePlugin({ display: 'denied' });
    app.win.Capacitor = { Plugins: { LocalNotifications: fake.plugin } };
    app.NS.Store.setSettings({ notifyPrayer: true });
    const res = await app.NS.Native.syncSchedules();
    assert.equal(res.reason, 'no-permission');
    assert.equal(fake.calls.schedule.length, 0);
    assert.equal(await app.NS.Native.permissionState(), 'denied');
  } finally {
    app.close();
  }
});

test('android: a data change marks the plan stale and the periodic check re-plans it', async function () {
  const app = await bootApp({ storage: 'indexeddb' });
  try {
    const fake = fakePlugin();
    app.win.Capacitor = { Plugins: { LocalNotifications: fake.plugin } };
    app.NS.Store.setSettings({ notifyPrayer: true });
    await app.NS.Native.syncSchedules();
    const before = fake.calls.schedule.length;

    // Nothing changed: the periodic check does not touch the OS schedule.
    await app.NS.Native.maybeSync();
    assert.equal(fake.calls.schedule.length, before, 'no re-plan when nothing changed');

    // A saved change (here: a router refresh, as after any save) marks it stale.
    app.NS.Router.refresh();
    await app.NS.Native.maybeSync();
    assert.equal(fake.calls.schedule.length, before + 1, 're-planned after a change');
  } finally {
    app.close();
  }
});
