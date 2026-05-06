import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android-APK (Capacitor) — lädt deine **bereits laufende** Nemesis-Instanz.
 *
 * Next.js braucht einen Server (API-Routen). Die APK ist eine native Hülle um eine WebView.
 *
 * 1. **Produktion:** App deployen (z. B. Vercel), dann:
 *    `set CAP_SERVER_URL=https://deine-domain.vercel.app` (Windows PowerShell: `$env:CAP_SERVER_URL="..."`)
 *    `npx cap sync android`
 * 2. **Lokal im LAN:** PC-IP ermitteln, Next `npm run dev -- -H 0.0.0.0`, dann:
 *    `CAP_SERVER_URL=http://192.168.x.x:3000` und in `android/app/src/main/AndroidManifest.xml`
 *    ist `usesCleartextTraffic` für HTTP nötig (Capacitor setzt das bei cleartext).
 *
 * Build APK: Android Studio → `android` öffnen → Build → Build Bundle(s) / APK(s).
 */
const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.nemesis.studio",
  appName: "Nemesis Studio",
  webDir: "www",
  android: {
    allowMixedContent: true,
  },
};

if (serverUrl) {
  config.server = {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    androidScheme: serverUrl.startsWith("https") ? "https" : "http",
  };
}

export default config;
