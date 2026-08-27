import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { star, starHalf, starOutline } from 'ionicons/icons';

/** Reusable 5-star rating, doubling as both an interactive picker (writing/
 * editing a review) and a read-only display (a single review's rating, or an
 * event's/organizer's average) - the same component covers every place a
 * star rating shows up in the app, rather than a bespoke widget per screen. */
@Component({
  selector: 'app-star-rating',
  standalone: true,
  templateUrl: './star-rating.component.html',
  styleUrl: './star-rating.component.scss',
  imports: [IonIcon, TranslatePipe],
})
export class StarRatingComponent {
  /** 0-5. Whole numbers for an interactive pick; decimals (e.g. 4.6) are
   * expected for a read-only average, rendered with half-star precision. */
  @Input({ required: true }) value!: number;
  @Input() readonly = true;
  @Input() size: 'small' | 'medium' = 'medium';
  @Output() readonly valueChange = new EventEmitter<number>();

  readonly positions = [1, 2, 3, 4, 5];

  constructor() {
    addIcons({ star, starHalf, starOutline });
  }

  iconFor(position: number): string {
    if (this.value >= position) {
      return 'star';
    }
    if (this.value >= position - 0.5) {
      return 'star-half';
    }
    return 'star-outline';
  }

  select(position: number): void {
    this.valueChange.emit(position);
  }
}
