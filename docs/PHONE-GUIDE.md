# FETROS on your Android phone: a beginner's guide

This guide covers five things, all with free tools and no computer required:

1. Put the website online (hosting).
2. Open it on your phone and install it like an app.
3. Test it, including offline use.
4. Build the Android app (an **APK**, which is an Android installer file) and install it.
5. Optional: create your own release key, so future updates install over the old app.

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
   This setting must be done once by you. The project cannot turn it on for you.
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
   **Tip:** Long-press the icon to see shortcuts for prayer times, reminders and the calendar.

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
- [ ] **Settings → اندازه‌ی متن:** choose «بزرگ». The body text gets larger.
- [ ] **Settings:** change the theme and the colour accent. The change applies immediately.
- [ ] **Backup:** in settings, tap **ذخیره‌ی پشتیبان (JSON)**. Android opens a share sheet. Save the
  file to **Files / Drive** somewhere safe.
- [ ] **Calendar file:** in settings, tap **ذخیره‌ی تقویم (ICS)**. Choose the **Calendar** app in the
  share sheet to import your events and reminders.

### Test offline (important)

1. Open FETROS once while online so it can save itself on the phone.
2. Turn on **Airplane mode**.
3. Close the app completely (swipe it away from recent apps), then open it again.
4. The calendar, prayer times, Qibla, organizer, dhikr and settings should all still work.
   Weather will say it needs internet. That is expected.
5. Turn Airplane mode off.

### Notifications and Azan (know the limits)

- To allow notifications: **تنظیمات → اعلان‌ها و بازخورد → درخواست اجازه‌ی اعلان**, then tap **Allow**.
  In the Android app, the settings page also shows the status of Android notifications.
- In the **Android app**, prayer times for the next 7 days, your medication times and your reminders
  are handed to Android. They can show **while the app is closed**. Android can still delay or drop
  them. To help them arrive on time:
  - Set **Settings → Apps → FETROS → Battery → Unrestricted** (or "Don't optimise").
  - If Android asks about **alarms and reminders**, allow it (Settings → Apps → FETROS → Alarms &
    reminders).
  - Do not force-stop the app.
- Scheduled alerts use the phone's **default sound**. They do not play your Azan file.
- The **Azan file** plays only while the app is open. Go to **اوقات شرعی**, choose your own audio file
  (up to 8 MB), and turn Azan on in settings. Tap play once to check it.
- Medication reminders are reminders only. They are not medical advice.

---

## Part 4: Build the Android app (APK, free, in the cloud)

An **APK** is an Android installer file. It is for your own phone. Google Play does not
accept it, and that is fine: this project does not publish to any store.

### Step A: Run the build

**Option 1: a test build (no release)**

1. Open the **Actions** tab of your repository.
2. In the left list, tap **Build Android APK**.
3. Tap **Run workflow** (on the right), then **Run workflow** again.
4. Wait about 10–20 minutes. The first build is the slowest. Tap the run to watch its progress.

**Option 2: a release (the APK is attached to a Release page)**

1. Open the **Code** tab, then tap **Releases** (on the right side of the page).
2. Tap **Draft a new release**.
3. In **Choose a tag**, type a new version such as `v1.1.0`, then tap **Create new tag**.
4. Give the release a title (for example `فطرس ۱.۱.۰`) and tap **Publish release**.
5. The build starts automatically. When it finishes, the APK appears on that release page under
   **Assets**. Its name ends with `-debug-key.apk` (test signing) or `-signed.apk` (your release key).

### Step B: Download the APK

- **From a test build:** when the run shows a green tick, tap it. Scroll to **Artifacts** and tap
  **fetros-apk**. Chrome downloads a ZIP file. Open it from the Files app and extract the `.apk` file.
- **From a release:** on the release page, tap the `.apk` file under **Assets**.

### Step C: Install it on your phone

1. Open the `.apk` file from the Files app or the download notification.
2. Android will say installing apps from this source is blocked. Tap **Settings**, turn on
   **Allow from this source** (for Chrome or Files), go back, and tap **Install**.
   Android shows this warning for any app that is not from the Play Store.
3. Tap **Open** when installation finishes.

---

## Part 5: Optional: your own release key (for clean updates)

