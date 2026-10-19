/*
 * FETROS — search view (js/view-search.js)
 *
 * Searches tasks, notes, reminders, events and medication reminders stored on
 * this device. Matching ignores Arabic/Persian letter variants, diacritics and
 * digit style, so "ی"/"ي", "۱۲"/"12" and "ک"/"ك" match each other.
 *
 * Exposes: window.FETROS.Search = { normalize, matchItems, gatherItems }
 *          and registers the "search" view in window.FETROS.Views.
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  var UI = NS.UI;
  var Store = NS.Store;

  var PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  var MAX_RESULTS = 60;
  var MIN_CHARS = 2;

  // Folds text so that equivalent spellings compare equal.
  function normalize(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/[\u064B-\u065F\u0670]/g, '')          // Arabic diacritics
      .replace(/\u064A/g, '\u06CC')                    // Arabic yeh → Persian yeh
      .replace(/\u0643/g, '\u06A9')                    // Arabic kaf → Persian kaf
      .replace(/[\u200C\u200B\u00A0]/g, ' ')           // ZWNJ, ZWSP, NBSP
      .replace(/[\u06F0-\u06F9]/g, function (c) { return String(PERSIAN_DIGITS.indexOf(c)); })
      .replace(/[\u0660-\u0669]/g, function (c) { return String(ARABIC_DIGITS.indexOf(c)); })
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Returns the items whose title or text contains every word of the query.
  function matchItems(items, query, limit) {
    var q = normalize(query);
    if (q.length < MIN_CHARS) return [];
    var terms = q.split(' ').filter(Boolean);
    var out = [];
    for (var i = 0; i < items.length && out.length < (limit || MAX_RESULTS); i++) {
      var it = items[i];
      var hay = normalize((it.title || '') + ' ' + (it.text || ''));
      var ok = true;
      for (var t = 0; t < terms.length; t++) {
        if (hay.indexOf(terms[t]) === -1) { ok = false; break; }
      }
      if (ok) out.push(it);
    }
    return out;
  }

  // Loads every searchable record and maps it to a common shape.
  function gatherItems() {
    return Promise.all([
      Store.getAll('tasks'), Store.getAll('notes'), Store.getAll('reminders'),
      Store.getAll('events'), Store.getAll('meds')
    ]).then(function (r) {
      var items = [];
      r[0].forEach(function (t) {
        items.push({ kind: 'task', label: 'کار', title: t.title || '', text: t.note || '', route: '#/organizer/tasks' });
      });
      r[1].forEach(function (n) {
        items.push({ kind: 'note', label: 'یادداشت', title: n.title || '', text: n.body || '', route: '#/organizer/tasks' });
      });
      r[2].forEach(function (rm) {
        items.push({ kind: 'reminder', label: 'یادآور', title: rm.title || '', text: '', route: '#/organizer/reminders' });
      });
      r[3].forEach(function (ev) {
        items.push({ kind: 'event', label: 'رویداد', title: ev.title || '', text: ev.note || '', route: '#/calendar' });
      });
      r[4].forEach(function (m) {
        items.push({ kind: 'med', label: 'دارو', title: m.name || '', text: m.dose || '', route: '#/meds' });
      });
      return items;
    });
  }

  function excerpt(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > 90 ? s.slice(0, 90) + '…' : s;
  }

  function resultsHtml(list) {
    if (!list.length) {
      return UI.emptyState('search', 'نتیجه‌ای پیدا نشد', 'عبارت دیگری را امتحان کنید یا کوتاه‌تر بنویسید.');
    }
    return list.map(function (it) {
      return '<li class="search-item"><a class="search-link" href="' + UI.esc(it.route) + '">' +
        '<span class="badge">' + UI.esc(it.label) + '</span>' +
        '<span class="search-title">' + UI.esc(it.title || '(بدون عنوان)') + '</span>' +
        (it.text ? '<span class="search-text small muted">' + UI.esc(excerpt(it.text)) + '</span>' : '') +
        '</a></li>';
    }).join('');
  }

  function render() {
    return '<section class="page-head"><h1 class="page-title">جستجوی سراسری</h1>' +
      '<p class="page-sub">کار، یادداشت، یادآور، رویداد و دارو را در همین دستگاه پیدا کنید.</p></section>' +
      '<section class="card" aria-labelledby="search-title"><h2 class="sr-only" id="search-title">جستجو</h2>' +
      '<label class="sr-only" for="search-q">عبارت جستجو</label>' +
      '<input id="search-q" type="search" maxlength="120" placeholder="مثلاً خرید، دارو، تولد…" autocomplete="off" data-input="search-query">' +
      '<p class="hint small" id="search-hint">حداقل دو حرف وارد کنید. جستجو فقط روی همین دستگاه انجام می‌شود.</p>' +
      '<ul class="plain-list search-results" id="search-results" aria-live="polite"></ul></section>';
  }

  var seq = 0;
  var cache = null;

  function runSearch(query) {
    var mySeq = ++seq;
    var list = document.getElementById('search-results');
    var hint = document.getElementById('search-hint');
    if (!list) return Promise.resolve();
    if (normalize(query).length < MIN_CHARS) {
      list.innerHTML = '';
      if (hint) hint.hidden = false;
      return Promise.resolve();
    }
    if (hint) hint.hidden = true;
    var load = cache ? Promise.resolve(cache) : gatherItems().then(function (items) { cache = items; return items; });
    return load.then(function (items) {
      if (mySeq !== seq) return;
      list.innerHTML = resultsHtml(matchItems(items, query));
    });
  }

  function mount() {
    cache = null;
    UI.registerInput('search-query', function (el) { runSearch(el.value); });
    var input = document.getElementById('search-q');
    if (input) input.focus();
  }

  NS.Search = { normalize: normalize, matchItems: matchItems, gatherItems: gatherItems };
  NS.Views = NS.Views || {};
  NS.Views.search = { title: 'جستجوی سراسری', render: render, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
