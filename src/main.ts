import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { authInterceptor } from './app/interceptors/auth.interceptor';
import { DEFAULT_LANGUAGE, detectInitialLanguage } from './app/services/core/language.service';

// Registers <pwa-camera-modal> so Capacitor's web Camera plugin can open a
// real getUserMedia-based webcam view for CameraSource.Camera. Without this,
// it silently falls back to a plain file input (looks/behaves like the
// gallery picker) - see @capacitor/camera's web.js cameraExperience().
defineCustomElements(window);

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideTranslateService({ lang: detectInitialLanguage(), fallbackLang: DEFAULT_LANGUAGE }),
    provideTranslateHttpLoader({ prefix: '/assets/i18n/', suffix: '.json' }),
    // Only for the real PWA (browser) build - the native Capacitor app already
    // gets fresh code on every `cap sync`, so a service worker caching its
    // bundle would just risk showing stale JS after an update instead of
    // helping anything.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !Capacitor.isNativePlatform(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
});
