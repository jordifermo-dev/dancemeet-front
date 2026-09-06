import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { IonButton, IonIcon, IonPopover } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  ellipsisVerticalOutline,
  listOutline,
  calendarOutline,
  imagesOutline,
  addCircleOutline,
  mapOutline,
  refreshOutline,
} from 'ionicons/icons';

export type EventListViewMode = 'map' | 'list' | 'calendar' | 'gallery';

/** Replaces the list/calendar/gallery(/crear evento) row of separate toolbar
 * icons - which kept growing as new view modes were added - with a single
 * "⋮" trigger and a dropdown of the same options, reused by Events,
 * Favorites and (list/calendar/gallery only, no create-event) user-events. */
@Component({
  selector: 'app-view-mode-menu',
  standalone: true,
  templateUrl: './view-mode-menu.component.html',
  styleUrl: './view-mode-menu.component.scss',
  imports: [IonButton, IonIcon, IonPopover, TranslatePipe],
})
export class ViewModeMenuComponent {
  @Input({ required: true }) viewMode!: EventListViewMode;
  @Input() showCreateEvent = false;
  /** Only the merged Explorer tab passes this - Favoritos/Mis Events reuse
   * this same component for list/calendar/gallery but have no map of their
   * own to switch to. */
  @Input() showMap = false;
  /** Only Explorer passes this - resets discipline/eventType/status/date to
   * the profile's saved defaults (same ExplorerFiltersService.resetAll() the
   * "Filtrar todo" screen already uses, and the same "price/location have
   * their own separate reset" convention it follows) without the user
   * having to open each pill individually. */
  @Input() showResetFilters = false;
  @Output() readonly viewModeChange = new EventEmitter<EventListViewMode>();
  @Output() readonly createEvent = new EventEmitter<void>();
  @Output() readonly resetFilters = new EventEmitter<void>();

  readonly isOpen = signal(false);
  /** Ionic tab pages stay alive off-screen (IonicRouteStrategy), so several
   * instances of this component can exist in the DOM at once - an
   * id-matched `trigger` would then risk binding to another page's button.
   * Positioning the popover off the click event itself sidesteps that. */
  readonly popoverEvent = signal<Event | undefined>(undefined);

  constructor() {
    addIcons({ ellipsisVerticalOutline, listOutline, calendarOutline, imagesOutline, addCircleOutline, mapOutline, refreshOutline });
  }

  openMenu(event: Event): void {
    this.popoverEvent.set(event);
    this.isOpen.set(true);
  }

  select(mode: EventListViewMode): void {
    this.viewModeChange.emit(mode);
    this.isOpen.set(false);
  }

  onCreateEvent(): void {
    this.createEvent.emit();
    this.isOpen.set(false);
  }

  onResetFilters(): void {
    this.resetFilters.emit();
    this.isOpen.set(false);
  }
}
