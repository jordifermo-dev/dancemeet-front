import { Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { addOutline, removeOutline } from 'ionicons/icons';
import { RecurrenceFrequency, RecurrenceRule } from '../../models';
import { LanguageService } from '../../services/language.service';
import { DatePickerFieldComponent } from '../date-picker-field/date-picker-field.component';
import { WeekdayPickerComponent } from '../weekday-picker/weekday-picker.component';
import { weekdayShortLabels } from '../event-calendar/calendar-date-utils';
import { countRecurrenceOccurrences, MAX_SERIES_OCCURRENCES } from '../recurrence';
import { formatEventDateOnly } from '../event-date-format';

const DAY_MS = 24 * 60 * 60 * 1000;
const NTH_OPTIONS = [1, 2, 3, 4];
const NTH_LABEL_KEYS: Record<number, string> = {
  1: 'eventDetail.nth1',
  2: 'eventDetail.nth2',
  3: 'eventDetail.nth3',
  4: 'eventDetail.nth4',
};

function startOfDayFromIso(iso: string): number {
  const parsed = new Date(iso);
  return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()).getTime();
}

function endOfDayFromIso(iso: string): number {
  const parsed = new Date(iso);
  return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 23, 59, 59, 999).getTime();
}

/** Google Calendar's "Periodicidad personalizada" screen - interval+unit,
 * weekday chips (frequency='weekly') or a weekday+nth combination
 * (frequency='monthlyNthWeekday', e.g. "2nd and 4th Saturday" = weekdays
 * [Saturday] x nths [2,4], cross-multiplied into rule.nthWeekdays), a
 * "Hasta" date field with its own "sin límite" toggle, and a live preview
 * line + occurrence count. Simplified vs. the real Google Calendar: no
 * separate "Termina: Nunca/El día/Después de N" block - "Hasta" already
 * doubles as the end condition (see the plan's reasoning). */
@Component({
  selector: 'app-recurrence-editor',
  standalone: true,
  templateUrl: './recurrence-editor.component.html',
  styleUrl: './recurrence-editor.component.scss',
  imports: [IonIcon, TranslatePipe, DatePickerFieldComponent, WeekdayPickerComponent],
})
export class RecurrenceEditorComponent {
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  /** Monthly mode's weekday chips and nth chips used to be derived FROM
   * rule().nthWeekdays (their cross product) on every read - clearing either
   * dimension down to empty collapsed the cross product to [], which then
   * fed straight back into BOTH derived views going empty too, with no way
   * to recover either one independently (toggling a weekday chip back on
   * still cross-multiplied against an empty nths list, appearing
   * unresponsive). These two hold each dimension's own selection
   * independently - only rule().nthWeekdays itself is ever the cross
   * product, rebuilt whenever either one changes, never read back from. */
  private readonly monthlyWeekdaysState = signal<number[]>([]);
  private readonly monthlyNthsState = signal<number[]>([]);
  private monthlyStateInitialized = false;

  constructor() {
    addIcons({ addOutline, removeOutline });
    // Seeds once from whatever rule this editor opened with (e.g. Google
    // Calendar-style "Cada mes" default, or a previously-customized rule) -
    // intentionally not reactive to further rule() changes, since after this
    // the two signals above are this component's own source of truth for
    // the monthly chips.
    effect(() => {
      const r = this.rule();
      if (this.monthlyStateInitialized) {
        return;
      }
      this.monthlyStateInitialized = true;
      untracked(() => {
        const pairs = r.nthWeekdays ?? [];
        this.monthlyWeekdaysState.set([...new Set(pairs.map((p) => p.weekday))].sort((a, b) => a - b));
        this.monthlyNthsState.set([...new Set(pairs.map((p) => p.nth))].sort((a, b) => a - b));
      });
    });
  }

  readonly rule = model.required<RecurrenceRule>();

  readonly nthOptions = NTH_OPTIONS;

  readonly weeklyWeekdays = computed<number[]>(() => this.rule().weekdays ?? []);
  readonly monthlyWeekdays = computed<number[]>(() => this.monthlyWeekdaysState());
  readonly monthlyNths = computed<number[]>(() => this.monthlyNthsState());

  readonly untilValue = computed(() => this.rule().dateTo ?? this.rule().dateFrom);
  readonly isUnlimited = computed(() => this.rule().dateTo === null);

  readonly occurrenceCount = computed(() => countRecurrenceOccurrences(this.rule()));
  readonly isTooLong = computed(() => this.rule().dateTo !== null && this.occurrenceCount() > MAX_SERIES_OCCURRENCES);

