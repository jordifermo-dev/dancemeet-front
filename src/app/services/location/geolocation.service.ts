import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface CurrentPositionResult {
  latitude: number;
  longitude: number;
}

/** Wraps "get the device's current GPS position" behind one call, used by
 * every "Utilitza la meva ubicació" entry point (register, profile,
 * event-detail's edit-location, the Explorer/Favorites/user-events location
 * filter). A plain navigator.geolocation.getCurrentPosition() - what every
 * one of those used to call directly - never actually triggers Android's
 * runtime location-permission prompt from inside a Capacitor WebView (there
 * was no ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION even declared in
 * AndroidManifest.xml), so it silently failed on every native install; only
 * the web build's own browser chrome ever prompted for it. @capacitor/geolocation
 * is the plugin that actually asks the OS for that permission on native. */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  /** Reused while a native request is still in flight - tapping "use my
   * location" again (the map's own floating button, or the filter sheet's
   * text button, they both land here) before the previous call has settled
   * used to fire a second concurrent native getCurrentPosition() call; on at
   * least one device (a Moto G) that left the *second* call hanging forever
   * instead of erroring or resolving, with no way for its own caller to know
   * anything had gone wrong. Returning the same promise makes every
   * "pressed again too soon" tap just ride along with the request already
   * running instead of starting a new one. */
  private inFlightNative: Promise<CurrentPositionResult> | null = null;

  async getCurrentPosition(): Promise<CurrentPositionResult> {
    if (Capacitor.isNativePlatform()) {
      if (!this.inFlightNative) {
        this.inFlightNative = this.getCurrentPositionNative().finally(() => {
          this.inFlightNative = null;
        });
      }
      return this.inFlightNative;
    }
    return this.getCurrentPositionWeb();
  }

  private async getCurrentPositionNative(): Promise<CurrentPositionResult> {
    let status = await Geolocation.checkPermissions();
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      status = await Geolocation.requestPermissions();
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      throw new Error('geolocation-permission-denied');
    }
    // Low accuracy (network/fused, not GPS) first - every caller only needs
    // "which city/area", not turn-by-turn precision, and it's usually much
    // faster than a cold GPS fix. But confirmed live on a Xiaomi (5
    // consecutive OS-PLUG-GLOC-0010 timeouts, logcat) that low accuracy can
    // fail outright wherever the network/fused provider can't resolve
    // anything within the timeout, even though a real GPS fix (high
    // accuracy) was reliably succeeding on the exact same device moments
    // earlier - so a failed low-accuracy attempt retries once with high
    // accuracy instead of giving up. maximumAge lets a request made moments
    // after a previous one reuse that still-fresh fix instead of kicking off
    // another acquisition (the actual trigger for a hang seen separately on
    // a Moto G - back-to-back cold requests); timeout is set explicitly
    // (rather than trusting the plugin's own 10s default) so a request that
    // genuinely can't get a fix fails the promise instead of leaving the
    // caller's "locating..." state stuck indefinitely.
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000, maximumAge: 5000 });
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 });
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    }
  }

  private getCurrentPositionWeb(): Promise<CurrentPositionResult> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('geolocation-not-supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => reject(new Error('geolocation-failed')),
      );
    });
  }
}
