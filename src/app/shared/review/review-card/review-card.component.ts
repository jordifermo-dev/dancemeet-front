import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonTextarea } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { createOutline, sendOutline, trashOutline } from 'ionicons/icons';
import { Review } from '../../../models';
import { LanguageService } from '../../../services/core/language.service';
import { formatDateTimeNumeric } from '../../calendar/event-date-format';
import { StarRatingComponent } from '../star-rating/star-rating.component';

/** One review, presentational - the host page (event-detail) owns loading
 * the list, deciding isMine/canReply per review, and what happens on each
 * output (edit opens the shared review-form, delete/reply/deleteReply call
 * ReviewService directly and refresh the list). Same avatar+name link
 * pattern as the xat's own chat-avatar/chat-sender-name, and the same
 * reply-quote visual language as .chat-reply-quote, reused here for the
 * organizer's reply instead of duplicating either. */
@Component({
  selector: 'app-review-card',
  standalone: true,
  templateUrl: './review-card.component.html',
  styleUrl: './review-card.component.scss',
  imports: [IonButton, IonIcon, IonTextarea, RouterLink, TranslatePipe, StarRatingComponent],
})
export class ReviewCardComponent {
  @Input({ required: true }) review!: Review;
  @Input() isMine = false;
  @Input() canReply = false;
  @Output() readonly editReview = new EventEmitter<void>();
  @Output() readonly deleteReview = new EventEmitter<void>();
  @Output() readonly reply = new EventEmitter<string>();
  @Output() readonly deleteReply = new EventEmitter<void>();

  private readonly languageService = inject(LanguageService);

  readonly replying = signal(false);
  readonly replyDraft = signal('');

  constructor() {
    addIcons({ createOutline, trashOutline, sendOutline });
  }

  dateLabel(timestamp: number): string {
    return formatDateTimeNumeric(timestamp, this.languageService.currentLang());
  }

  startReply(): void {
    this.replyDraft.set(this.review.organizerReply?.text ?? '');
    this.replying.set(true);
  }

  cancelReply(): void {
    this.replying.set(false);
  }

  submitReply(): void {
    const text = this.replyDraft().trim();
    if (!text) {
      return;
    }
    this.reply.emit(text);
    this.replying.set(false);
  }
}
