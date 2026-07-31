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
    apiKey: 'AIzaSyCenByLDKEOul_3dHvW2ArCRvnkFYXTMbs',
    authDomain: 'dancemeet-f46f2.firebaseapp.com',
    projectId: 'dancemeet-f46f2',
    storageBucket: 'dancemeet-f46f2.firebasestorage.app',
    messagingSenderId: '92761252465',
    // TODO: replace with the Web app's own appId - see chat for why the
    // Android one from google-services.json can't be reused here.
    appId: 'your-web-app-id',
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
