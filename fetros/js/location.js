/*
 * FETROS — location resolution (js/location.js)
 *
 * The app works with one "active location" at a time:
 *   - city:   a predefined city from js/data/cities.js (default)
 *   - custom: coordinates typed by the user
 *   - gps:    coordinates from the browser's geolocation (only after the user
 *             taps the button and grants permission). Stored on this device.
 *
 * Exposes: window.FETROS.Location
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};

  function deviceTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  }

  // Returns { lat, lon, name, tz, source } for the saved settings.
  function resolve(settings) {
    var s = settings || NS.Store.getSettings();
    var city = NS.Data.findCity(s.cityId) || NS.Data.cities[0];
    if (s.locationMode !== 'city' && s.customLocation) {
      var c = s.customLocation;
      var tz = NS.Prayer.isValidZone(c.tz) ? c.tz : deviceTimeZone();
      return {
        lat: c.lat, lon: c.lon,
        name: c.name || 'موقعیت سفارشی',
        tz: tz,
        source: s.locationMode === 'gps' ? 'gps' : 'custom'
      };
    }
    return { lat: city.lat, lon: city.lon, name: city.name, tz: city.tz, source: 'city', cityId: city.id };
  }

  // Requests the device position. Resolves { lat, lon, accuracy } or rejects with a Persian message.
  function requestGps() {
    return new Promise(function (resolve, reject) {
      var geo = global.navigator && global.navigator.geolocation;
      if (!geo) {
        reject(new Error('این مرورگر دسترسی به موقعیت مکانی را پشتیبانی نمی‌کند. شهر را از فهرست انتخاب کنید.'));
        return;
      }
      geo.getCurrentPosition(function (pos) {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
      }, function (err) {
        var msg = err && err.code === 1
          ? 'اجازه‌ی دسترسی به موقعیت داده نشد. می‌توانید شهر را دستی انتخاب کنید.'
          : 'موقعیت مکانی دریافت نشد. دوباره تلاش کنید یا شهر را دستی انتخاب کنید.';
        reject(new Error(msg));
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    });
  }

  var ctxCache = { key: '', value: null };

  // Prayer context: today's times and the next prayer for the active location.
  // Cached per minute to keep rendering cheap.
  function prayerContext(now) {
    var s = NS.Store.getSettings();
    var loc = resolve(s);
    var t = now || new Date();
    var key = [loc.lat, loc.lon, loc.tz, s.method, s.asr, JSON.stringify(s.adjust), Math.floor(t.getTime() / 60000)].join('|');
    if (ctxCache.key === key && ctxCache.value) return ctxCache.value;
    var res = NS.Prayer.nextPrayer({
      lat: loc.lat, lon: loc.lon, tz: loc.tz,
      method: s.method, asr: s.asr, adjust: s.adjust, now: t
    });
    var value = { loc: loc, next: res.item, today: res.today, tomorrow: res.tomorrow };
    ctxCache = { key: key, value: value };
    return value;
  }

  function invalidate() {
    ctxCache = { key: '', value: null };
  }

  NS.Location = {
    resolve: resolve,
    requestGps: requestGps,
    deviceTimeZone: deviceTimeZone,
    prayerContext: prayerContext,
    invalidate: invalidate
  };
})(typeof window !== 'undefined' ? window : globalThis);
