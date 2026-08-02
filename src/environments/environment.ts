// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  // Maps Embed API key (console.cloud.google.com > APIs & Services > Credentials).
  googleMapsApiKey: 'AIzaSyClI0mLNW9oKEK-JSlH7jAurHTjPJ3qpCU',
  // Maps JavaScript API key, for the interactive multi-marker Explorer map -
  // separate from the Embed key above (different API/product). Fill in once
  // created in Google Cloud Console.
  googleMapsJsApiKey: 'AIzaSyANsIqi_q9JWvnlRlI_YxJA_WKwiuUnj0E',
  // From Firebase Console > Project settings > General > Your apps > Web app.
  firebaseConfig: {
    apiKey: 'AIzaSyAV3oFnlZLgaJgi465MVe355ARcvfFpOkU',
    authDomain: 'dancemeet-f46f2.firebaseapp.com',
    projectId: 'dancemeet-f46f2',
    storageBucket: 'dancemeet-f46f2.firebasestorage.app',
    messagingSenderId: '92761252465',
    appId: '1:92761252465:web:28c9c53ef15d95288171d0',
  },
  // Firebase Console > Project settings > Cloud Messaging > Web configuration
  // > Web Push certificates > generate a key pair. Required for FCM to issue
  // a device token for web push - notify() still works without it (the
  // in-app inbox), only the OS-level push send is skipped until this is set.
  firebaseVapidKey: 'BFWqvZl3BJGryJZBPUTUbZEDSkxVmiiOVG0SDP1oE7Qg_Yfnd4m1T_FwbmBZQ3PjgMlReUIP_5KmHgsGrq3H_gY',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
