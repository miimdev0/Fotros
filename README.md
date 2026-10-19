# فطرس (FETROS)

**FETROS** is a Persian-first, offline-capable calendar and daily companion. It runs as a
website, can be installed on an Android phone like an app, and can be built as an Android APK.

- Persian (شمسی), Gregorian (میلادی) and Hijri (قمری) calendars, with conversion and month views
- Sample holiday and occasion list (clearly marked as sample data)
- Personal events, birthdays and anniversaries, with search
- Prayer times (اوقات شرعی) with 7 calculation methods, minute adjustments, and 29 cities
- Qibla compass with sensor support and a manual fallback
- Dhikr counter, tasks, notes, reminders
- Optional medication reminders (reminders only, not medical advice)
- Optional weather (Open-Meteo, no API key)
- Settings, backup export/import, theme and accent colours, reduced-motion support
- Adjustable text size (normal, large, very large)
- Calendar export to `.ics` for your phone's calendar app (events, birthdays, reminders)
- Android app: alerts scheduled with the system (best effort, see limits), the share sheet for
  backups and calendar files, and home-screen shortcuts (prayer, reminders, calendar)
- No accounts, no analytics, no advertising. Your data stays on your device.

The interface is in Persian and laid out right-to-left. Code and comments are in English.

> **Start here if you are new:** read [docs/PHONE-GUIDE.md](docs/PHONE-GUIDE.md). It explains, step by
> step on an Android phone, how to host the site for free, install it, test it offline, and build
> an Android APK with free tools.

---

## Honest limits (please read)

- **Prayer times are calculated**, not copied from any authority. The engine uses the solar
  position and the angle for each prayer, following the method you pick. Your local religious
  authority may announce slightly different times. Check the method and city in settings.
- **Hijri dates use the tabular (arithmetical) method**, not the moon-sighting calendar. The
  settings page lets you shift the result by −2 to +2 days. In a check against the Umm al-Qura
  table over 2000–2030, the default offset matched 43.9% of days, and +1 matched 50.5%. Treat Hijri
  dates as approximate.
- **Holidays are SAMPLE data.** `fetros/js/data/occasions.js` is a starter list. It is not an
  official calendar. Before relying on it, compare it with the official announcement for the year
  and edit the file.
- **Notifications and Azan are best-effort.** In a browser, reminders and prayer alerts work while
  the app is open or while the browser lets the service worker run. In the Android app, alerts for
  the next 7 days are handed to Android, so they can show while the app is closed. Android may still
  delay or drop them (battery saving, force stop, or a revoked permission). **No alert is guaranteed.**
  Scheduled alerts use the phone's default sound, not your Azan file.
- **Azan audio is your file.** The app does not ship any Azan recording. You upload an audio file
  (up to 8 MB), and it plays while the app is open. Browsers may require you to tap play first.
