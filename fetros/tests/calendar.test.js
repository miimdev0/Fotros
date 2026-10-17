'use strict';
// Calendar engine checks: Gregorian and Persian arithmetic are checked against
// independent references (Date and jalaali-js). Hijri is only sanity-checked,
// because the tabular Hijri method is documented as approximate.
const test = require('node:test');
const assert = require('node:assert/strict');
const jalaali = require('jalaali-js');
const { loadEngines } = require('./helpers/load-engines');

const NS = loadEngines(['js/calendar-engine.js']);
const C = NS.Calendar;

test('Gregorian <-> JDN round trip matches Date for 1900-2099', function () {
  let checked = 0;
  for (let t = Date.UTC(1900, 0, 1); t < Date.UTC(2100, 0, 1); t += 86400000) {
    const d = new Date(t);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    const jdn = C.gregorianToJdn(y, m, day);
    const g = C.jdnToGregorian(jdn);
    assert.deepEqual([g.y, g.m, g.d], [y, m, day], 'date ' + d.toISOString());
    assert.equal(C.weekdayOf(jdn), d.getUTCDay(), 'weekday ' + d.toISOString());
    checked++;
  }
  assert.ok(checked > 73000);
});

test('Persian dates match jalaali-js for 1300-1500 AP and round-trip cleanly', function () {
  const start = C.persianToJdn(1300, 1, 1);
  const end = C.persianToJdn(1500, 12, 29);
  for (let j = start; j <= end; j++) {
    const p = C.jdnToPersian(j);
    const g = C.jdnToGregorian(j);
    const ref = jalaali.toJalaali(g.y, g.m, g.d);
    assert.deepEqual([p.y, p.m, p.d], [ref.jy, ref.jm, ref.jd], 'JDN ' + j);
    assert.equal(C.persianToJdn(p.y, p.m, p.d), j);
  }
});

test('Nowruz (1 Farvardin) falls on the expected Gregorian dates', function () {
  const expected = {
    1403: [2024, 3, 20], 1404: [2025, 3, 21], 1405: [2026, 3, 21], 1406: [2027, 3, 21], 1407: [2028, 3, 20]
  };
  Object.keys(expected).forEach(function (year) {
    const g = C.jdnToGregorian(C.persianToJdn(Number(year), 1, 1));
    assert.deepEqual([g.y, g.m, g.d], expected[year], 'Nowruz ' + year);
    const ref = jalaali.toGregorian(Number(year), 1, 1);
    assert.deepEqual([g.y, g.m, g.d], [ref.gy, ref.gm, ref.gd]);
  });
});

test('Persian leap years agree with jalaali-js', function () {
  for (let y = 1300; y <= 1500; y++) {
    assert.equal(C.isPersianLeapYear(y), jalaali.isLeapJalaaliYear(y), 'year ' + y);
  }
});

test('Known Persian date for 17 October 2026', function () {
  const jdn = C.gregorianToJdn(2026, 10, 17);
  const p = C.jdnToPersian(jdn);
  const ref = jalaali.toJalaali(2026, 10, 17);
  assert.deepEqual([p.y, p.m, p.d], [ref.jy, ref.jm, ref.jd]);
  assert.equal(p.y, 1405);
});

test('Hijri tabular output is a valid month/day for every day of 2000-2030', function () {
  for (let t = Date.UTC(2000, 0, 1); t < Date.UTC(2030, 0, 1); t += 86400000) {
    const d = new Date(t);
    const jdn = C.gregorianToJdn(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    [-2, 0, 2].forEach(function (offset) {
      const h = C.jdnToHijri(jdn, offset);
      assert.ok(h.m >= 1 && h.m <= 12, 'month');
      assert.ok(h.d >= 1 && h.d <= C.hijriDaysInMonth(h.y, h.m), 'day ' + JSON.stringify(h));
    });
  }
});

test('Hijri offset shifts the date by exactly the requested number of days', function () {
  const jdn = C.gregorianToJdn(2026, 10, 17);
  const base = C.jdnToHijri(jdn, 0);
  const plus = C.jdnToHijri(jdn, 1);
  assert.equal(C.hijriToJdn(plus.y, plus.m, plus.d, 0) - C.hijriToJdn(base.y, base.m, base.d, 0), 1);
});

test('Digit helpers convert both ways', function () {
  assert.equal(C.toAsciiDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(C.toPersianDigits('1405'), '۱۴۰۵');
});
