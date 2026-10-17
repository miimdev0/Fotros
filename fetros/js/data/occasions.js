/*
 * FETROS — occasions dataset (js/data/occasions.js)
 *
 * ⚠ SAMPLE DATA. This list is a starter set, NOT a verified official calendar.
 * Holiday status in Iran (and elsewhere) is announced every year by the
 * government and religious authorities, and Hijri dates depend on moon
 * sighting. Before relying on this list:
 *   1. Compare each entry with the official holiday announcement for the year.
 *   2. Edit, add or remove entries below. The calendar engine reads this file
 *      only, so no other code needs to change.
 *
 * Item fields:
 *   id        unique string
 *   title     Persian text shown to the user
 *   calendar  'persian' (شمسی) | 'hijri' (قمری) | 'gregorian' (میلادی)
 *   month     1–12 in that calendar
 *   day       1–31 in that calendar
 *   year      (optional) only match this year of that calendar
 *   holiday   true when the item is marked as a public holiday in this sample
 *   kind      'official' | 'religious' | 'occasion'
 *   note      (optional) short Persian note
 *
 * Hijri entries use the tabular calendar with the user's offset setting.
 * Hijri dates can differ by a day from local moon sighting.
 *
 * Exposes: window.FETROS.Data.occasions
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  NS.Data = NS.Data || {};

  NS.Data.occasions = {
    meta: {
      version: '2026.1-sample',
      status: 'sample',
      updatedAt: '2026-10-17',
      warning: 'فهرست نمونه است و پیش از استفاده باید با تقویم رسمی سال تطبیق داده شود.'
    },
    items: [
      // ---- Solar Hijri (شمسی) ----
      { id: 'sh-nowruz-1', title: 'نوروز — آغاز سال نو', calendar: 'persian', month: 1, day: 1, holiday: true, kind: 'official' },
      { id: 'sh-nowruz-2', title: 'نوروز — روز دوم', calendar: 'persian', month: 1, day: 2, holiday: true, kind: 'official' },
      { id: 'sh-nowruz-3', title: 'نوروز — روز سوم', calendar: 'persian', month: 1, day: 3, holiday: true, kind: 'official' },
      { id: 'sh-nowruz-4', title: 'نوروز — روز چهارم', calendar: 'persian', month: 1, day: 4, holiday: true, kind: 'official' },
      { id: 'sh-islamic-republic', title: 'روز جمهوری اسلامی ایران', calendar: 'persian', month: 1, day: 12, holiday: true, kind: 'official' },
      { id: 'sh-sizdebedar', title: 'سیزده‌به‌در', calendar: 'persian', month: 1, day: 13, holiday: true, kind: 'official' },
      { id: 'sh-khomeini', title: 'درگذشت امام خمینی (ره)', calendar: 'persian', month: 3, day: 14, holiday: true, kind: 'official' },
      { id: 'sh-khordad-15', title: 'قیام ۱۵ خرداد', calendar: 'persian', month: 3, day: 15, holiday: true, kind: 'official' },
      { id: 'sh-teachers', title: 'روز معلم', calendar: 'persian', month: 2, day: 12, holiday: false, kind: 'occasion' },
      { id: 'sh-revolution', title: 'پیروزی انقلاب اسلامی', calendar: 'persian', month: 11, day: 22, holiday: true, kind: 'official' },
      { id: 'sh-oil', title: 'روز ملی شدن صنعت نفت', calendar: 'persian', month: 12, day: 29, holiday: false, kind: 'occasion' },
      { id: 'sh-yalda', title: 'شب یلدا', calendar: 'persian', month: 9, day: 30, holiday: false, kind: 'occasion', note: 'مناسبت فرهنگی' },

      // ---- Hijri (قمری) — religious occasions ----
      { id: 'hj-new-year', title: 'آغاز سال قمری', calendar: 'hijri', month: 1, day: 1, holiday: true, kind: 'religious' },
      { id: 'hj-tasua', title: 'تاسوعای حسینی', calendar: 'hijri', month: 1, day: 9, holiday: true, kind: 'religious' },
      { id: 'hj-ashura', title: 'عاشورای حسینی', calendar: 'hijri', month: 1, day: 10, holiday: true, kind: 'religious' },
      { id: 'hj-arbaeen', title: 'اربعین حسینی', calendar: 'hijri', month: 2, day: 20, holiday: true, kind: 'religious' },
      { id: 'hj-prophet-death', title: 'رحلت پیامبر اکرم (ص) و شهادت امام حسن (ع)', calendar: 'hijri', month: 2, day: 28, holiday: true, kind: 'religious' },
      { id: 'hj-reza-martyr', title: 'شهادت امام رضا (ع)', calendar: 'hijri', month: 2, day: 30, holiday: true, kind: 'religious' },
      { id: 'hj-prophet-birth', title: 'میلاد پیامبر اکرم (ص) و امام صادق (ع)', calendar: 'hijri', month: 3, day: 17, holiday: true, kind: 'religious' },
      { id: 'hj-ali-birth-rajab', title: 'میلاد امام علی (ع) و روز پدر', calendar: 'hijri', month: 7, day: 13, holiday: true, kind: 'religious' },
      { id: 'hj-mabas', title: 'عید مبعث', calendar: 'hijri', month: 7, day: 27, holiday: true, kind: 'religious' },
      { id: 'hj-mahdi-birth', title: 'میلاد امام زمان (عج)', calendar: 'hijri', month: 8, day: 15, holiday: true, kind: 'religious' },
      { id: 'hj-ali-martyr', title: 'شهادت امام علی (ع)', calendar: 'hijri', month: 9, day: 21, holiday: true, kind: 'religious' },
      { id: 'hj-eid-fitr', title: 'عید سعید فطر', calendar: 'hijri', month: 10, day: 1, holiday: true, kind: 'religious' },
      { id: 'hj-eid-adha', title: 'عید سعید قربان', calendar: 'hijri', month: 12, day: 10, holiday: true, kind: 'religious' },
      { id: 'hj-ghadir', title: 'عید سعید غدیر خم', calendar: 'hijri', month: 12, day: 18, holiday: true, kind: 'religious' },

      // ---- Gregorian (میلادی) — example entry ----
      { id: 'gr-new-year', title: 'آغاز سال میلادی', calendar: 'gregorian', month: 1, day: 1, holiday: false, kind: 'occasion' }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