- **Weather needs internet.** Data comes from [Open-Meteo](https://open-meteo.com) under the
  CC BY 4.0 licence. See *Licences and attribution* below.

---

## Using the app

| Tab | What it does |
|---|---|
| خانه (Home) | Today's dates, next prayer with countdown, tasks, short calendar preview |
| تقویم (Calendar) | Month grid, occasions, your events, search, date converter |
| اوقات شرعی (Prayer) | Prayer times for your city, method, Asr school, adjustments, Azan file |
| ابزارها (Tools) | Organizer (tasks, notes, reminders), dhikr counter, Qibla, medications, weather |
| تنظیمات (Settings) | Appearance, notifications, numerals, Hijri correction, backup, about |

The round **+** button adds a task, note, reminder or event from anywhere.

---

## Run it on a computer (for development)

The website needs no build step. Any static file server works. From the repository root:

```bash
python3 -m http.server 8080 --directory fetros
```

Then open `http://localhost:8080`. You can also open `fetros/index.html` directly in a browser,
but some features (service worker, installation) need `http://localhost` or `https://`.

---

## Tests (Node is used only for tests)

The website itself does not use Node. Node 22.22 or newer runs the test suite only (a test
dependency requires it).

```bash
npm install
npm test
```

The suite contains 83 checks:

- `fetros/tests/calendar.test.js`: Gregorian and Persian conversion against `Date` and
  `jalaali-js` (1300–1500 AP), Nowruz dates, leap years, Hijri sanity checks.
- `fetros/tests/prayer.test.js`: prayer times against `adhan` (540 comparisons across 3 cities,
  6 methods and 5 dates; each within one minute), Qibla bearings and distance, next-prayer logic.
- `fetros/tests/app.test.js`: the real `index.html` in jsdom, run twice, once with IndexedDB
  (`fake-indexeddb`) and once with the localStorage fallback. Covers every route, forms, saves,
  settings, quick-add, backup round trip, reminders, medication windows and weather handling.
- `fetros/tests/data-and-assets.test.js`: city and sample-data checks, record validation, the
  manifest, icon sizes, service-worker precache coverage, a privacy scan (no analytics or
  third-party trackers), and an outbound-URL check (only Open-Meteo).
- `fetros/tests/v2-features.test.js`: the Android alert plan (prayer times match the engine,
  logged doses are skipped, date ranges, recurring reminders, the cap), calendar export (CRLF,
  escaping, 75-octet folding, Persian yearly dates), the text-size setting, and the manifest shortcuts.
- `fetros/tests/native-app.test.js`: the real page with a fake Android notification plugin. Checks
  that alerts are scheduled and replaced, nothing is scheduled without permission, and the browser
  path stays inactive.

Not covered by automated tests: the real Android install flow, real sensors (compass), real
audio playback, real push or background behaviour, and visual layout on physical screens. Test
those on your phone using the phone guide.

---

## Project layout

```
index.html            App shell (RTL, bottom navigation, splash)
style.css             Design tokens, layout, motion (respects reduced motion)
script.js             Router, appearance, settings view, notifications, service worker registration
manifest.json         Installable web app manifest (Persian name, RTL, standalone)
sw.js                 Service worker: precache app shell, network-first, offline fallback
js/calendar-engine.js Gregorian / Persian / Hijri arithmetic and digit helpers
js/prayer-engine.js   Solar prayer times, methods, Asr, Qibla bearing and distance
js/storage.js         IndexedDB store with localStorage fallback, sanitising, backup
js/location.js        City / custom / GPS location resolution
js/ui.js              Shared UI helpers: escaping, modal sheet, toasts, action registry
js/native.js         Android app only: system alert plan and sync, share sheet for files
js/ics.js            Calendar export (RFC 5545 .ics)
js/view-*.js          Home, calendar, prayer & Qibla, tools (organizer, dhikr, meds, weather)
js/data/cities.js     29 cities with coordinates and time zones
js/data/occasions.js  SAMPLE occasions (labelled as sample)
fonts/                Vazirmatn (SIL Open Font License 1.1, see fonts/OFL.txt)
icons/                icon.svg (source), icon-192.png, icon-512.png
tests/                Node test suite (not shipped as part of the app logic)
capacitor.config.json Capacitor settings for the Android wrapper (webDir = fetros)
.github/workflows/    android-apk.yml (tests, APK, GitHub Release on tags), pages.yml (website hosting)
docs/PHONE-GUIDE.md   Beginner guide for Android: hosting, testing, installing the APK
```

Classic `<script>` tags are used on purpose, so the site also runs from a folder with no server
and no build. Global state lives under `window.FETROS`.

---

## Data and privacy

- All personal data (tasks, notes, reminders, events, medications, dhikr history, settings) is
  stored **on your device** in IndexedDB. If IndexedDB is unavailable, the app uses localStorage.
- Nothing is uploaded. The only outbound request is the optional weather call to Open-Meteo.
- Backups are JSON files you save yourself. They are **not encrypted**. Keep them somewhere safe.
  Azan audio files are not part of backups.
- "Clear all local data" in settings removes records, the Azan file, settings and the weather cache.

---

## Version 1.2: visual layer and the Rokh font

- New motion layer in `fetros/js/fx.js`: loader counter, reveal on scroll, count-up numbers, magnetic buttons, card tilt, ripples, a sliding nav pill, pointer parallax, a scroll progress bar, the feature carousel, and the lightbox.
- Three motion levels (کامل, کم, none), plus the OS reduced-motion preference.
- Feature showcase data lives in `fetros/js/data/features.js`. Artwork is drawn in code (no screenshots).
- Icon: `fetros/icons/icon.svg` (original artwork) rendered to `icon-192.png` and `icon-512.png`.
- Display font: `fonts/Rokh.ttf` is loaded when present, with Vazirmatn as the fallback. Rokh is a paid font and is **not** bundled. See the phone guide for how to add a licensed copy.

## Licences and attribution

- **Code:** original work for this project. No third-party JavaScript libraries are shipped in
  the app. Test-only dependencies (`adhan`, `jalaali-js`, `jsdom`, `fake-indexeddb`) are installed
  only for `npm test`.
- **Font:** Vazirmatn by the Vazirmatn Project Authors, SIL Open Font License 1.1 (`fonts/OFL.txt`).
- **Weather data:** [Open-Meteo](https://open-meteo.com), licensed CC BY 4.0. The app shows this
  attribution. Open-Meteo's free tier is for non-commercial use. If you ever add ads, a paid
  plan, or any other revenue, you must replace the weather provider first.
- **Sample occasions** are a starter list written for this project, not an official source.
- **Android build dependencies** (Capacitor and its official plugins, MIT licence) are downloaded
  by the build workflow. They are not stored in this repository.

---

## Hosting for free

The website is static. Two free options:

1. **GitHub Pages (recommended):** the included workflow `.github/workflows/pages.yml` publishes the
   `fetros/` folder. Turn it on once: repository **Settings → Pages → Build and deployment → Source:
   GitHub Actions**. Your site appears at `https://<your-user>.github.io/<repo>/`.
2. **Netlify Drop or similar:** drag the `fetros` folder into a free static host.

Step-by-step instructions, including testing and the APK build, are in
[docs/PHONE-GUIDE.md](docs/PHONE-GUIDE.md).

---

## Building the Android app (free)

The workflow `.github/workflows/android-apk.yml` runs the tests and builds an **APK** on GitHub's
free runners. You need no computer.

- **Every push to `main` and every pull request:** runs the tests and keeps the APK as a workflow
  artifact (Actions tab, kept for 14 days).
- **A version tag such as `v1.1.0`:** also publishes a **GitHub Release** with the APK attached.
- **Signing:** if the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` exist, the APK is signed with **your release key**.
  Use the same key for every release, so each update installs over the previous one. Without the
  secrets, the APK uses Android's debug key. That is fine for testing, but each build may use a
  different key, so an update may need an uninstall first.

The phone guide explains how to create the release key on your phone and add the secrets.
This project does not publish to Google Play or the App Store.

---

## Contributing and updates

- Keep `APP_VERSION` in `script.js`, `CACHE_VERSION` in `sw.js` and `version` in `package.json` equal.
  A test checks the first two.
- Change the sample holidays in `fetros/js/data/occasions.js` only with official sources.
- Run `npm test` before every commit.
