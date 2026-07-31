import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { calendarOutline, locationOutline } from 'ionicons/icons';
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

  constructor() {
    addIcons({ calendarOutline, locationOutline });
  }
}
