import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android app: the same interface and tests as the desktop app, inside a WebView.
 * Native code (android/app/src/main/java/com/oltechx/check) reads the phone's hardware.
 */
const config: CapacitorConfig = {
  appId: "com.oltechx.check",
  appName: "OLTechX Check",
  webDir: "dist/renderer",
  android: {
    // Content stays clear of the status and navigation bars on Android 15 and newer.
    adjustMarginsForEdgeToEdge: "auto",
    backgroundColor: "#f2f1ec",
  },
  plugins: {
    // Requests to oltechx.com go through native HTTP: no CORS, the same as the desktop app.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
