/*
 * FETROS — calendar engine (js/calendar-engine.js)
 *
 * Pure date arithmetic for three calendars:
 *   - Persian (Solar Hijri / شمسی): 33-year-cycle arithmetic with a table of
 *     leap-year break points (valid for the range covered by the table).
 *     This is an arithmetic model. The official Iranian calendar is set by
 *     astronomical observation and the government, so in rare years the
 *     official date can differ from this model. Verify critical dates.
 *   - Gregorian (میلادی): standard proleptic Gregorian arithmetic.
 *   - Hijri (قمری): TABULAR (civil) Islamic calendar, epoch 16 July 622 CE
 *     (Friday, Julian), 30-year cycle with 11 leap years. Real months are
 *     decided by moon sighting or the Umm al-Qura tables, so this calendar
 *     can differ by 1–2 days from the local observation. Users can apply an
 *     offset of −2…+2 days (see settings).
 *
 * All conversions go through the integer Julian Day Number (JDN), so
 * "today" is derived from the device's local calendar date, never hardcoded.
 *
 * Exposes: window.FETROS.Calendar
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var floor = Math.floor;

  function mod(a, b) { return a - b * floor(a / b); }

  /* ------------------------------------------------------------------ */
  /* Gregorian <-> JDN                                                    */
  /* ------------------------------------------------------------------ */

  function gregorianToJdn(y, m, d) {
    var a = floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    return d + floor((153 * mm + 2) / 5) + 365 * yy + floor(yy / 4) -
      floor(yy / 100) + floor(yy / 400) - 32045;
  }

  function jdnToGregorian(jdn) {
    var a = jdn + 32044;
    var b = floor((4 * a + 3) / 146097);
    var c = a - floor(146097 * b / 4);
    var d = floor((4 * c + 3) / 1461);
    var e = c - floor(1461 * d / 4);
    var m = floor((5 * e + 2) / 153);
    return {
      y: 100 * b + d - 4800 + floor(m / 10),
      m: m + 3 - 12 * floor(m / 10),
      d: e - floor((153 * m + 2) / 5) + 1
    };
  }

  function isGregorianLeap(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function gregorianDaysInMonth(y, m) {
    if (m === 2) return isGregorianLeap(y) ? 29 : 28;
    return (m === 4 || m === 6 || m === 9 || m === 11) ? 30 : 31;
  }

  /* ------------------------------------------------------------------ */
  /* Persian (Solar Hijri)                                                */
  /* ------------------------------------------------------------------ */

  // Break points of the leap-year arithmetic (Persian years).
  // Between two consecutive break points the 33-year rule is applied.
  var PERSIAN_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
    1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  // Returns the Gregorian year and the March day on which 1 Farvardin falls.
  function persianNewYearParts(jy) {
    var bl = PERSIAN_BREAKS.length;
    if (jy < PERSIAN_BREAKS[0] || jy >= PERSIAN_BREAKS[bl - 1]) {
      throw new RangeError('Persian year out of supported range: ' + jy);
    }
    var gy = jy + 621;
    var leapJ = -14;
    var jp = PERSIAN_BREAKS[0];
    var jump = 0;
    var i, jm, n;
    for (i = 1; i < bl; i++) {
      jm = PERSIAN_BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ += floor(jump / 33) * 8 + floor(mod(jump, 33) / 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ += floor(n / 33) * 8 + floor((mod(n, 33) + 3) / 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    var leapG = floor(gy / 4) - floor((floor(gy / 100) + 1) * 3 / 4) - 150;
    var march = 20 + leapJ - leapG;
    return { gy: gy, march: march };
  }

  // JDN of 1 Farvardin of Persian year jy.
  function persianNewYearJdn(jy) {
    var p = persianNewYearParts(jy);
    return gregorianToJdn(p.gy, 3, p.march);
  }

  function isPersianLeapYear(jy) {
    return persianNewYearJdn(jy + 1) - persianNewYearJdn(jy) === 366;
  }

  function persianToJdn(y, m, d) {
    // Months 1–6: 31 days, 7–11: 30 days, 12: 29 (30 in leap years).
    return persianNewYearJdn(y) + (m - 1) * 31 - floor(m / 7) * (m - 7) + d - 1;
  }

  function jdnToPersian(jdn) {
    var g = jdnToGregorian(jdn);
    var jy = g.y - 621;
    if (jdn < persianNewYearJdn(jy)) jy -= 1;
    else if (jdn >= persianNewYearJdn(jy + 1)) jy += 1;
    var doy = jdn - persianNewYearJdn(jy);
    var jm, jd;
    if (doy < 186) {
      jm = floor(doy / 31) + 1;
      jd = doy - (jm - 1) * 31 + 1;
    } else {
      var r = doy - 186;
      jm = floor(r / 30) + 7;
      jd = r - (jm - 7) * 30 + 1;
    }
    return { y: jy, m: jm, d: jd };
  }

  function persianDaysInMonth(y, m) {
    if (m <= 6) return 31;
    if (m <= 11) return 30;
    return isPersianLeapYear(y) ? 30 : 29;
  }

  /* ------------------------------------------------------------------ */
  /* Hijri (tabular Islamic calendar)                                     */
  /* ------------------------------------------------------------------ */

  // JDN of 1 Muharram 1 AH in the tabular (civil) Islamic calendar.
  var HIJRI_EPOCH_JDN = 1948440;

  function hijriTabularToJdn(y, m, d) {
    return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 +
      floor((3 + 11 * y) / 30) + HIJRI_EPOCH_JDN - 1;
  }

  // Tabular conversion, without any user offset.
  function jdnToHijriTabular(jdn) {
    var y = floor((30 * (jdn - HIJRI_EPOCH_JDN) + 10646) / 10631);
    while (hijriTabularToJdn(y, 1, 1) > jdn) y -= 1;
    while (hijriTabularToJdn(y + 1, 1, 1) <= jdn) y += 1;
    var m = 12;
    while (m > 1 && hijriTabularToJdn(y, m, 1) > jdn) m -= 1;
    var d = jdn - hijriTabularToJdn(y, m, 1) + 1;
    return { y: y, m: m, d: d };
  }

  function clampHijriOffset(offset) {
    var n = Math.round(Number(offset) || 0);
    return Math.max(-2, Math.min(2, n));
  }

  /* Umm al-Qura (official month table, js/data/umm-alqura.js). Used for 1402–1500 AH. */
  var hijriMethod = 'ummalqura';
  var uqCache = null;

  function setHijriMethod(name) {
    hijriMethod = name === 'tabular' ? 'tabular' : 'ummalqura';
  }

  function getHijriMethod() { return hijriMethod; }

  function uqTable() {
    if (uqCache) return uqCache;
    var D = global.FETROS && global.FETROS.Data && global.FETROS.Data.ummAlQura;
    if (!D || !D.monthBits) return null;
    var starts = [D.anchorJdn];
    for (var i = 0; i < D.monthBits.length; i++) {
      starts.push(starts[i] + (D.monthBits.charAt(i) === '1' ? 30 : 29));
    }
    uqCache = { firstYear: D.firstYear, lastYear: D.lastYear, months: D.monthBits.length, starts: starts };
    return uqCache;
  }

  function inUqYears(y) {
    var U = uqTable();
    return !!U && hijriMethod === 'ummalqura' && y >= U.firstYear && y <= U.lastYear;
  }

  // True when the Umm al-Qura table applies to this JDN.
  function inUqJdn(jdn) {
    var U = uqTable();
    return !!U && hijriMethod === 'ummalqura' && jdn >= U.starts[0] && jdn < U.starts[U.months];
  }

  function uqToJdn(y, m, d) {
    var U = uqTable();
    var i = (y - U.firstYear) * 12 + (m - 1);
    return U.starts[i] + d - 1;
  }

  function jdnToUq(jdn) {
    var U = uqTable();
    var lo = 0, hi = U.months - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (U.starts[mid] <= jdn) lo = mid; else hi = mid - 1;
    }
    return { y: U.firstYear + floor(lo / 12), m: (lo % 12) + 1, d: jdn - U.starts[lo] + 1 };
  }

  // Civil date to JDN for the active method. Years outside the table use the tabular rule.
  function baseHijriToJdn(y, m, d) {
    if (inUqYears(y)) return uqToJdn(y, m, d);
    return hijriTabularToJdn(y, m, d);
  }

  // JDN to civil date for the active method.
  function baseJdnToHijri(jdn) {
    if (inUqJdn(jdn)) return jdnToUq(jdn);
    return jdnToHijriTabular(jdn);
  }

  // offset > 0 shifts the Hijri calendar later (e.g. local sighting is one day later).
  function hijriToJdn(y, m, d, offset) {
    return baseHijriToJdn(y, m, d) - clampHijriOffset(offset);
  }

  function jdnToHijri(jdn, offset) {
    return baseJdnToHijri(jdn + clampHijriOffset(offset));
  }

  function hijriDaysInMonth(y, m, offset) {
    var next = m === 12 ? { y: y + 1, m: 1 } : { y: y, m: m + 1 };
    return hijriToJdn(next.y, next.m, 1, offset) - hijriToJdn(y, m, 1, offset);
  }

  /* ------------------------------------------------------------------ */
  /* Generic helpers used by the UI                                       */
  /* ------------------------------------------------------------------ */

  var CAL = { PERSIAN: 'persian', GREGORIAN: 'gregorian', HIJRI: 'hijri' };

  // Days from the anchor JDN (Sunday = 0 … Saturday = 6).
  function weekdayOf(jdn) {
    return mod(jdn + 1, 7);
  }

  function toJdn(cal, y, m, d, offset) {
    if (cal === CAL.PERSIAN) return persianToJdn(y, m, d);
    if (cal === CAL.HIJRI) return hijriToJdn(y, m, d, offset);
    return gregorianToJdn(y, m, d);
  }

  function fromJdn(cal, jdn, offset) {
    if (cal === CAL.PERSIAN) return jdnToPersian(jdn);
    if (cal === CAL.HIJRI) return jdnToHijri(jdn, offset);
    return jdnToGregorian(jdn);
  }

  function daysInMonth(cal, y, m, offset) {
    if (cal === CAL.PERSIAN) return persianDaysInMonth(y, m);
    if (cal === CAL.HIJRI) return hijriDaysInMonth(y, m, offset);
    return gregorianDaysInMonth(y, m);
  }

  // Moves a (year, month) pair by delta months within a calendar.
  function shiftMonth(cal, y, m, delta) {
    var idx = y * 12 + (m - 1) + delta;
    return { y: floor(idx / 12), m: mod(idx, 12) + 1 };
  }

  // JDN of today in the device's LOCAL time zone (not hardcoded).
  function todayJdn(now) {
    var t = now instanceof Date ? now : new Date();
    return gregorianToJdn(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  // Full description of one day in all three calendars.
  function dateInfo(jdn, offset) {
    var g = jdnToGregorian(jdn);
    var p = jdnToPersian(jdn);
    var h = jdnToHijri(jdn, offset);
    var wd = weekdayOf(jdn);
    return {
      jdn: jdn,
      weekday: wd,
      gregorian: g,
      persian: p,
      hijri: h
    };
  }

  /* ------------------------------------------------------------------ */
  /* Names and formatting (Persian UI)                                    */
  /* ------------------------------------------------------------------ */

  var PERSIAN_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var GREGORIAN_MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
    'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];
  var HIJRI_MONTHS = ['محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول',
    'جمادی‌الثانی', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه'];
  // Index = weekday from weekdayOf(): 0 = Sunday.
  var WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

  var PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  // Converts ASCII digits to Persian digits. Non-digit characters are kept.
  function toPersianDigits(value) {
    return String(value).replace(/[0-9]/g, function (c) { return PERSIAN_DIGITS[c.charCodeAt(0) - 48]; });
  }

  // Converts Persian/Arabic digits back to ASCII (for parsing user input).
  // Punctuation is left alone: list separators (،) and decimal separators (٫)
  // mean different things, so callers decide how to treat them.
  function toAsciiDigits(value) {
    return String(value)
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x6F0); })
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); });
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // numerals: 'fa' (Persian digits) or 'en' (ASCII digits)
  function digits(value, numerals) {
    var s = String(value);
    return numerals === 'en' ? s : toPersianDigits(s);
  }

  function formatPersian(p, numerals) {
    return digits(p.d, numerals) + ' ' + PERSIAN_MONTHS[p.m - 1] + ' ' + digits(p.y, numerals);
  }

  function formatGregorian(g, numerals) {
    return digits(g.d, numerals) + ' ' + GREGORIAN_MONTHS[g.m - 1] + ' ' + digits(g.y, numerals);
  }

  function formatHijri(h, numerals) {
    return digits(h.d, numerals) + ' ' + HIJRI_MONTHS[h.m - 1] + ' ' + digits(h.y, numerals);
  }

  function formatIsoGregorian(g) {
    return g.y + '-' + pad2(g.m) + '-' + pad2(g.d);
  }

  // ISO "YYYY-MM-DD" <-> JDN (used by records that store a plain date).
  function isoToJdn(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > gregorianDaysInMonth(y, mo)) return null;
    return gregorianToJdn(y, mo, d);
  }

  function jdnToIso(jdn) {
    return formatIsoGregorian(jdnToGregorian(jdn));
  }

  /* ------------------------------------------------------------------ */
  /* Occasions (holidays, religious occasions, personal events)           */
  /* ------------------------------------------------------------------ */

  // Returns the occasions from `items` that fall on `jdn`.
  // Each item: {id, title, calendar: 'persian'|'hijri'|'gregorian', month, day,
  //             year?, holiday: boolean, kind, note?}
  function occasionsOn(jdn, items, offset) {
    if (!items || !items.length) return [];
    var info = dateInfo(jdn, offset);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var src = it.calendar === CAL.HIJRI ? info.hijri :
        it.calendar === CAL.PERSIAN ? info.persian : info.gregorian;
      if (src.m !== it.month || src.d !== it.day) continue;
      if (it.year && src.y !== it.year) continue;
      out.push(it);
    }
    return out;
  }

  // Builds an index { 'jdn': [items...] } for a span of JDNs. Useful for grids.
  function occasionsInRange(startJdn, endJdn, items, offset) {
    var map = {};
    for (var j = startJdn; j <= endJdn; j++) {
      var hit = occasionsOn(j, items, offset);
      if (hit.length) map[j] = hit;
    }
    return map;
  }

  NS.Calendar = {
    CAL: CAL,
    setHijriMethod: setHijriMethod,
    getHijriMethod: getHijriMethod,
    PERSIAN_MONTHS: PERSIAN_MONTHS,
    GREGORIAN_MONTHS: GREGORIAN_MONTHS,
    HIJRI_MONTHS: HIJRI_MONTHS,
    WEEKDAYS: WEEKDAYS,
    HIJRI_METHOD: 'Umm al-Qura month table for 1402–1500 AH (js/data/umm-alqura.js); tabular civil calendar (epoch 16 Jul 622 CE) elsewhere or when chosen; offset applied by user setting',
    PERSIAN_METHOD: '33-year arithmetic with break points (-61 … 3178)',

    gregorianToJdn: gregorianToJdn,
    jdnToGregorian: jdnToGregorian,
    isGregorianLeap: isGregorianLeap,
    gregorianDaysInMonth: gregorianDaysInMonth,
    persianToJdn: persianToJdn,
    jdnToPersian: jdnToPersian,
    persianNewYearJdn: persianNewYearJdn,
    isPersianLeapYear: isPersianLeapYear,
    persianDaysInMonth: persianDaysInMonth,
    hijriToJdn: hijriToJdn,
    jdnToHijri: jdnToHijri,
    hijriDaysInMonth: hijriDaysInMonth,
    clampHijriOffset: clampHijriOffset,

    toJdn: toJdn,
    fromJdn: fromJdn,
    daysInMonth: daysInMonth,
    shiftMonth: shiftMonth,
    weekdayOf: weekdayOf,
    todayJdn: todayJdn,
    dateInfo: dateInfo,

    toPersianDigits: toPersianDigits,
    toAsciiDigits: toAsciiDigits,
    digits: digits,
    formatPersian: formatPersian,
    formatGregorian: formatGregorian,
    formatHijri: formatHijri,
    formatIsoGregorian: formatIsoGregorian,
    isoToJdn: isoToJdn,
    jdnToIso: jdnToIso,

    occasionsOn: occasionsOn,
    occasionsInRange: occasionsInRange
  };
})(typeof window !== 'undefined' ? window : globalThis);