  readonly previewLabel = computed(() => {
    const lang = this.languageService.currentLang();
    const count = this.occurrenceCount();
    const from = formatEventDateOnly(this.rule().dateFrom, lang);
    if (this.isTooLong()) {
      return this.translate.instant('eventDetail.seriesTooLong', { max: MAX_SERIES_OCCURRENCES });
    }
    if (!count) {
      return this.translate.instant('eventDetail.seriesPreviewNone');
    }
    const to = this.rule().dateTo;
    if (to === null) {
      return this.translate.instant('eventDetail.seriesPreviewUnlimited', { max: MAX_SERIES_OCCURRENCES, from });
    }
    const toLabel = formatEventDateOnly(to, lang);
    const key = count === 1 ? 'eventDetail.seriesPreviewOne' : 'eventDetail.seriesPreviewMany';
    return this.translate.instant(key, { count, from, to: toLabel });
  });

  /** Switching frequency carries the currently-selected weekday chips over
   * to the other mode (e.g. Cada semana with mar+sáb selected -> Cada mes
   * keeps mar+sáb, just adds nth chips) instead of discarding them - only
   * falls back to the rule's own anchor date (dateFrom) when nothing at all
   * was ever selected on either side yet. */
  setFrequency(frequency: RecurrenceFrequency): void {
    if (frequency === this.rule().frequency) {
      return;
    }
    const anchor = new Date(this.rule().dateFrom);
    const anchorWeekday = (anchor.getDay() + 6) % 7;
    const currentWeekdays = this.rule().frequency === 'weekly' ? this.weeklyWeekdays() : this.monthlyWeekdaysState();
    const weekdays = currentWeekdays.length ? currentWeekdays : [anchorWeekday];

    if (frequency === 'weekly') {
      this.rule.update((r) => ({ ...r, frequency, weekdays }));
      return;
    }
    const nths = this.monthlyNthsState().length
      ? this.monthlyNthsState()
      : [Math.min(4, Math.floor((anchor.getDate() - 1) / 7) + 1)];
    this.monthlyWeekdaysState.set(weekdays);
    this.monthlyNthsState.set(nths);
    this.rule.update((r) => ({ ...r, frequency }));
    this.rebuildNthWeekdays(weekdays, nths);
  }

  onIntervalStep(delta: number): void {
    this.rule.update((r) => ({ ...r, interval: Math.max(1, r.interval + delta) }));
  }

  setWeeklyWeekdays(weekdays: number[]): void {
    this.rule.update((r) => ({ ...r, weekdays }));
  }

  setMonthlyWeekdays(weekdays: number[]): void {
    this.monthlyWeekdaysState.set(weekdays);
    this.rebuildNthWeekdays(weekdays, this.monthlyNthsState());
  }

  toggleNth(nth: number): void {
    const nths = this.monthlyNthsState();
    const next = nths.includes(nth) ? nths.filter((n) => n !== nth) : [...nths, nth].sort((a, b) => a - b);
    this.monthlyNthsState.set(next);
    this.rebuildNthWeekdays(this.monthlyWeekdaysState(), next);
  }

  nthLabelKey(nth: number): string {
    return NTH_LABEL_KEYS[nth];
  }

  private rebuildNthWeekdays(weekdays: number[], nths: number[]): void {
    // .flatMap()/.flat() aren't in this project's pinned tsconfig lib
    // (es2018) - a plain nested loop reads the same and stays within it.
    const nthWeekdays: { nth: number; weekday: number }[] = [];
    for (const nth of nths) {
      for (const weekday of weekdays) {
        nthWeekdays.push({ nth, weekday });
      }
    }
    this.rule.update((r) => ({ ...r, nthWeekdays }));
  }

  onDateFromChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    const dateFrom = startOfDayFromIso(iso);
    this.rule.update((r) => ({ ...r, dateFrom, dateTo: r.dateTo !== null && r.dateTo < dateFrom ? null : r.dateTo }));
  }

  onUntilChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    this.rule.update((r) => ({ ...r, dateTo: endOfDayFromIso(iso) }));
  }

  toggleNoLimit(): void {
    this.rule.update((r) => ({ ...r, dateTo: r.dateTo === null ? r.dateFrom + 90 * DAY_MS : null }));
  }

  weekdayLabel(weekday: number): string {
    return weekdayShortLabels(this.languageService.currentLang())[weekday] ?? '';
  }
}
