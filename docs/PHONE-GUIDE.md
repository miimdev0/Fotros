# FETROS on your Android phone: a beginner's guide

This guide covers four things, all with free tools and no computer required:

1. Put the website online (hosting).
2. Open it on your phone and install it like an app.
3. Test it, including offline use.
4. Build a **debug APK** (an Android installer file) and install it.

Read each step once before you start. Nothing here costs money.

---

## Before you start: what you need

- An Android phone with Chrome (already installed on most phones).
- A free **GitHub account** (https://github.com/signup). GitHub hosts the website, runs the
  build, and stores the APK. The FETROS app itself never asks you to sign up.
- The FETROS repository (`miimdev0/Fotros`), which you already have.

> **Good to know:** The APK build runs on GitHub's free servers. On a **public** repository it is
> unlimited. On a **private** repository, GitHub Free includes 2,000 Actions minutes per month,
> which is plenty for a few builds.

---

## Part 1: Put the website online (GitHub Pages)

1. Open your repository on GitHub (in Chrome, `https://github.com/miimdev0/Fotros`).
2. Tap the **Settings** tab. If you do not see it, tap the menu (⋮) first.
3. In the left column, tap **Pages**.
4. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. Go to the **Actions** tab. Choose **Deploy website to GitHub Pages**, then tap
   **Run workflow**, then **Run workflow** again to confirm.
6. Wait 1–3 minutes until the run shows a green tick.
7. Your site is now at:
   `https://miimdev0.github.io/Fotros/`

If the page shows *404* at first, wait five minutes and refresh. GitHub sometimes takes a while
after the first deployment.

---

## Part 2: Open it on your phone and install it

1. Open Chrome and go to your Pages address from Part 1.
2. Wait for the splash screen (a sun over the horizon) to finish.
3. Install it:
   - Tap the **⋮** menu in Chrome (top right).
   - Tap **Install app** (or **Add to Home screen**).
   - Confirm **Install**.
4. An icon named **فطرس** appears on your home screen. Open it from there.
   It opens without the browser bar, like an app.

**Tip:** The top bar of the app shows **آنلاین** or **آفلاین** (online or offline).

---

## Part 3: Test it

Work through this checklist. Each item should work on your phone.

- [ ] **Home:** next prayer and countdown appear. The sun animation plays (turn off animations in
  settings if you prefer none).
- [ ] **Calendar:** tap a day to see its Persian, Gregorian and Hijri dates. Move between months.
  Search for a holiday name such as «نوروز».
- [ ] **Prayer:** seven times are listed for Tehran. In settings you can change the city, the method,
  and the Asr school.
- [ ] **Qibla:** the compass shows. If your phone has no compass sensor, use the slider.
- [ ] **Tools → Organizer:** add a task and a note. Mark the task done.
- [ ] **Tools → Dhikr:** tap the big circle. The counter goes up and vibrates at the target.
- [ ] **Settings:** change the theme and the colour accent. The change applies immediately.
- [ ] **Backup:** in settings, save a backup (JSON). Keep this file somewhere safe.

### Test offline (important)

1. Open FETROS once while online so it can save itself on the phone.
2. Turn on **Airplane mode**.
3. Close the app completely (swipe it away from recent apps), then open it again.
4. The calendar, prayer times, Qibla, organizer, dhikr and settings should all still work.
   Weather will say it needs internet. That is expected.
5. Turn Airplane mode off.

### Notifications and Azan (know the limits)

- The app can show reminders and prayer alerts **while it is open**. It **cannot promise** that they
  appear when the app is closed, because Android may stop background timers to save battery.
- To allow notifications: **تنظیمات → اعلان‌ها و بازخورد → درخواست اجازه‌ی اعلان**, then tap **Allow**.
- To use Azan: go to **اوقات شرعی**, choose your own audio file (up to 8 MB), and turn Azan on in
  settings. Tap play once to check it. Browsers often need one tap before they play sound.

---

## Part 4: Build a debug APK (free, in the cloud)

A **debug APK** is an Android installer file. It is for your own phone. Google Play does not
accept it, and that is fine: this project does not publish to any store.

### Step A: Run the build

1. Open the **Actions** tab of your repository.
2. In the left list, tap **Build debug APK**.
3. Tap **Run workflow** (on the right), then **Run workflow** again.
4. Wait about 10–20 minutes. The first build is the slowest. You can watch the progress by tapping
   the run.

### Step B: Download the APK

1. When the run shows a green tick, tap it.
2. Scroll to the bottom, under **Artifacts**.
3. Tap **fetros-debug-apk**. Chrome downloads a ZIP file.
4. Open the ZIP (from the **Files** app or the download notification). Inside is
   **fetros-debug.apk**. Extract it if needed.

### Step C: Install it on your phone

1. Open **fetros-debug.apk** from the Files app.
2. Android will say installing apps from this source is blocked. Tap **Settings**, turn on
   **Allow from this source** (for Chrome or Files), go back, and tap **Install**.
   Android shows this warning for any app that is not from the Play Store.
3. Tap **Open** when installation finishes.

### Important notes about APKs

- **Uninstalling FETROS deletes its local data** (tasks, notes, settings). Save a backup first
  (**Settings → ذخیره‌ی پشتیبان**).
- Updating: each cloud build may be signed with a **new** debug key, and Android will not install an
  APK over an app signed with a different key. So to update: save a backup, uninstall the old
  FETROS, then install the new APK and restore the backup (**Settings → وارد کردن پشتیبان**).
- If Android says **App not installed** because of a conflict, uninstall the older FETROS first,
  after saving a backup.
- If Android says **Parse error** or **There was a problem parsing the package**, the download was
  incomplete. Download the ZIP again.
- Do not share APKs you did not build yourself.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| Pages shows *404* | Wait 5 minutes. Check **Settings → Pages** shows "GitHub Actions" as the source. |
| Pages page is blank or old | Refresh with a hard reload or clear Chrome's site data for the address. |
| The build fails (red cross) | Open the failed run and read the first red line. Often a test failed. Send the message to whoever maintains the project. |
| "Install app" is not in the menu | Use the site over **https** (the Pages address), not an HTTP or local-file address. Chrome must also have visited the site once. |
| Prayer times look different from the mosque | Calculated times depend on the method. Change the method and the Asr school in **اوقات شرعی** to match your local authority. |
| Hijri date is one day off | Use **تنظیمات → تصحیح تاریخ قمری** to shift it by a day. |
| No compass movement | Some phones have no magnetometer, or the browser blocks motion sensors. Use the slider. |
| No Azan sound | Check the volume, silent mode, and that the app is open. Tap play once. |
| Weather says "offline" | Weather needs internet. All other tools work offline. |

---

## What FETROS does with your data

- Your data stays on your phone. The app has no accounts and no analytics.
- The only internet request the app makes is the optional weather request to Open-Meteo.
- Backups are plain JSON and **not encrypted**. Store them carefully.

## Credits

- Weather data: Open-Meteo, CC BY 4.0 (https://open-meteo.com). Free for non-commercial use.
- Font: Vazirmatn, SIL Open Font License 1.1.
- The holiday list is a SAMPLE and must be checked against official announcements.
