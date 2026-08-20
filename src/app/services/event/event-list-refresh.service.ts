import { Injectable, signal } from '@angular/core';

/** Cross-page "an event was just created/deleted" signal. Explorer/Events/
 * Favorites/user-events each also refresh on their own ionViewWillEnter, but
 * that hook turned out not to reliably re-fire on the forward navigation
 * saveEdit() (in event-detail.page.ts) uses to return to the origin tab
 * after "Reutilizar evento"/"Crear evento" - Ionic's tab outlet only
 * guarantees it on an actual tab-bar switch or its own back-navigation, not a
 * plain router.navigateByUrl into an already-instantiated tab. Bumping this
 * signal gives every list page an Ionic-lifecycle-independent way to know it
 * should reload. */
@Injectable({ providedIn: 'root' })
export class EventListRefreshService {
  readonly version = signal(0);

  notifyChanged(): void {
    this.version.update((v) => v + 1);
  }
}
