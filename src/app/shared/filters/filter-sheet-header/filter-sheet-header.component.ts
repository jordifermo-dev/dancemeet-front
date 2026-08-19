import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

/** Title + close (X) button pair at the top of every filter/sort bottom
 * sheet in the app - font-size/weight/spacing defined once here instead of
 * copy-pasted per page, which is what let them drift out of sync (see the
 * "Filtros" title vs section-title size mismatch between Explorer/Events and
 * Favorites/User-events/Notifications). */
@Component({
  selector: 'app-filter-sheet-header',
  standalone: true,
  templateUrl: './filter-sheet-header.component.html',
  styleUrl: './filter-sheet-header.component.scss',
  imports: [IonIcon, TranslatePipe],
})
export class FilterSheetHeaderComponent {
  @Input({ required: true }) titleKey!: string;
  @Output() readonly closed = new EventEmitter<void>();

  constructor() {
    addIcons({ closeOutline });
  }
}
