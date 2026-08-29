import {
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
  AfterViewInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { createGesture, Gesture } from '@ionic/core';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { Discipline, EventType, EventWithCreatorName } from '../../../models';
import { AuthService } from '../../../services/core/auth.service';
import { LanguageService } from '../../../services/core/language.service';
import { EventCardComponent } from '../../event/event-card/event-card.component';
import { EventCardView } from '../../event/event-card/event-card.model';
import { buildEventCardView } from '../../event/event-card/build-event-card-view';
import { EventSortMode, sortEvents } from '../../event/event-sort';
import { CalendarDayCell, CalendarGranularity } from './event-calendar.model';
import { buildCalendarCells } from './build-calendar-cells';
import {
  addDays,
  addMonths,
  addWeeks,
  buildMonthGrid,
  buildWeekGrid,
  formatDayLabel,
  formatMonthYearLabel,
  formatWeekRangeLabel,
  startOfDay,
  startOfWeek,
  weekdayShortLabels,
} from './calendar-date-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Below this, a swipe reads as a tap/scroll jitter, not an intentional
 * page-turn - matches typical mobile swipe-navigation thresholds. */
const SWIPE_THRESHOLD_PX = 60;

/** Month/week/day calendar grid + selected-day agenda, shared by every
 * screen that lists events (Events tab, Favorites, user-events) as their
 * second way to browse the exact same (already filtered) event list.
 * Purely presentational over whatever `events` the host page has already
 * filtered; it only adds date-bucketing and navigation on top, and calls
 * buildEventCardView()/<app-event-card> itself for the day agenda so every
 * host page wires this up in one line instead of duplicating that rendering
 * three times.
 *
 * The Mes/Semana/Día granularity toggle is NOT rendered in here - it's the
 * separate <app-calendar-granularity-toggle>, which the host page places in
 * its own fixed top-overlay (alongside the search bar/filter pills) so it
 * stays genuinely fixed on screen. An earlier version rendered it as part of
 * this component's own scrollable content with a hand-rolled CSS
 * `position: sticky`, which fought the page's own scroll offset badly
 * enough that the grid visibly scrolled through/behind it instead of
 * staying pinned - Ionic's real `slot="fixed"` mechanism (already proven
 * everywhere else in the app) doesn't have that problem. */
@Component({
  selector: 'app-event-calendar',
  standalone: true,
  templateUrl: './event-calendar.component.html',
  styleUrl: './event-calendar.component.scss',
  imports: [IonIcon, TranslatePipe, EventCardComponent],
})
export class EventCalendarComponent implements AfterViewInit, OnDestroy {
  private readonly languageService = inject(LanguageService);
  private readonly authService = inject(AuthService);

  readonly events = input<EventWithCreatorName[]>([]);
  readonly eventTypesById = input.required<Map<string, EventType>>();
  readonly disciplinesById = input.required<Map<string, Discipline>>();
  readonly likedEventIds = input<ReadonlySet<string>>(new Set());
  readonly attendedEventIds = input<ReadonlySet<string>>(new Set());
  /** = the host page's current "Ordenar" choice, so the day agenda orders
   * events the same way the list view does instead of always defaulting to
   * soonest-first regardless of what the user actually picked. */
  readonly sortMode = input<EventSortMode>('dateSoonest');
  /** = the host page's applied "Fecha" filter (Desde/Hasta), if any - the
   * calendar can't navigate past it (see the component's plan doc: the date
   * filter limits the calendar, not the other way round). */
  readonly minDate = input<number | null>(null);
  readonly maxDate = input<number | null>(null);
  /** Owned by the host page (via <app-calendar-granularity-toggle> in its
   * own fixed top-overlay, not by this component - see this component's
   * doc comment for why that toggle isn't rendered in here anymore). */
  readonly granularity = input.required<CalendarGranularity>();

  @Output() readonly likeToggle = new EventEmitter<string>();

  @ViewChild('swipeArea') private swipeAreaRef?: ElementRef<HTMLElement>;
  private gesture?: Gesture;

  readonly anchorDate = signal(startOfDay(Date.now()));
  readonly selectedDate = signal<number | null>(startOfDay(Date.now()));

  readonly weekdayLabels = computed(() => weekdayShortLabels(this.languageService.currentLang()));

  readonly periodLabel = computed(() => {
    const lang = this.languageService.currentLang();
    const anchor = this.anchorDate();
    switch (this.granularity()) {
      case 'month':
        return formatMonthYearLabel(anchor, lang);
      case 'week':
        return formatWeekRangeLabel(startOfWeek(anchor), lang);
      case 'day':
        return formatDayLabel(anchor, lang);
    }
  });

  readonly gridCells = computed<CalendarDayCell[]>(() => {
    const granularity = this.granularity();
    if (granularity === 'day') {
      return [];
    }
    const anchor = this.anchorDate();
    const dates = granularity === 'month' ? buildMonthGrid(anchor) : buildWeekGrid(anchor);
    return buildCalendarCells(dates, this.events(), this.eventTypesById(), {
      selectedDate: this.selectedDate(),
      periodAnchor: granularity === 'month' ? anchor : null,
      minDate: this.minDate(),
      maxDate: this.maxDate(),
    });
  });

  /** In day granularity there's no grid to tap a cell in - the single
   * visible day IS the selection, driven by the anchor itself. */
  readonly effectiveSelectedDate = computed(() => (this.granularity() === 'day' ? this.anchorDate() : this.selectedDate()));

  readonly agendaCardViews = computed<EventCardView[]>(() => {
    const selected = this.effectiveSelectedDate();
    if (selected === null) {
      return [];
    }
    const dayStart = startOfDay(selected);
    const dayEnd = dayStart + DAY_MS - 1;
    const disciplinesById = this.disciplinesById();
    const eventTypesById = this.eventTypesById();
    const lang = this.languageService.currentLang();
    const currentUserId = this.authService.currentUser()?.id;
    const likedEventIds = this.likedEventIds();
    const attendedEventIds = this.attendedEventIds();
    const dayEvents = this.events().filter((event) => event.eventDateFrom <= dayEnd && event.eventDateTo >= dayStart);
    return sortEvents(dayEvents, this.sortMode()).map((event) =>
      buildEventCardView(event, disciplinesById, eventTypesById, lang, currentUserId, likedEventIds, attendedEventIds),
    );
  });

  readonly canGoPrev = computed(() => this.clampToRange(this.targetAnchor(-1)) < this.anchorDate());
  readonly canGoNext = computed(() => this.clampToRange(this.targetAnchor(1)) > this.anchorDate());

  constructor() {
    addIcons({ chevronBackOutline, chevronForwardOutline });

    // Re-clamp whenever the host page's date filter changes (e.g. the user
    // narrows "Fecha" while the calendar is open) so the visible period/
    // selection can never sit outside what's actually allowed anymore.
    effect(() => {
      this.minDate();
      this.maxDate();
      untracked(() => {
        const clampedAnchor = this.clampToRange(this.anchorDate());
        if (clampedAnchor !== this.anchorDate()) {
          this.anchorDate.set(clampedAnchor);
        }
        const selected = this.selectedDate();
        if (selected !== null) {
          const clampedSelected = this.clampToRange(selected);
          if (clampedSelected !== selected) {
            this.selectedDate.set(clampedSelected);
          }
        }
      });
    });
  }

  ngAfterViewInit(): void {
    const el = this.swipeAreaRef?.nativeElement;
    if (!el) {
      return;
    }
    this.gesture = createGesture({
      el,
      gestureName: 'event-calendar-swipe',
      threshold: 10,
      onEnd: (detail) => {
        if (Math.abs(detail.deltaX) < SWIPE_THRESHOLD_PX || Math.abs(detail.deltaY) > Math.abs(detail.deltaX)) {
          return;
        }
        if (detail.deltaX < 0) {
          this.goNext();
        } else {
          this.goPrev();
        }
      },
    });
    this.gesture.enable(true);
  }

  ngOnDestroy(): void {
    this.gesture?.destroy();
  }

  selectDay(cell: CalendarDayCell): void {
    if (cell.isOutOfRange) {
      return;
    }
    this.selectedDate.set(cell.date);
    // Also moves the anchor, not just the selection, so switching
    // granularity right after (e.g. month -> week) opens on the week/day
    // that was actually tapped instead of wherever the anchor last was.
    this.anchorDate.set(cell.date);
  }

  goPrev(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.moveAnchor(this.clampToRange(this.targetAnchor(-1)));
  }

  goNext(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.moveAnchor(this.clampToRange(this.targetAnchor(1)));
  }

  /** Navigating away from the period a tapped day belongs to leaves that
   * day's agenda list showing underneath a grid that's moved on - clearing
   * the selection instead hides the list until a day in the newly-visible
   * period gets tapped, same as most calendar apps. Day granularity has no
   * separate selection to invalidate (effectiveSelectedDate reads the anchor
   * directly there), so this only ever matters for month/week. */
  private moveAnchor(nextAnchor: number): void {
    this.anchorDate.set(nextAnchor);
    if (!this.isSelectedDateInPeriod(nextAnchor)) {
      this.selectedDate.set(null);
    }
  }

  private isSelectedDateInPeriod(anchor: number): boolean {
    const selected = this.selectedDate();
    if (selected === null) {
      return true;
    }
    switch (this.granularity()) {
      case 'month': {
        const a = new Date(anchor);
        const s = new Date(selected);
        return a.getFullYear() === s.getFullYear() && a.getMonth() === s.getMonth();
      }
      case 'week':
        return buildWeekGrid(anchor).includes(selected);
      case 'day':
        return true;
    }
  }

  onLikeToggle(eventId: string): void {
    this.likeToggle.emit(eventId);
  }

  private targetAnchor(direction: 1 | -1): number {
    switch (this.granularity()) {
      case 'month':
        return addMonths(this.anchorDate(), direction);
      case 'week':
        return addWeeks(this.anchorDate(), direction);
      case 'day':
        return addDays(this.anchorDate(), direction);
    }
  }

  private clampToRange(date: number): number {
    const min = this.minDate();
    const max = this.maxDate();
    let result = date;
    if (min !== null) {
      result = Math.max(result, startOfDay(min));
    }
    if (max !== null) {
      result = Math.min(result, startOfDay(max));
    }
    return result;
  }
}
