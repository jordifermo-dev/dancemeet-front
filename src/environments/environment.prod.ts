export const environment = {
  production: true,
  apiUrl: 'https://dancemeet-back.onrender.com',
  // The real public web address - used to build shareable links from the
  // native app, where window.location.href is only the internal WebView
  // origin (https://localhost) and useless to whoever receives the link.
  appUrl: 'https://dancemeet-front-8pvn.vercel.app',
  googleMapsApiKey: 'AIzaSyClI0mLNW9oKEK-JSlH7jAurHTjPJ3qpCU',
  googleMapsJsApiKey: 'AIzaSyANsIqi_q9JWvnlRlI_YxJA_WKwiuUnj0E',
  firebaseConfig: {
    apiKey: 'AIzaSyAV3oFnlZLgaJgi465MVe355ARcvfFpOkU',
    authDomain: 'dancemeet-f46f2.firebaseapp.com',
    projectId: 'dancemeet-f46f2',
    storageBucket: 'dancemeet-f46f2.firebasestorage.app',
    messagingSenderId: '92761252465',
    appId: '1:92761252465:web:28c9c53ef15d95288171d0',
  },
  firebaseVapidKey: 'BFWqvZl3BJGryJZBPUTUbZEDSkxVmiiOVG0SDP1oE7Qg_Yfnd4m1T_FwbmBZQ3PjgMlReUIP_5KmHgsGrq3H_gY',
};
