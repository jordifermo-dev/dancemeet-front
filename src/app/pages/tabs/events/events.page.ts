import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { NotificationBellComponent } from '../../../shared/notifications/notification-bell/notification-bell.component';

/** Placeholder for the Events tab, freed up by merging its old list/
 * calendar/gallery content into Explorer (now mapa/lista/calendario/fotos
 * in one tab, see explorer.page.ts) - this tab is reserved for the Chats
 * feature (1:1 + accesos a xats privados de event), not built yet. See
 * 14_chat-directo-1a1-y-fusion-tabs.md. Deliberately inert in the meantime -
 * no filters, no data, just a neutral image. */
@Component({
  selector: 'app-events',
  standalone: true,
  templateUrl: 'events.page.html',
  styleUrls: ['events.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, TranslatePipe, NotificationBellComponent],
})
export class EventsPage {}
