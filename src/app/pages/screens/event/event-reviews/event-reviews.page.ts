import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { starOutline } from 'ionicons/icons';
import { AuthService } from '../../../../services/core/auth.service';
import { EventService } from '../../../../services/event/event.service';
import { AttendanceService } from '../../../../services/attendance/attendance.service';
import { EventManagerService } from '../../../../services/event-managers/event-manager.service';
import { ReviewService } from '../../../../services/review/review.service';
import { EventManager, EventWithCreatorName, MyReview, Review } from '../../../../models';
import { canManageEvent } from '../../../../shared/event/event-manager-permissions';
import { StarRatingComponent } from '../../../../shared/review/star-rating/star-rating.component';
import { ReviewCardComponent } from '../../../../shared/review/review-card/review-card.component';
import { ReviewFormComponent } from '../../../../shared/review/review-form/review-form.component';

/** Full-screen reviews list for one event, reached from event-detail's
 * header star icon - same "own routed page, not an in-place panel" pattern
 * as /attendees (own eventId query param, own back button), rather than
 * swapping event-detail's own detailViewMode. Owns the whole reviews
 * lifecycle (load/write/delete/reply) independently, since a routed page is
 * a fresh component instance with no access to event-detail's state. */
@Component({
  selector: 'app-event-reviews',
  standalone: true,
  templateUrl: 'event-reviews.page.html',
  styleUrls: ['event-reviews.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner,
    TranslatePipe,
    StarRatingComponent,
    ReviewCardComponent,
    ReviewFormComponent,
  ],
})
export class EventReviewsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly eventService = inject(EventService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly eventManagerService = inject(EventManagerService);
  private readonly reviewService = inject(ReviewService);
  private readonly toastController = inject(ToastController);
  private readonly translate = inject(TranslateService);

  private readonly eventId = this.route.snapshot.queryParamMap.get('eventId');

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly event = signal<EventWithCreatorName | null>(null);
  readonly participants = signal<EventManager[]>([]);
  readonly isAttending = signal(false);
  readonly reviews = signal<Review[]>([]);
  readonly myReview = signal<MyReview | null>(null);
  readonly reviewFormOpen = signal(false);

  readonly canManage = computed(() => canManageEvent(this.event(), this.participants(), this.authService.currentUser()?.id));

  readonly averageRating = computed(() => {
    const reviews = this.reviews();
    if (!reviews.length) {
      return 0;
    }
    return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  });

  /** Same rule as ReviewService.createOrUpdateReview on the backend - a real
   * attendee of a finished event, never the creator or an accepted
   * co-organizer (canManage already covers both). */
  readonly canWriteReview = computed(() => {
    const event = this.event();
    const me = this.authService.currentUser();
    if (!event || !me || this.canManage()) {
      return false;
    }
    return this.isAttending() && event.status === 'finished';
  });

  constructor() {
    addIcons({ starOutline });

    if (!this.eventId) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }
    const eventId = this.eventId;
    this.eventService.getById(eventId).subscribe({
      next: (event) => {
        this.event.set(event);
        this.notFound.set(!event);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
    this.eventManagerService.getParticipants(eventId).subscribe({
      next: (participants) => this.participants.set(participants),
      error: () => this.participants.set([]),
    });
    const me = this.authService.currentUser();
    if (me) {
      this.attendanceService.isAttending(me.id, eventId).subscribe({
        next: (attending) => this.isAttending.set(attending),
        error: () => this.isAttending.set(false),
      });
    }
    this.refreshReviews(eventId);
  }

  isMyReview(review: Review): boolean {
    return review.authorUserId === this.authService.currentUser()?.id;
  }

  private refreshReviews(eventId: string): void {
    this.reviewService.getEventReviews(eventId).subscribe({
      next: (reviews) => this.reviews.set(reviews),
      error: () => this.reviews.set([]),
    });
    if (!this.authService.currentUser()) {
      this.myReview.set(null);
      return;
    }
    this.reviewService.getMyReview(eventId).subscribe({
      next: (review) => this.myReview.set(review),
      error: () => this.myReview.set(null),
    });
  }

  openReviewForm(): void {
    this.reviewFormOpen.set(true);
  }

  closeReviewForm(): void {
    this.reviewFormOpen.set(false);
  }

  submitReview(payload: { rating: number; comment?: string }): void {
    if (!this.eventId) {
      return;
    }
    this.reviewService.createOrUpdateReview(this.eventId, payload.rating, payload.comment).subscribe({
      next: (myReview) => {
        this.myReview.set(myReview);
        this.reviewFormOpen.set(false);
        this.refreshReviews(this.eventId!);
      },
      error: (err) => {
        console.error('[EventReviewsPage] submitReview failed:', err);
        void this.showActionErrorToast('reviews.submitError');
      },
    });
  }

  deleteMyReview(): void {
    const review = this.myReview();
    if (!this.eventId || !review) {
      return;
    }
    this.reviewService.deleteReview(this.eventId, review.id).subscribe({
      next: () => {
        this.myReview.set(null);
        this.refreshReviews(this.eventId!);
      },
      error: (err) => {
        console.error('[EventReviewsPage] deleteMyReview failed:', err);
        void this.showActionErrorToast('reviews.deleteError');
      },
    });
  }

  replyToReview(review: Review, text: string): void {
    if (!this.eventId) {
      return;
    }
    this.reviewService.replyToReview(this.eventId, review.id, text).subscribe({
      next: () => this.refreshReviews(this.eventId!),
      error: (err) => {
        console.error('[EventReviewsPage] replyToReview failed:', err);
        void this.showActionErrorToast('reviews.replyError');
      },
    });
  }

  deleteOrganizerReply(review: Review): void {
    if (!this.eventId) {
      return;
    }
    this.reviewService.deleteOrganizerReply(this.eventId, review.id).subscribe({
      next: () => this.refreshReviews(this.eventId!),
      error: (err) => {
        console.error('[EventReviewsPage] deleteOrganizerReply failed:', err);
        void this.showActionErrorToast('reviews.replyError');
      },
    });
  }

  private async showActionErrorToast(messageKey: string): Promise<void> {
    const toast = await this.toastController.create({
      message: this.translate.instant(messageKey),
      duration: 3000,
      position: 'bottom',
    });
    await toast.present();
  }
}
