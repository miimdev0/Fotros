'use strict';
// Prayer-time engine checks against the independent `adhan` library, plus
// Qibla bearing and distance sanity values. Tolerance: 1 minute, because the
// engine rounds to whole minutes and adhan reports seconds.
const test = require('node:test');
const assert = require('node:assert/strict');
const adhan = require('adhan');
const { loadEngines } = require('./helpers/load-engines');

const NS = loadEngines(['js/calendar-engine.js', 'js/prayer-engine.js']);
const P = NS.Prayer;

const CITIES = [
  { name: 'Tehran', lat: 35.6892, lon: 51.3890, tz: 'Asia/Tehran' },
  { name: 'Mecca', lat: 21.4225, lon: 39.8262, tz: 'Asia/Riyadh' },
  { name: 'Ashburn', lat: 39.0438, lon: -77.4874, tz: 'America/New_York' }
];
const DATES = [[2026, 1, 15], [2026, 6, 21], [2026, 10, 17], [2026, 12, 21], [2027, 3, 21]];

// Methods that exist in both libraries. Jafari is not in adhan, so it is tested only by value.
const ADHAN_METHODS = {
  tehran: adhan.CalculationMethod.Tehran,
  mwl: adhan.CalculationMethod.MuslimWorldLeague,
  isna: adhan.CalculationMethod.NorthAmerica,
  egypt: adhan.CalculationMethod.Egyptian,
  karachi: adhan.CalculationMethod.Karachi,
  ummalqura: adhan.CalculationMethod.UmmAlQura
};

test('prayer methods list all seven documented calculation methods', function () {
  assert.deepEqual(Object.keys(P.METHODS).sort(), ['egypt', 'isna', 'jafari', 'karachi', 'mwl', 'tehran', 'ummalqura']);
  assert.deepEqual(Array.from(P.PRAYER_KEYS), ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha']);
});

test('calculated prayer times agree with adhan within one minute', function () {
  let compared = 0;
  CITIES.forEach(function (city) {
    DATES.forEach(function (ymd) {
      Object.keys(ADHAN_METHODS).forEach(function (methodId) {
        const ours = P.computeDay({ lat: city.lat, lon: city.lon, tz: city.tz,
          y: ymd[0], m: ymd[1], d: ymd[2], method: methodId, asr: 'shafi', adjust: {} });
        const params = ADHAN_METHODS[methodId]();
        params.madhab = adhan.Madhab.Shafi;
        const ref = new adhan.PrayerTimes(new adhan.Coordinates(city.lat, city.lon),
          new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2])), params);
        const refMs = { fajr: ref.fajr, sunrise: ref.sunrise, dhuhr: ref.dhuhr,
          asr: ref.asr, maghrib: ref.maghrib, isha: ref.isha };
        ours.items.forEach(function (item) {
          if (!refMs[item.key]) return;
          const diffMin = Math.abs(item.ms - refMs[item.key].getTime()) / 60000;
          assert.ok(diffMin <= 1.01, city.name + ' ' + methodId + ' ' + ymd.join('-') + ' ' + item.key + ' off by ' + diffMin);
          compared++;
        });
      });
    });
  });
  assert.equal(compared, 540);
});

test('Shafi and Hanafi Asr differ, and Hanafi is later', function () {
  const base = { lat: 35.6892, lon: 51.3890, tz: 'Asia/Tehran', y: 2026, m: 10, d: 17, method: 'tehran', adjust: {} };
  const shafi = P.computeDay(Object.assign({ asr: 'shafi' }, base));
  const hanafi = P.computeDay(Object.assign({ asr: 'hanafi' }, base));
  const a = shafi.items.find(function (i) { return i.key === 'asr'; });
  const b = hanafi.items.find(function (i) { return i.key === 'asr'; });
  assert.ok(b.ms > a.ms);
});

test('minute adjustments shift the time exactly', function () {
  const base = { lat: 39.0438, lon: -77.4874, tz: 'America/New_York', y: 2026, m: 10, d: 17, method: 'isna', asr: 'shafi' };
  const plain = P.computeDay(Object.assign({ adjust: {} }, base));
  const shifted = P.computeDay(Object.assign({ adjust: { fajr: 5 } }, base));
  const f0 = plain.items[0].ms, f1 = shifted.items[0].ms;
  assert.equal(f1 - f0, 5 * 60000);
});

test('Umm al-Qura isha is exactly 90 minutes after maghrib', function () {
  const day = P.computeDay({ lat: 21.4225, lon: 39.8262, tz: 'Asia/Riyadh', y: 2026, m: 3, d: 1,
    method: 'ummalqura', asr: 'shafi', adjust: {} });
  const mag = day.items.find(function (i) { return i.key === 'maghrib'; }).ms;
  const isha = day.items.find(function (i) { return i.key === 'isha'; }).ms;
  assert.equal(isha - mag, 90 * 60000);
});

test('Qibla bearings match known values within half a degree', function () {
  assert.ok(Math.abs(P.qiblaBearing(35.6892, 51.3890) - 218.4) < 0.5, 'Tehran');
  assert.ok(Math.abs(P.qiblaBearing(39.0438, -77.4874) - 56.25) < 0.5, 'Ashburn');
  assert.ok(Math.abs(P.qiblaBearing(51.5074, -0.1278) - 119) < 0.5, 'London');
});

test('Qibla distance: Tehran to the Kaaba is about 1,944 km', function () {
  const km = P.kaabaDistanceKm(35.6892, 51.3890);
  assert.ok(Math.abs(km - 1944) < 15, 'got ' + km);
});

test('nextPrayer returns the next obligatory prayer, not sunrise or sunset', function () {
  const res = P.nextPrayer({ lat: 39.0438, lon: -77.4874, tz: 'America/New_York', method: 'isna', asr: 'shafi',
    adjust: {}, now: new Date('2026-10-17T15:00:00Z') });
  assert.ok(res.item, 'an item is found');
  assert.notEqual(res.item.key, 'sunrise');
  assert.notEqual(res.item.key, 'sunset');
  assert.ok(res.item.ms > Date.parse('2026-10-17T15:00:00Z'));
});
