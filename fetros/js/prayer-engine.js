/*
 * FETROS — prayer-time and Qibla engine (js/prayer-engine.js)
 *
 * Original implementation of standard astronomical formulas:
 *   - Solar declination and equation of time: low-precision solar position
 *     formulas (after Jean Meeus, "Astronomical Algorithms", and the NOAA
 *     solar calculator equations). Accuracy is about a minute for civil use.
 *   - Event times are solved from the sun's altitude angle (hour angle).
 *   - Asr uses the shadow-length rule: factor 1 (Shafi'i, Maliki, Hanbali)
 *     or factor 2 (Hanafi).
 *   - Qibla: initial great-circle bearing from the location to the Kaaba
 *     (21.4225° N, 39.8262° E).
 *
 * IMPORTANT: Calculated times depend on the chosen method (sun angles),
 * the location, and local rules. They can differ from the times announced
 * by local religious authorities. Users should confirm the method that their
 * local authority uses.
 *
 * Exposes: window.FETROS.Prayer
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var KAABA = { lat: 21.4225, lon: 39.8262 };
  var SUNRISE_ALT = -0.833; // refraction + solar semi-diameter, degrees

  // Calculation methods: angles are degrees below the horizon.
  // maghrib: null => sunset (SUNRISE_ALT). isha: angle, or ishaMinutes after maghrib.
  var METHODS = {
    tehran: {
      name: 'موسسه ژئوفیزیک دانشگاه تهران',
      fajr: 17.7, maghrib: 4.5, isha: 14
    },
    mwl: {
      name: 'لیگ جهانی مسلمانان',
      fajr: 18, maghrib: null, isha: 17
    },
    isna: {
      name: 'ISNA (آمریکای شمالی)',
      fajr: 15, maghrib: null, isha: 15
    },
    egypt: {
      name: 'هیئت بررسی مساحی مصر',
      fajr: 19.5, maghrib: null, isha: 17.5
    },
    karachi: {
      name: 'دانشگاه علوم اسلامی کراچی',
      fajr: 18, maghrib: null, isha: 18
    },
    ummalqura: {
      name: 'ام‌القری (مکه مکرمه)',
      fajr: 18.5, maghrib: null, ishaMinutes: 90
    },
    jafari: {
      name: 'جعفری (شیعه اثنی‌عشری)',
      fajr: 16, maghrib: 4, isha: 14
    }
  };

  var PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha'];
  var PRAYER_LABELS = {
    fajr: 'اذان صبح',
    sunrise: 'طلوع آفتاب',
    dhuhr: 'اذان ظهر',
    asr: 'اذان عصر',
    sunset: 'غروب آفتاب',
    maghrib: 'اذان مغرب',
    isha: 'اذان عشا'
  };

  /* ---------------- Solar position ---------------- */

  // jd: Julian Day (may be fractional). Returns declination (deg) and
  // equation of time (minutes, apparent minus mean solar time).
  function solarPosition(jd) {
    var T = (jd - 2451545.0) / 36525.0;
    var L0 = 280.46646 + T * (36000.76983 + T * 0.0003032); // mean longitude
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);  // mean anomaly
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var Mr = M * RAD;
    var C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
      Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
      Math.sin(3 * Mr) * 0.000289;
    var trueLong = L0 + C;
    var omega = 125.04 - 1934.136 * T;
    var lambda = (trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD)) * RAD;
    var seconds = 21.448 - T * (46.815 + T * (0.00059 - T * 0.001813));
    var eps0 = 23 + (26 + seconds / 60) / 60;
    var eps = (eps0 + 0.00256 * Math.cos(omega * RAD)) * RAD;
    var decl = Math.asin(Math.sin(eps) * Math.sin(lambda)) * DEG;
    var y = Math.pow(Math.tan(eps / 2), 2);
    var L0r = L0 * RAD;
    var eqt = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
    return { decl: decl, eqt: eqt };
  }

  // Hour angle (degrees) at which the sun is at altitude `alt` (degrees).
  // Returns NaN when the sun never reaches that altitude (high latitudes).
  function hourAngle(alt, lat, decl) {
    var a = Math.sin(alt * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD);
    var b = Math.cos(lat * RAD) * Math.cos(decl * RAD);
    var x = a / b;
    if (x > 1 || x < -1) return NaN;
    return Math.acos(x) * DEG;
  }

  // Asr altitude (degrees) for shadow factor 1 (standard) or 2 (Hanafi).
  function asrAltitude(lat, decl, factor) {
    return Math.atan(1 / (factor + Math.tan(Math.abs(lat - decl) * RAD))) * DEG;
  }

  /* ---------------- Time zones ---------------- */

  // Civil date (y, m, d) of a UTC instant in the IANA zone `tz`.
  function civilDateInZone(ms, tz) {
    var parts = zoneParts(ms, tz);
    return { y: parts.y, m: parts.m, d: parts.d };
  }

  function zoneParts(ms, tz) {
    var fmt = getFormatter(tz);
    var out = {};
    var list = fmt.formatToParts(new Date(ms));
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.type === 'year') out.y = +p.value;
      else if (p.type === 'month') out.m = +p.value;
      else if (p.type === 'day') out.d = +p.value;
      else if (p.type === 'hour') out.h = +p.value % 24;
      else if (p.type === 'minute') out.min = +p.value;
    }
    return out;
  }

  var formatterCache = {};
  function getFormatter(tz) {
    var key = tz || 'UTC';
    if (!formatterCache[key]) {
      formatterCache[key] = new Intl.DateTimeFormat('en-US', {
        timeZone: key, year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
      });
    }
    return formatterCache[key];
  }

  // Checks whether a zone name is supported by the runtime.
  function isValidZone(tz) {
    try { getFormatter(tz); return true; } catch (e) { return false; }
  }

  /* ---------------- Prayer times ---------------- */

  // Event times in fractional hours UT, relative to 00:00 UT of the civil date.
  function computeUtHours(y, m, d, lat, lon, method, asrFactor) {
    var jdn = NS.Calendar.gregorianToJdn(y, m, d);
    var base = jdn - 0.5; // JD at 00:00 UT of that date
    var transit = 12; // initial guess (UT hours)
    var sun = { decl: 0, eqt: 0 };
    var i;
    for (i = 0; i < 3; i++) {
      sun = solarPosition(base + transit / 24);
      transit = (720 - 4 * lon - sun.eqt) / 60; // solar noon in UT hours
    }
    var decl = sun.decl;
    var out = {};
    var hFajr = hourAngle(-method.fajr, lat, decl);
    var hSunrise = hourAngle(SUNRISE_ALT, lat, decl);
    var hAsr = hourAngle(asrAltitude(lat, decl, asrFactor), lat, decl);

    out.dhuhr = transit;
    out.fajr = transit - hFajr / 15;
    out.sunrise = transit - hSunrise / 15;
    out.sunset = transit + hSunrise / 15;
    out.asr = transit + hAsr / 15;

    if (method.maghrib === null || method.maghrib === undefined) {
      out.maghrib = out.sunset;
    } else {
      out.maghrib = transit + hourAngle(-method.maghrib, lat, decl) / 15;
    }

    if (method.ishaMinutes) {
      out.isha = out.maghrib + method.ishaMinutes / 60;
    } else {
      out.isha = transit + hourAngle(-method.isha, lat, decl) / 15;
    }
    return out;
  }

  function resolveMethod(methodId) {
    return METHODS[methodId] || METHODS.tehran;
  }

  /*
   * computeDay({lat, lon, tz, y, m, d, method, asr, adjust})
   *  - lat/lon: decimal degrees (east positive)
   *  - tz: IANA zone name of the location (used to show local clock times)
   *  - y/m/d: civil date in that zone
   *  - method: key of METHODS
   *  - asr: 'shafi' | 'hanafi'
   *  - adjust: minute offsets per prayer key, e.g. {fajr: 2, isha: -1}
   * Returns { date, items: [{key,label,ms,time}], warnings: [] }
   * ms = UTC epoch milliseconds, time = 'HH:MM' in the location's zone.
   */
  function computeDay(opts) {
    var method = resolveMethod(opts.method);
    var factor = opts.asr === 'hanafi' ? 2 : 1;
    var adjust = opts.adjust || {};
    var ut = computeUtHours(opts.y, opts.m, opts.d, opts.lat, opts.lon, method, factor);
    var base = Date.UTC(opts.y, opts.m - 1, opts.d);
    var items = [];
    var warnings = [];
    for (var i = 0; i < PRAYER_KEYS.length; i++) {
      var key = PRAYER_KEYS[i];
      var h = ut[key];
      var extra = Number(adjust[key]) || 0;
      if (!isFinite(h)) {
        items.push({ key: key, label: PRAYER_LABELS[key], ms: null, time: null });
        warnings.push(key);
        continue;
      }
      var ms = Math.round((base + (h * 3600000) + extra * 60000) / 60000) * 60000;
      items.push({ key: key, label: PRAYER_LABELS[key], ms: ms, time: clockText(ms, opts.tz) });
    }
    return {
      date: { y: opts.y, m: opts.m, d: opts.d },
      items: items,
      warnings: warnings,
      methodName: method.name
    };
  }

  function clockText(ms, tz) {
    var p = zoneParts(ms, tz);
    return (p.h < 10 ? '0' : '') + p.h + ':' + (p.min < 10 ? '0' : '') + p.min;
  }

  /*
   * nextPrayer({lat, lon, tz, method, asr, adjust, now}) -> {item, dayItems}
   * Looks at today's and tomorrow's times in the location's zone.
   */
  function nextPrayer(opts) {
    var now = opts.now ? opts.now.getTime() : Date.now();
    var today = civilDateInZone(now, opts.tz);
    var tomorrowJdn = NS.Calendar.gregorianToJdn(today.y, today.m, today.d) + 1;
    var tom = NS.Calendar.jdnToGregorian(tomorrowJdn);
    var common = { lat: opts.lat, lon: opts.lon, tz: opts.tz, method: opts.method, asr: opts.asr, adjust: opts.adjust };
    var todayRes = computeDay(Object.assign({}, common, { y: today.y, m: today.m, d: today.d }));
    var tomRes = computeDay(Object.assign({}, common, { y: tom.y, m: tom.m, d: tom.d }));
    var candidates = todayRes.items.concat(tomRes.items);
    for (var i = 0; i < candidates.length; i++) {
      var it = candidates[i];
      if (it.ms !== null && it.ms > now && PRAYER_KEYS.indexOf(it.key) !== -1) {
        // Only prayer obligations (not sunrise/sunset) count as "next prayer".
        if (it.key === 'sunrise' || it.key === 'sunset') continue;
        return { item: it, today: todayRes, tomorrow: tomRes };
      }
    }
    return { item: null, today: todayRes, tomorrow: tomRes };
  }

  /* ---------------- Qibla ---------------- */

  // Initial great-circle bearing (0–360°, clockwise from true north).
  function qiblaBearing(lat, lon) {
    var phi1 = lat * RAD;
    var phi2 = KAABA.lat * RAD;
    var dLon = (KAABA.lon - lon) * RAD;
    var y = Math.sin(dLon);
    var x = Math.cos(phi1) * Math.tan(phi2) - Math.sin(phi1) * Math.cos(dLon);
    return (Math.atan2(y, x) * DEG + 360) % 360;
  }

  // Great-circle distance to the Kaaba in kilometres (haversine, R = 6371 km).
  function kaabaDistanceKm(lat, lon) {
    var dLat = (KAABA.lat - lat) * RAD;
    var dLon = (KAABA.lon - lon) * RAD;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat * RAD) * Math.cos(KAABA.lat * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  NS.Prayer = {
    METHODS: METHODS,
    PRAYER_KEYS: PRAYER_KEYS,
    PRAYER_LABELS: PRAYER_LABELS,
    KAABA: KAABA,
    solarPosition: solarPosition,
    hourAngle: hourAngle,
    asrAltitude: asrAltitude,
    civilDateInZone: civilDateInZone,
    isValidZone: isValidZone,
    computeDay: computeDay,
    nextPrayer: nextPrayer,
    qiblaBearing: qiblaBearing,
    kaabaDistanceKm: kaabaDistanceKm
  };
})(typeof window !== 'undefined' ? window : globalThis);
