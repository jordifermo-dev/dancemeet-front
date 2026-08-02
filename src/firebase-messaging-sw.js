// Firebase Cloud Messaging background handler - must live at the site root
// (not under /assets) because FCM's service worker registration defaults to
// scope "/". Plain JS, not part of the Angular build pipeline, so the
// Firebase config below is duplicated from src/environments/environment.ts
// rather than imported - keep the two in sync if the project's Firebase
// config ever changes.
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAV3oFnlZLgaJgi465MVe355ARcvfFpOkU',
  authDomain: 'dancemeet-f46f2.firebaseapp.com',
  projectId: 'dancemeet-f46f2',
  storageBucket: 'dancemeet-f46f2.firebasestorage.app',
  messagingSenderId: '92761252465',
  appId: '1:92761252465:web:28c9c53ef15d95288171d0',
});

const messaging = firebase.messaging();

// Only needed for background/closed-tab notifications - a foreground push
// is handled instead by onMessage() in notification.service.ts, so the app
// can show it as an in-app toast instead of a duplicate OS notification.
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  if (!title) {
    return;
  }
  self.registration.showNotification(title, {
    body,
    icon: 'assets/icons/tabs/dancemeet-wallpaper.svg',
    data: payload.data,
  });
});
