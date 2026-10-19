/*
 * FETROS — feature showcase data (js/data/features.js)
 *
 * Used by the home carousel and its lightbox. Each entry describes a real
 * FETROS feature and links to the screen where it lives. Artwork is drawn
 * with code (see js/fx.js), not with screenshots or photos.
 *
 * Exposes: window.FETROS.Data.features (read-only array).
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  NS.Data = NS.Data || {};

  NS.Data.features = Object.freeze([
    {
      id: 'calendar',
      art: 'calendar',
      title: 'تقویم سه‌گانه',
      short: 'شمسی، میلادی و قمری',
      text: 'تاریخ امروز را هم‌زمان به شمسی، میلادی و قمری ببینید. تبدیل تاریخ‌ها کاملاً روی دستگاه انجام می‌شود و نیازی به اینترنت نیست.',
      route: '#/calendar',
      cta: 'باز کردن تقویم'
    },
    {
      id: 'prayer',
      art: 'prayer',
      title: 'اوقات شرعی',
      short: 'محاسبه‌ی محلی و دقیق',
      text: 'اوقات شرعی بر اساس موقعیت شما و روش محاسبه‌ای که انتخاب می‌کنید محاسبه می‌شود. شمارش معکوس تا اذان بعدی همیشه روی صفحه‌ی اصلی است.',
      route: '#/prayer',
      cta: 'اوقات شرعی'
    },
    {
      id: 'qibla',
      art: 'qibla',
      title: 'قبله‌نما',
      short: 'جهت دقیق کعبه',
      text: 'جهت قبله را از موقعیت خودتان با محاسبه‌ی مسیر کوتاه روی کره‌ی زمین پیدا کنید. اگر حسگر گوشی در دسترس نباشد، می‌توانید جهت را دستی تنظیم کنید.',
      route: '#/qibla',
      cta: 'قبله‌نما'
    },
    {
      id: 'dhikr',
      art: 'dhikr',
      title: 'شمارنده‌ی ذکر',
      short: 'هدف و پیشرفت روزانه',
      text: 'شمارنده‌ای با هدف‌های ۳۳، ۹۹، ۱۰۰ یا عدد دلخواه. پیشرفت شما با حلقه‌ای روان نشان داده می‌شود و به‌صورت محلی ذخیره می‌شود.',
      route: '#/dhikr',
      cta: 'شمارنده‌ی ذکر'
    },
    {
      id: 'organizer',
      art: 'organizer',
      title: 'کارها و یادآورها',
      short: 'برنامه‌ریزی آرام',
      text: 'کارها، یادداشت‌ها و یادآورها را در یک جا نگه دارید. کارهای تکراری ساخته می‌شوند و هنگام باز بودن برنامه به شما یادآوری می‌کند.',
      route: '#/organizer/tasks',
      cta: 'کارها'
    },
    {
      id: 'privacy',
      art: 'privacy',
      title: 'حریم خصوصی',
      short: 'بدون حساب کاربری',
      text: 'فطرس حساب کاربری، تبلیغ و ردیاب ندارد. داده‌ها روی دستگاه خودتان می‌ماند و با پشتیبان‌گیری فایل‌دار منتقل می‌شود.',
      route: '#/settings',
      cta: 'تنظیمات و پشتیبان'
    }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
