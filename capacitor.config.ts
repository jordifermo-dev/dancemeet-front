/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dancemeet.app',
  appName: 'DanceMeet',
  webDir: 'www',
  android: {
    // Capacitor only turns this on for debug builds by default - this app is
    // only ever distributed as a signed release (via Firebase App
    // Distribution to a fixed, known tester list), so without this override
    // there'd be no way to attach chrome://inspect and see real console/
    // network errors from a release install.
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    FirebaseAuthentication: {
      // Only do the native Google account picker natively - AuthService still
      // signs into the Firebase JS SDK itself (signInWithCredential) so the
      // rest of the app (onAuthStateChanged, firebaseAuth.currentUser for
      // getIdToken()) keeps working exactly as it does on web, unmodified.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
