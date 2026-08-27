import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { IonButton, IonModal, IonTextarea } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { MyReview } from '../../../models';
import { FilterActionsRowComponent } from '../../filters/filter-actions-row/filter-actions-row.component';
import { FilterSheetHeaderComponent } from '../../filters/filter-sheet-header/filter-sheet-header.component';
import { StarRatingComponent } from '../star-rating/star-rating.component';

/** Writing a new review and editing an existing one are the same form - the
 * host page (event-detail) just passes the existing review (or null) as
 * `existingReview`, same idea as the xat's own startEditMessage reusing the
 * compose input instead of a separate edit form. */
@Component({
  selector: 'app-review-form',
  standalone: true,
  templateUrl: './review-form.component.html',
  styleUrl: './review-form.component.scss',
  imports: [IonModal, IonButton, IonTextarea, TranslatePipe, StarRatingComponent, FilterSheetHeaderComponent, FilterActionsRowComponent],
})
export class ReviewFormComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() existingReview: MyReview | null = null;
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly submitted = new EventEmitter<{ rating: number; comment?: string }>();

  readonly rating = signal(0);
  readonly comment = signal('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.rating.set(this.existingReview?.rating ?? 0);
      this.comment.set(this.existingReview?.comment ?? '');
    }
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    if (this.rating() < 1) {
      return;
    }
    this.submitted.emit({ rating: this.rating(), comment: this.comment().trim() || undefined });
  }
}
