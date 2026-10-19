/*
 * FETROS — motion and showcase layer (js/fx.js)
 *
 * Everything animated on top of the views lives here: the loader count-up,
 * scroll reveal, count-up numbers, magnetic buttons, card tilt, ripples,
 * the sliding pill in the bottom navigation, pointer parallax for the
 * background, a scroll progress bar, the feature carousel and the lightbox.
 *
 * Motion levels (from the in-app setting and the OS preference):
 *   full   — everything
 *   subtle — fades only; no tilt, magnetic, parallax or count-up motion
 *   none   — no motion at all; content is shown immediately
 * CSS mirrors the level through data-motion on <html>.
 *
 * Works without IntersectionObserver or pointer events; it only adds classes
 * and inline custom properties, so content stays readable if JS is limited.
 *
 * Exposes: window.FETROS.Fx = { level, runSplash, scan, art, openLightbox, init }.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var NS = global.FETROS = global.FETROS || {};
  var reduceQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var finePointer = global.matchMedia ? global.matchMedia('(pointer: fine)') : null;
  var io = null;
  var lightboxIndex = 0;
  var lastFocus = null;

  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function toFa(n) { return String(n).replace(/[0-9]/g, function (d) { return FA_DIGITS.charAt(+d); }); }

  function motionSetting() {
    var root = doc.documentElement;
    return root.getAttribute('data-motion') || 'full';
  }

  /* Returns 'full', 'subtle' or 'none'. */
  function level() {
    var s = motionSetting();
    if (s === 'none') return 'none';
    if (s === 'subtle') return 'subtle';
    if (reduceQuery && reduceQuery.matches) return 'subtle';
    return 'full';
  }

  function pointerFine() { return !finePointer || finePointer.matches; }

  /* ------------------------------- Loader ------------------------------- */

  /* Animates the splash counter from 0 to 100 over durationMs (ease-out). */
  function runSplash(durationMs) {
    var pct = doc.getElementById('splash-pct');
    var bar = doc.getElementById('splash-bar');
    if (!pct && !bar) return;
    var total = level() === 'none' ? 0 : Math.max(200, durationMs || 1000);
    var t0 = global.performance ? global.performance.now() : Date.now();
    function frame(now) {
      var t = total ? Math.min(1, (now - t0) / total) : 1;
      var eased = 1 - Math.pow(1 - t, 3);
      var v = Math.round(eased * 100);
      if (bar) bar.style.transform = 'scaleX(' + (eased).toFixed(4) + ')';
      if (pct) pct.textContent = toFa(v) + '٪';
      if (t < 1) global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
  }

  /* ------------------------------- Reveal ------------------------------- */

  var REVEAL_SELECTOR = '#view .card, #view .hero, #view .cta-card, #view .site-footer, #view [data-reveal]';

  function revealNow(el) { el.classList.add('is-in'); }

  function observeReveal(el) {
    if (el.getAttribute('data-rv')) return;
    el.setAttribute('data-rv', '1');
    if (!io) { revealNow(el); return; }
    io.observe(el);
  }

  /* Adds stagger delays to cards that sit in the same parent. */
  function staggerSiblings(list) {
    var seen = new Map();
    list.forEach(function (el) {
      var p = el.parentNode;
      var n = seen.get(p) || 0;
      seen.set(p, n + 1);
      el.style.setProperty('--d', Math.min(n, 8) * 70 + 'ms');
    });
  }

  /* Finds new elements in root and prepares them for animation. */
  function scan(root) {
    root = root || doc;
    var lvl = level();
    var fresh = [];
    var nodes = root.querySelectorAll ? root.querySelectorAll(REVEAL_SELECTOR) : [];
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].getAttribute('data-rv')) fresh.push(nodes[i]);
    }
    if (lvl === 'none') {
      fresh.forEach(function (el) { el.setAttribute('data-rv', '1'); revealNow(el); });
    } else {
      staggerSiblings(fresh);
      fresh.forEach(observeReveal);
    }
    var counts = root.querySelectorAll ? root.querySelectorAll('[data-count]:not([data-counted])') : [];
    for (var c = 0; c < counts.length; c++) countUp(counts[c]);
  }

  /* ------------------------------ Count-up ------------------------------ */

  function countUp(el) {
    el.setAttribute('data-counted', '1');
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (!isFinite(target)) return;
    if (level() !== 'full') { el.textContent = toFa(target); return; }
    var t0 = null, dur = 900;
    function frame(now) {
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / dur);
      el.textContent = toFa(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
  }

  /* ----------------------- Pointer effects (fine pointer) ----------------------- */

  function onPointerMove(ev) {
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    var lvl = level();
    if (lvl !== 'full' || !pointerFine()) return;

    var card = ev.target.closest && ev.target.closest('.card');
    if (card) {
      var cr = card.getBoundingClientRect();
      card.style.setProperty('--mx', (((ev.clientX - cr.left) / Math.max(1, cr.width)) * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (((ev.clientY - cr.top) / Math.max(1, cr.height)) * 100).toFixed(1) + '%');
    }

    var mag = ev.target.closest && ev.target.closest('.magnetic, .fab, .btn.primary');
    if (mag) {
      var r = mag.getBoundingClientRect();
      var dx = ev.clientX - (r.left + r.width / 2);
      var dy = ev.clientY - (r.top + r.height / 2);
      mag.style.transform = 'translate(' + (dx * 0.16).toFixed(2) + 'px,' + (dy * 0.22).toFixed(2) + 'px)';
    }

    var tilt = ev.target.closest && ev.target.closest('.tilt, .feature-card');
    if (tilt) {
      var tr = tilt.getBoundingClientRect();
      var px = (ev.clientX - tr.left) / tr.width - 0.5;
      var py = (ev.clientY - tr.top) / tr.height - 0.5;
      tilt.style.transform = 'perspective(900px) rotateX(' + (-py * 5).toFixed(2) + 'deg) rotateY(' + (px * 6).toFixed(2) + 'deg)';
    }

    pendingPointer = { x: ev.clientX / Math.max(1, global.innerWidth) * 2 - 1, y: ev.clientY / Math.max(1, global.innerHeight) * 2 - 1 };
    if (!pointerRaf) pointerRaf = global.requestAnimationFrame(applyParallax);
  }

  var pendingPointer = null;
  var pointerRaf = 0;
  function applyParallax() {
    pointerRaf = 0;
    if (!pendingPointer) return;
    var root = doc.documentElement.style;
    root.setProperty('--px', pendingPointer.x.toFixed(3));
    root.setProperty('--py', pendingPointer.y.toFixed(3));
  }

  function onPointerLeave(ev) {
    var mag = ev.target.closest && ev.target.closest('.magnetic, .fab, .btn.primary');
    if (mag) mag.style.transform = '';
    var tilt = ev.target.closest && ev.target.closest('.tilt, .feature-card');
    if (tilt) tilt.style.transform = '';
  }

  /* ------------------------------- Ripple ------------------------------- */

  function onPointerDown(ev) {
    if (level() === 'none') return;
    var host = ev.target.closest && ev.target.closest('.btn, .chip-btn, .fab, .bottom-nav a, .carousel-btn');
    if (!host || host.disabled) return;
    var r = host.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2;
    var span = doc.createElement('span');
    span.className = 'ripple';
    span.setAttribute('aria-hidden', 'true');
    span.style.width = span.style.height = size + 'px';
    span.style.left = (ev.clientX - r.left - size / 2) + 'px';
    span.style.top = (ev.clientY - r.top - size / 2) + 'px';
    host.appendChild(span);
    global.setTimeout(function () { if (span.parentNode) span.parentNode.removeChild(span); }, 650);
  }

  /* ---------------------------- Bottom nav pill ---------------------------- */

  function syncPill() {
    var nav = doc.querySelector('.bottom-nav');
    if (!nav) return;
    var pill = nav.querySelector('.nav-pill');
    var active = nav.querySelector('a[aria-current="page"]') || nav.querySelector('a.is-active');
    if (!pill) return;
    if (!active) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  }

  /* ---------------------------- Scroll progress ---------------------------- */

  function initProgress() {
    var bar = doc.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(bar);
    var raf = 0;
    function update() {
      raf = 0;
      var h = doc.documentElement.scrollHeight - global.innerHeight;
      var p = h > 0 ? global.scrollY / h : 0;
      bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, p)).toFixed(4) + ')';
    }
    global.addEventListener('scroll', function () { if (!raf) raf = global.requestAnimationFrame(update); }, { passive: true });
    global.addEventListener('resize', update);
    update();
  }

  /* ------------------------------ Carousel ------------------------------ */

  function carouselCards(track) {
    return Array.prototype.slice.call(track.querySelectorAll('.feature-card'));
  }

  function currentCardIndex(track, cards) {
    var rtl = getComputedStyle(doc.documentElement).direction === 'rtl';
    var tr = track.getBoundingClientRect();
    var start = rtl ? tr.right : tr.left;
    var best = 0, bestDist = Infinity;
    cards.forEach(function (c, i) {
      var r = c.getBoundingClientRect();
      var d = Math.abs((rtl ? r.right : r.left) - start);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  function stepCarousel(carousel, dir) {
    var track = carousel.querySelector('.carousel-track');
    if (!track) return;
    var cards = carouselCards(track);
    if (!cards.length) return;
    var idx = currentCardIndex(track, cards);
    var next = Math.max(0, Math.min(cards.length - 1, idx + dir));
    var smooth = level() === 'none' ? 'auto' : 'smooth';
    cards[next].scrollIntoView({ behavior: smooth, inline: 'start', block: 'nearest' });
  }

  /* ------------------------------ Lightbox ------------------------------ */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Illustrations drawn in code. Each one is a 320x200 SVG; no photos are used. */
  var ART = {
    calendar: '<rect x="40" y="36" width="240" height="150" rx="22" fill="#17191D" stroke="#F5C451" stroke-opacity=".35"/>' +
      '<rect x="40" y="36" width="240" height="38" rx="22" fill="url(#fx-grad)"/><rect x="40" y="58" width="240" height="16" fill="url(#fx-grad)"/>' +
      [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<rect x="' + (58 + i * 31) + '" y="92" width="20" height="18" rx="5" fill="#2A2C32"/>'; }).join('') +
      [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<rect x="' + (58 + i * 31) + '" y="118" width="20" height="18" rx="5" fill="#2A2C32"/>'; }).join('') +
      '<rect x="182" y="118" width="20" height="18" rx="5" fill="url(#fx-grad)"/>' +
      '<circle cx="250" cy="48" r="5" fill="#FFF8EA"/><circle cx="70" cy="48" r="5" fill="#FFF8EA" opacity=".5"/>',
    prayer: '<path d="M30 150 A130 130 0 0 1 290 150" fill="none" stroke="#F5C451" stroke-opacity=".25" stroke-width="2" stroke-dasharray="4 6"/>' +
      '<path d="M110 150 A50 50 0 0 1 210 150 Z" fill="url(#fx-grad)"/>' +
      '<rect x="30" y="150" width="260" height="8" rx="4" fill="#F5C451" fill-opacity=".5"/>' +
      [0, 1, 2, 3, 4].map(function (i) { return '<rect x="' + (46 + i * 52) + '" y="170" width="36" height="8" rx="4" fill="#2A2C32"/>'; }).join('') +
      '<circle cx="160" cy="58" r="4" fill="#FFF8EA"/>',
    qibla: '<circle cx="160" cy="100" r="74" fill="none" stroke="#F5C451" stroke-opacity=".3" stroke-width="2"/>' +
      '<circle cx="160" cy="100" r="50" fill="none" stroke="#FFF8EA" stroke-opacity=".08" stroke-width="2"/>' +
      '<path d="M160 36 L178 100 L160 164 L142 100 Z" fill="url(#fx-grad)"/>' +
      '<rect x="150" y="92" width="20" height="16" rx="3" fill="#101114" fill-opacity=".5"/>' +
      '<circle cx="160" cy="100" r="6" fill="#FFF8EA"/>' +
      '<text x="160" y="22" text-anchor="middle" font-size="14" fill="#FFF8EA" font-family="sans-serif">N</text>',
    dhikr: '<circle cx="160" cy="100" r="64" fill="none" stroke="#2A2C32" stroke-width="14"/>' +
      '<circle cx="160" cy="100" r="64" fill="none" stroke="url(#fx-grad)" stroke-width="14" stroke-linecap="round" stroke-dasharray="282 402" transform="rotate(-90 160 100)"/>' +
      [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) {
        var a = (i / 8) * Math.PI * 2;
        return '<circle cx="' + (160 + 100 * Math.cos(a)).toFixed(1) + '" cy="' + (100 + 100 * Math.sin(a)).toFixed(1) + '" r="5" fill="#F5C451" fill-opacity="' + (i < 6 ? 0.9 : 0.25) + '"/>';
      }).join('') +
      '<text x="160" y="110" text-anchor="middle" font-size="34" fill="#FFF8EA" font-family="sans-serif">۳۳</text>',
    organizer: '<rect x="70" y="30" width="180" height="140" rx="20" fill="#17191D" stroke="#F5C451" stroke-opacity=".3"/>' +
      [0, 1, 2].map(function (i) {
        var y = 58 + i * 36;
        return '<rect x="92" y="' + (y - 9) + '" width="18" height="18" rx="5" fill="' + (i < 2 ? 'url(#fx-grad)' : 'none') + '" stroke="#F5C451" stroke-width="2"/>' +
          '<rect x="122" y="' + (y - 4) + '" width="' + (80 - i * 16) + '" height="8" rx="4" fill="#FFF8EA" fill-opacity=".55"/>';
      }).join('') +
      '<path d="M100 58 l4 4 l8 -8" fill="none" stroke="#101114" stroke-width="2.5" stroke-linecap="round" transform="translate(-2 0)"/>' +
      '<path d="M100 94 l4 4 l8 -8" fill="none" stroke="#101114" stroke-width="2.5" stroke-linecap="round" transform="translate(-2 0)"/>',
    privacy: '<path d="M160 26 L226 50 L226 104 C226 146 198 170 160 182 C122 170 94 146 94 104 L94 50 Z" fill="#17191D" stroke="url(#fx-grad)" stroke-width="4"/>' +
      '<rect x="134" y="98" width="52" height="42" rx="8" fill="url(#fx-grad)"/>' +
      '<path d="M144 98 V86 A16 16 0 0 1 176 86 V98" fill="none" stroke="url(#fx-grad)" stroke-width="7"/>' +
      '<circle cx="160" cy="116" r="5" fill="#101114"/>'
  };

  function artSvg(key) {
    var body = ART[key] || ART.calendar;
    return '<svg class="fx-art" viewBox="0 0 320 200" aria-hidden="true" focusable="false">' +
      body + '</svg>';
  }

  function ensureLightbox() {
    var root = doc.getElementById('lightbox-root');
    if (root) return root;
    root = doc.createElement('div');
    root.id = 'lightbox-root';
    root.className = 'lightbox';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'نمایش ویژگی');
    root.innerHTML =
      '<div class="lightbox-backdrop" data-lb="close"></div>' +
      '<div class="lightbox-panel">' +
      '<button type="button" class="lightbox-close" data-lb="close" aria-label="بستن">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="lightbox-stage" id="lb-stage"></div>' +
      '<p class="lightbox-count small" id="lb-count"></p>' +
      '<h2 class="lightbox-title" id="lb-title"></h2>' +
      '<p class="lightbox-text" id="lb-text"></p>' +
      '<div class="lightbox-actions">' +
      '<button type="button" class="lightbox-nav" data-lb="prev" aria-label="ویژگی قبلی"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg></button>' +
      '<a class="btn primary" id="lb-go" href="#/home">باز کردن</a>' +
      '<button type="button" class="lightbox-nav" data-lb="next" aria-label="ویژگی بعدی"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '</div></div>';
    doc.body.appendChild(root);
    root.addEventListener('click', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-lb]');
      if (!el) return;
      var act = el.getAttribute('data-lb');
      if (act === 'close') closeLightbox();
      else if (act === 'next') showLightbox(lightboxIndex + 1);
      else if (act === 'prev') showLightbox(lightboxIndex - 1);
    });
    global.addEventListener('keydown', function (ev) {
      if (!root.classList.contains('is-open')) return;
      if (ev.key === 'Escape') closeLightbox();
      else if (ev.key === 'ArrowLeft') showLightbox(lightboxIndex + 1);
      else if (ev.key === 'ArrowRight') showLightbox(lightboxIndex - 1);
      else if (ev.key === 'Tab') {
        var focusables = root.querySelectorAll('button, a[href]');
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (ev.shiftKey && doc.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });
    return root;
  }

  function showLightbox(index) {
    var list = NS.Data && NS.Data.features ? NS.Data.features : [];
    if (!list.length) return;
    lightboxIndex = (index + list.length) % list.length;
    var item = list[lightboxIndex];
    var root = ensureLightbox();
    doc.getElementById('lb-stage').innerHTML = artSvg(item.art);
    doc.getElementById('lb-count').textContent = toFa(lightboxIndex + 1) + ' از ' + toFa(list.length);
    doc.getElementById('lb-title').textContent = item.title;
    doc.getElementById('lb-text').textContent = item.text;
    var go = doc.getElementById('lb-go');
    go.setAttribute('href', item.route);
    go.textContent = item.cta;
    go.onclick = function () { closeLightbox(); };
    // Re-trigger the stage animation on each change.
    var stage = doc.getElementById('lb-stage');
    stage.classList.remove('is-swap');
    void stage.offsetWidth;
    stage.classList.add('is-swap');
  }

  function openLightbox(index) {
    var root = ensureLightbox();
    lastFocus = doc.activeElement;
    showLightbox(index);
    root.classList.add('is-open');
    doc.body.classList.add('fx-lock');
    var closeBtn = root.querySelector('.lightbox-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    var root = doc.getElementById('lightbox-root');
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    doc.body.classList.remove('fx-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------------------------- Delegated clicks ---------------------------- */

  function onClick(ev) {
    var lbOpen = ev.target.closest && ev.target.closest('[data-lightbox]');
    if (lbOpen) {
      ev.preventDefault();
      openLightbox(parseInt(lbOpen.getAttribute('data-lightbox'), 10) || 0);
      return;
    }
    var step = ev.target.closest && ev.target.closest('[data-carousel-dir]');
    if (step) {
      var carousel = step.closest('.carousel');
      if (carousel) stepCarousel(carousel, parseInt(step.getAttribute('data-carousel-dir'), 10) || 1);
    }
  }

  /* ---------------------------- Mutation hooks ---------------------------- */

  function watchView() {
    var view = doc.getElementById('view');
    if (!view || !global.MutationObserver) return;
    var mo = new global.MutationObserver(function () { scan(view); });
    mo.observe(view, { childList: true, subtree: true });
    scan(view);
  }

  function watchNav() {
    var nav = doc.querySelector('.bottom-nav');
    if (!nav) return;
    if (!nav.querySelector('.nav-pill')) {
      var pill = doc.createElement('span');
      pill.className = 'nav-pill';
      pill.setAttribute('aria-hidden', 'true');
      nav.insertBefore(pill, nav.firstChild);
    }
    if (global.MutationObserver) {
      new global.MutationObserver(syncPill).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-current'] });
    }
    global.addEventListener('resize', syncPill);
    global.addEventListener('hashchange', function () { global.setTimeout(syncPill, 0); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(syncPill);
    syncPill();
  }

  function init() {
    var root = doc.documentElement;
    root.classList.add('fx-on');
    if (global.IntersectionObserver) {
      io = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { revealNow(e.target); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    doc.addEventListener('click', onClick);
    doc.addEventListener('pointerdown', onPointerDown, { passive: true });
    doc.addEventListener('pointermove', onPointerMove, { passive: true });
    doc.addEventListener('pointerout', onPointerLeave, { passive: true });
    initProgress();
    watchNav();
    watchView();
  }

  NS.Fx = {
    level: level,
    runSplash: runSplash,
    scan: scan,
    art: artSvg,
    openLightbox: openLightbox,
    closeLightbox: closeLightbox,
    init: init
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
