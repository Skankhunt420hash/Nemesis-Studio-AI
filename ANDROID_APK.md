# Nemesis Studio als Android-APK (Capacitor)

Die Next.js-App braucht einen **laufenden Server** (API-Routen, Workspace). Die APK ist eine **native WebView-Hülle**, die deine **öffentliche URL** oder einen **PC im LAN** lädt.

## Voraussetzungen

- Node.js + `npm install`
- [Android Studio](https://developer.android.com/studio) (JDK, Android SDK)
- Für **Produktion:** App deployen (z. B. Vercel) — URL mit HTTPS

## Einmalig: Android-Projekt anlegen

```bash
cd nemesis-cursor
npm install
npx cap add android
npx cap sync android
```

## Server-URL für die App

**Option A — Produktion (empfohlen für echte APK):**

```powershell
$env:CAP_SERVER_URL="https://dein-projekt.vercel.app"
npx cap sync android
```

**Option B — Entwicklung im LAN:**

1. Next mit Bind an alle Interfaces: `npm run dev -- -H 0.0.0.0 -p 3000`
2. PC-LAN-IP ermitteln (z. B. `192.168.1.40`)
3. `CAP_SERVER_URL=http://192.168.1.40:3000` setzen und `npx cap sync android`  
   (HTTP erfordert `cleartext` — ist in `capacitor.config.ts` bei `http://` aktiv.)

## APK bauen

1. `npx cap open android` (öffnet Android Studio mit Ordner `android/`)
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
   Ausgabe z. B. unter `android/app/build/outputs/apk/`

## Einfacher Download ohne lokalen Build (GitHub Actions)

Wenn lokaler TLS/Proxy Probleme macht, nutze den Cloud-Build:

1. Auf GitHub ins Repo → **Actions** → **Build Android APK**
2. Workflow starten (**Run workflow**)
3. Nach Erfolg Artifact **`nemesis-debug-apk`** herunterladen
4. Enthaltene Datei: `app-debug.apk` (direkt installierbar für Tests)

## Verteilungsfertige Release-APK per GitHub Actions (signiert)

Du hast jetzt den Workflow **`Build Signed Release APK`**.

### 1) GitHub Secrets setzen (einmalig)

Im Repo: **Settings → Secrets and variables → Actions → New repository secret**

- `ANDROID_KEYSTORE_BASE64`  
  Inhalt: Base64 deines `release.jks`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Keystore in Base64 erzeugen (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("nemesis-release.jks")) | Set-Clipboard
```

Dann den Clipboard-Inhalt als `ANDROID_KEYSTORE_BASE64` einfügen.

### 2) Release-Build starten

1. GitHub → **Actions** → **Build Signed Release APK**
2. **Run workflow**
3. Bei `cap_server_url` deine produktive URL eintragen (z. B. `https://dein-projekt.vercel.app`)

### 3) APK herunterladen

Nach erfolgreichem Run:
- Artifact **`nemesis-release-apk`** herunterladen
- Enthält: **`app-release.apk`** (signiert, verteilungsfertig)

## Release-APK (signiert, für Download)

### 1) Keystore erstellen (einmalig)

```powershell
keytool -genkeypair -v -keystore nemesis-release.jks -alias nemesis -keyalg RSA -keysize 2048 -validity 10000
```

Datei danach sicher aufbewahren (Backups!).

### 2) Gradle Signing in Android Studio

- Android Studio: **Build → Generate Signed Bundle / APK**
- **APK** wählen
- Keystore `nemesis-release.jks` + Alias/Passwort eintragen
- Build Type: `release`

Ergebnis liegt typischerweise unter:
`android/app/build/outputs/apk/release/app-release.apk`

### 3) APK als Download bereitstellen

- Option A: GitHub Release (Datei hochladen)
- Option B: eigener Download-Link (HTTPS)
- Option C: Play Console (langfristig empfohlen)

> Tipp: Für private Tests reicht ein direkter HTTPS-Download-Link der `app-release.apk`.

## Hinweise

- Ohne `CAP_SERVER_URL` zeigt die WebView nur den Platzhalter unter `www/`.
- Push / Play Store: später ggf. **signing config** in Android Studio setzen.
- Gleiche Origin: Cookies/LocalStorage gelten pro geladener URL (wie im Browser).
- Für Produktions-User immer **Release-APK** statt Debug-APK verteilen.
