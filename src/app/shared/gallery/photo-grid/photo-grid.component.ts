import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { imagesOutline, imageOutline } from 'ionicons/icons';

export interface PhotoGridItem {
  id: string;
  photoUrl: string;
  /** Only meaningful for the "browse events by photo" mode (Events/
   * Favorites/user-events) - undefined everywhere else (a user's own
   * gallery, an event's own gallery), where every cell is always exactly
   * one real photo and no badge makes sense. When set: 0 means this cell is
   * falling back to the event's own cover image because nobody has shared a
   * photo there yet, 1 means a single real shared photo, >1 shows a "several
   * photos" hint (see .photo-badge in the template). */
  photoCount?: number;
}

/** Pure/presentational Instagram-style photo grid, reused for a user's own
 * gallery, an event's own gallery, and the "browse events by photo" mode on
 * the Events/Favorites/user-events lists - it has no idea what a tap should
 * do (open a lightbox vs. navigate straight to an event), that's entirely
 * up to whatever page consumes (photoTap). */
@Component({
  selector: 'app-photo-grid',
  standalone: true,
  templateUrl: './photo-grid.component.html',
  styleUrl: './photo-grid.component.scss',
  imports: [TranslatePipe, IonIcon],
})
export class PhotoGridComponent {
  @Input({ required: true }) photos!: PhotoGridItem[];
  @Input() columns = 3;
  @Input() emptyStateKey?: string;
  @Output() readonly photoTap = new EventEmitter<string>();

  constructor() {
    addIcons({ imagesOutline, imageOutline });
  }

  onTap(id: string): void {
    this.photoTap.emit(id);
  }
}
