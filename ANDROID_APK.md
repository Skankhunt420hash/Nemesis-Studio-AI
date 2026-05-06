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

## Hinweise

- Ohne `CAP_SERVER_URL` zeigt die WebView nur den Platzhalter unter `www/`.
- Push / Play Store: später ggf. **signing config** in Android Studio setzen.
- Gleiche Origin: Cookies/LocalStorage gelten pro geladener URL (wie im Browser).
