/*
 * FETROS — city list (js/data/cities.js)
 *
 * Coordinates are approximate city-centre values (about 0.01° precision),
 * entered for prayer-time and Qibla calculations. Users can always enter
 * exact coordinates in settings. `tz` is the IANA time zone used to show
 * clock times for that city.
 *
 * To add a city, append an object with: id (unique), name (Persian),
 * lat, lon, tz. Keep ids stable so saved settings keep working.
 *
 * Exposes: window.FETROS.Data.cities and window.FETROS.Data.findCity(id)
 */
(function (global) {
  'use strict';

  var NS = global.FETROS = global.FETROS || {};
  NS.Data = NS.Data || {};

  NS.Data.cities = [
    { id: 'tehran', name: 'تهران', lat: 35.6892, lon: 51.3890, tz: 'Asia/Tehran' },
    { id: 'mashhad', name: 'مشهد', lat: 36.2605, lon: 59.6168, tz: 'Asia/Tehran' },
    { id: 'isfahan', name: 'اصفهان', lat: 32.6546, lon: 51.6680, tz: 'Asia/Tehran' },
    { id: 'shiraz', name: 'شیراز', lat: 29.5918, lon: 52.5836, tz: 'Asia/Tehran' },
    { id: 'tabriz', name: 'تبریز', lat: 38.0962, lon: 46.2738, tz: 'Asia/Tehran' },
    { id: 'ahvaz', name: 'اهواز', lat: 31.3183, lon: 48.6706, tz: 'Asia/Tehran' },
    { id: 'qom', name: 'قم', lat: 34.6416, lon: 50.8746, tz: 'Asia/Tehran' },
    { id: 'karaj', name: 'کرج', lat: 35.8400, lon: 50.9391, tz: 'Asia/Tehran' },
    { id: 'yazd', name: 'یزد', lat: 31.8974, lon: 54.3569, tz: 'Asia/Tehran' },
    { id: 'kerman', name: 'کرمان', lat: 30.2839, lon: 57.0834, tz: 'Asia/Tehran' },
    { id: 'rasht', name: 'رشت', lat: 37.2808, lon: 49.5832, tz: 'Asia/Tehran' },
    { id: 'kermanshah', name: 'کرمانشاه', lat: 34.3142, lon: 47.0650, tz: 'Asia/Tehran' },
    { id: 'hamedan', name: 'همدان', lat: 34.7983, lon: 48.5147, tz: 'Asia/Tehran' },
    { id: 'urmia', name: 'ارومیه', lat: 37.5527, lon: 45.0761, tz: 'Asia/Tehran' },
    { id: 'ardabil', name: 'اردبیل', lat: 38.2498, lon: 48.2933, tz: 'Asia/Tehran' },
    { id: 'zahedan', name: 'زاهدان', lat: 29.4963, lon: 60.8629, tz: 'Asia/Tehran' },
    { id: 'bandarabbas', name: 'بندرعباس', lat: 27.1865, lon: 56.2808, tz: 'Asia/Tehran' },
    { id: 'mecca', name: 'مکه مکرمه', lat: 21.4225, lon: 39.8262, tz: 'Asia/Riyadh' },
    { id: 'medina', name: 'مدینه منوره', lat: 24.5247, lon: 39.5692, tz: 'Asia/Riyadh' },
    { id: 'dubai', name: 'دبی', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai' },
    { id: 'kabul', name: 'کابل', lat: 34.5553, lon: 69.2075, tz: 'Asia/Kabul' },
    { id: 'dushanbe', name: 'دوشنبه', lat: 38.5598, lon: 68.7870, tz: 'Asia/Dushanbe' },
    { id: 'baku', name: 'باکو', lat: 40.4093, lon: 49.8671, tz: 'Asia/Baku' },
    { id: 'istanbul', name: 'استانبول', lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' },
    { id: 'london', name: 'لندن', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
    { id: 'ashburn', name: 'اشبرن، ویرجینیا', lat: 39.0438, lon: -77.4874, tz: 'America/New_York' },
    { id: 'newyork', name: 'نیویورک', lat: 40.7128, lon: -74.0060, tz: 'America/New_York' },
    { id: 'toronto', name: 'تورنتو', lat: 43.6532, lon: -79.3832, tz: 'America/Toronto' },
    { id: 'losangeles', name: 'لس‌آنجلس', lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles' }
  ];

  NS.Data.findCity = function (id) {
    var list = NS.Data.cities;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