Without a release key, each build may be signed with a different test key. Android then refuses to
install the new APK over the old one, and you must uninstall first (which deletes local data).
With your own key, every release installs over the previous one, and your data stays.

**Keep the key file and its passwords safe.** If you lose them, you cannot publish updates that
install over the existing app. Store a copy of the key file in your Google Drive or another safe place.

### Step 1: Create the key on your phone (Termux, free)

1. Install **Termux** from **F-Droid** (https://f-droid.org). The Play Store version is old.
2. Open Termux and run these commands one line at a time:

```
pkg update -y && pkg install -y openjdk-17 coreutils
keytool -genkeypair -v -keystore fetros-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias fetros
```

3. `keytool` asks for a password (choose a strong one and write it down), your name, and so on.
   Answer as you like. Type `yes` at the end to confirm.
4. Create the text version for GitHub:

```
base64 -w 0 fetros-release.jks > fetros-keystore.b64
cat fetros-keystore.b64
```

5. Long-press the long line of text and copy it.
6. Move the key file to a safe place. It is at `~/fetros-release.jks` in Termux. Copy it to your
   phone's Download folder with `cp fetros-release.jks /sdcard/Download/` (allow storage access if
   Termux asks).

### Step 2: Add the four secrets on GitHub

1. Open your repository on GitHub, then **Settings → Secrets and variables → Actions**.
2. Tap **New repository secret** and add these four, one at a time:

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the long text you copied in step 5 |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `fetros` |
| `ANDROID_KEY_PASSWORD` | the key password (usually the same as the keystore password) |

GitHub hides secret values after you save them. Nobody, including the project, can read them back.

### Step 3: Build a signed release

Run **Part 4, Option 2** again with a new version tag, such as `v1.1.1`. The APK is then signed with
your key and ends with `-signed.apk`.

---

## Important notes about APKs

- **Uninstalling FETROS deletes its local data** (tasks, notes, settings). Save a backup first
  (**Settings → ذخیره‌ی پشتیبان**).
- If an update fails with *App not installed* or a signature conflict, the new APK was signed with a
  different key. Save a backup, uninstall FETROS, install the new APK, then restore the backup
  (**Settings → وارد کردن پشتیبان**).
- If Android says **Parse error** or **There was a problem parsing the package**, the download was
  incomplete. Download it again.
- Do not share APKs you did not build yourself.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| Pages shows *404* | Wait 5 minutes. Check **Settings → Pages** shows "GitHub Actions" as the source. |
| Pages page is blank or old | Refresh with a hard reload or clear Chrome's site data for the address. |
| The build fails (red cross) | Open the failed run and read the first red line. Send that message to whoever maintains the project. |
| The release has no APK | Open the **Build Android APK** run for that tag. If it failed, read the red line. |
| "Install app" is not in the menu | Use the site over **https** (the Pages address), not an HTTP or local-file address. Chrome must also have visited the site once. |
| Notifications do not appear | Check the Android permission and the battery setting (Part 3). Make sure the app was not force-stopped. |
| Prayer times look different from the mosque | Calculated times depend on the method. Change the method and the Asr school in **اوقات شرعی** to match your local authority. |
| Hijri date is one day off | Use **تنظیمات → تصحیح تاریخ قمری** to shift it by a day. |
| No compass movement | Some phones have no magnetometer, or the browser blocks motion sensors. Use the slider. |
| No Azan sound | Check the volume, silent mode, and that the app is open. Tap play once. |
| The save or share sheet does not open | Update to the newest APK. Backups and calendar files are shared through Android's share sheet. |
| Weather says "offline" | Weather needs internet. All other tools work offline. |

---

## What FETROS does with your data

- Your data stays on your phone. The app has no accounts and no analytics.
- The only internet request the app makes is the optional weather request to Open-Meteo.
- Backups and calendar files are plain files and **not encrypted**. Store them carefully.

## Credits

- Weather data: Open-Meteo, CC BY 4.0 (https://open-meteo.com). Free for non-commercial use.
- Font: Vazirmatn, SIL Open Font License 1.1.
- Android app: Capacitor (MIT licence) with its official plugins for notifications, files and sharing.
- The holiday list is a SAMPLE and must be checked against official announcements.
