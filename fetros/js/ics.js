/*
 * FETROS — calendar export (js/ics.js)
 *
 * Builds an RFC 5545 iCalendar (.ics) file from personal events and reminders,
 * so they can be opened in the phone's calendar app. Everything is computed on
 * the device; nothing is sent anywhere.
 *
 * - Gregorian yearly events use RRULE:FREQ=YEARLY.
 * - Persian (Jalali) yearly events cannot be expressed as an iCalendar rule, so
 *   they are written as explicit dates for the next few Persian years.
 * - Reminders are timed events in UTC with a display alarm at the due time.
 *
 * Exposes: window.FETROS.Ics
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};

  var CRLF = '\r\n';
  var PERSIAN_YEARS_AHEAD = 5;
  var RRULE_FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
  var KIND_LABEL = { personal: 'رویداد', birthday: 'تولد', anniversary: 'سالگرد' };

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  // RFC 5545 §3.3.11 text escaping.
  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  function utf8Octets(cp) {
    if (cp < 0x80) return 1;
    if (cp < 0x800) return 2;
    if (cp < 0x10000) return 3;
    return 4;
  }

  // Folds a content line to at most 75 octets (RFC 5545 §3.1) without splitting a character.
  function foldLine(line) {
    var lines = [];
    var cur = '';
    var len = 0;
    var limit = 75;
    Array.from(line).forEach(function (ch) {
      var n = utf8Octets(ch.codePointAt(0));
      if (len + n > limit) {
        lines.push(cur);
        cur = '';
        len = 0;
        limit = 74; // continuation lines start with one space, which counts toward the 75
      }
      cur += ch;
      len += n;
    });
    lines.push(cur);
    return lines.map(function (l, i) { return i === 0 ? l : ' ' + l; }).join(CRLF);
  }

  function dateValue(y, m, d) {
    return pad(y, 4) + pad(m, 2) + pad(d, 2);
  }

  function utcStamp(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function parseIsoDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  // Gregorian date of `jdn + days` as a DATE value.
  function allDayPair(y, m, d) {
    var jdn = NS.Calendar.gregorianToJdn(y, m, d);
    var next = NS.Calendar.jdnToGregorian(jdn + 1);
    return { start: dateValue(y, m, d), end: dateValue(next.y, next.m, next.d) };
  }

  function vevent(lines) {
    return ['BEGIN:VEVENT'].concat(lines, ['END:VEVENT']);
  }

  function eventBlocks(ev, nowMs) {
    var base = parseIsoDate(ev.date);
    if (!base) return [];
    var title = escapeText(ev.title);
    var desc = ev.note ? escapeText(ev.note) : '';
    var category = KIND_LABEL[ev.kind] || KIND_LABEL.personal;
    var common = [
      'SUMMARY:' + title,
      'CATEGORIES:' + escapeText(category)
    ];
    if (desc) common.push('DESCRIPTION:' + desc);

    function allDay(uidSuffix, y, m, d, rrule) {
      var pair = allDayPair(y, m, d);
      var lines = [
        'UID:fetros-event-' + escapeText(ev.id) + uidSuffix + '@fetros.local',
        'DTSTAMP:' + utcStamp(nowMs),
        'DTSTART;VALUE=DATE:' + pair.start,
        'DTEND;VALUE=DATE:' + pair.end
      ].concat(common);
      if (rrule) lines.push('RRULE:' + rrule);
      return vevent(lines);
    }

    if (ev.recur === 'yearly-gregorian') {
      return [allDay('', base.y, base.m, base.d, 'FREQ=YEARLY')];
    }
    if (ev.recur === 'yearly-persian') {
      var baseJdn = NS.Calendar.gregorianToJdn(base.y, base.m, base.d);
      var p = NS.Calendar.jdnToPersian(baseJdn);
      var now = NS.Calendar.jdnToPersian(NS.Calendar.gregorianToJdn(
        new Date(nowMs).getFullYear(), new Date(nowMs).getMonth() + 1, new Date(nowMs).getDate()));
      var blocks = [];
      for (var py = now.y; py <= now.y + PERSIAN_YEARS_AHEAD; py++) {
        var g = NS.Calendar.jdnToGregorian(NS.Calendar.persianToJdn(py, p.m, p.d));
        blocks.push(allDay('-p' + py, g.y, g.m, g.d, ''));
      }
      return blocks;
    }
    return [allDay('', base.y, base.m, base.d, '')];
  }

  function reminderBlock(r, nowMs) {
    var lines = [
      'UID:fetros-reminder-' + escapeText(r.id) + '@fetros.local',
      'DTSTAMP:' + utcStamp(nowMs),
      'DTSTART:' + utcStamp(r.dueAt),
      'DTEND:' + utcStamp(r.dueAt + 15 * 60000),
      'SUMMARY:' + escapeText('یادآور: ' + r.title),
      'CATEGORIES:' + escapeText('یادآور')
    ];
    if (RRULE_FREQ[r.recur]) lines.push('RRULE:FREQ=' + RRULE_FREQ[r.recur]);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:' + escapeText(r.title), 'END:VALARM');
    return vevent(lines);
  }

  /*
   * build({ now, calendarName, events, reminders }) -> string
   * events: stored event records; reminders: stored reminder records (done ones are skipped).
   */
  function build(opts) {
    var nowMs = opts.now || Date.now();
    var blocks = [];
    (opts.events || []).forEach(function (ev) {
      eventBlocks(ev, nowMs).forEach(function (b) { blocks.push(b); });
    });
    (opts.reminders || []).forEach(function (r) {
      if (r.done || !isFinite(r.dueAt)) return;
      blocks.push(reminderBlock(r, nowMs));
    });
    var head = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FETROS//Persian calendar companion//FA',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + escapeText(opts.calendarName || 'فطرس')
    ];
    var flat = head.concat.apply([], blocks).concat(['END:VCALENDAR']);
    return flat.map(foldLine).join(CRLF) + CRLF;
  }

  NS.Ics = {
    build: build,
    escapeText: escapeText,
    foldLine: foldLine
  };
})(typeof window !== 'undefined' ? window : globalThis);
