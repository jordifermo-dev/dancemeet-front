/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dancemeet.app',
  appName: 'DanceMeet',
  webDir: 'www',
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
