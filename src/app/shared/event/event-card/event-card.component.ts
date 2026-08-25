import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { calendarOutline, locationOutline, heart, heartOutline } from 'ionicons/icons';
import { EventCardView } from './event-card.model';

/** Summary card for an event: image on the left, details on the right
 * (creator, title, type/discipline/status tags, date range, address) -
 * shared by every screen that lists events (Favorites, user-events). */
@Component({
  selector: 'app-event-card',
  standalone: true,
  templateUrl: './event-card.component.html',
  styleUrl: './event-card.component.scss',
  imports: [IonIcon, TranslatePipe, RouterLink],
})
export class EventCardComponent {
  @Input({ required: true }) view!: EventCardView;
  /** URL of the list/tab this card is rendered on, forwarded as a query param
   * on the link to event-detail so "Reutilizar evento"/"Crear evento" can
   * later navigate straight back here on save instead of landing on the new
   * event's own detail page - see event-detail.page.ts's originUrl. */
  @Input() origin?: string;
  /** The card itself stays a pure, presentational component with no service
   * dependencies of its own (see event-card.model.ts) - the page decides what
   * liking/unliking actually does (call FavoriteService, update its
   * list/signals). */
  @Output() readonly likeToggle = new EventEmitter<string>();

  constructor() {
    addIcons({ calendarOutline, locationOutline, heart, heartOutline });
  }

  onLikeToggle(event: Event): void {
    event.stopPropagation();
    if (this.view.isOwnEvent || this.view.status === 'finished' || this.view.status === 'cancelled') {
      return;
    }
    this.likeToggle.emit(this.view.id);
  }
}
