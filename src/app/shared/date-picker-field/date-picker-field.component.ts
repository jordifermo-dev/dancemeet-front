import { Component, EventEmitter, Output, ViewChild, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonDatetime, IonIcon, IonModal, IonToggle } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline } from 'ionicons/icons';
import { LanguageService } from '../../services/language.service';
import { INTL_LOCALES, formatEventDateOnly } from '../event-date-format';
import { FilterSheetHeaderComponent } from '../filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../filter-actions-row/filter-actions-row.component';

/** A single Desde/Hasta date field: a plain button showing the picked date
 * (or an "unset" placeholder), opening a controlled ion-modal calendar with
 * Cancelar/Aplicar to pick a new one. Replaces <ion-datetime-button>, used
 * to be the native trigger everywhere a date filter shows one - its native
 * dropdown popup is drawn by the browser itself (not app CSS) and can render
 * clipped near a screen edge or inside a scrolling container, the same
 * reliability problem event-detail.page.ts's own date/time pickers hit
 * earlier and fixed the same way. Forwards ion-datetime's own ionChange
 * event untouched via dateChange, so callers can keep using whatever
 * (event: Event) => void handler they already had wired to their old
 * <ion-datetime>. */
@Component({
  selector: 'app-date-picker-field',
  standalone: true,
  templateUrl: './date-picker-field.component.html',
  styleUrl: './date-picker-field.component.scss',
  imports: [IonModal, IonDatetime, IonButton, IonIcon, IonToggle, TranslatePipe, FilterSheetHeaderComponent, FilterActionsRowComponent],
})
export class DatePickerFieldComponent {
  private readonly languageService = inject(LanguageService);

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  /** Seed timestamp - the date the calendar opens on. When isUnset is true
   * this still needs to be a real timestamp (e.g. Date.now() or the paired
   * "desde" value) purely to seed the picker; it's never shown. Signal
   * inputs (not plain @Input) so label()/valueIso() below - both computed()
   * - actually see a tracked dependency and recompute when the caller passes
   * a new value; a plain @Input() property read inside computed() registers
   * no dependency at all, silently freezing the label at whatever it was on
   * first read. */
  readonly value = input.required<number>();
  /** Shows unsetLabel instead of the formatted value (e.g. Favorites/Events'
   * "Hasta: sin límite" placeholder for an unbounded date range). */
  readonly isUnset = input(false);
  readonly unsetLabel = input('');
  readonly titleKey = input.required<string>();
  /** Renders an inline "Sin límite" toggle next to the trigger instead of
   * the caller having to render its own separate text-link button below -
   * consolidates what used to be 6+ near-identical copies of that link
   * across the date filter pages into one place. */
  readonly showUnsetToggle = input(false);
  @Output() readonly dateChange = new EventEmitter<Event>();
  /** Emits the toggle's new checked state - the caller still owns what
   * "unset"/"set" actually means for its own signal (e.g. clearing to
   * undefined vs. seeding a default date). */
  @Output() readonly unsetToggle = new EventEmitter<boolean>();

  @ViewChild('picker') private readonly pickerRef?: IonDatetime;

  readonly isOpen = signal(false);
  readonly valueIso = computed(() => new Date(this.value()).toISOString());
  readonly label = computed(() => formatEventDateOnly(this.value(), this.languageService.currentLang()));
  /** ion-datetime renders its own month/weekday names off its `locale`
   * input, which defaults to the device/webview's system locale - it does
   * NOT follow the app's own ngx-translate language selection at all, so
   * without this it silently stays in whatever language the phone's OS is
   * set to regardless of what the user picked in-app. */
  readonly localeTag = computed(() => INTL_LOCALES[this.languageService.currentLang() ?? 'es']);

  /** ion-datetime's own year picker defaults to starting at 1926 - narrows it
   * to a sensible window around today instead. Plain fields, not signals:
   * the current year only ever changes across an app restart, never within
   * a running session, so there's nothing to react to - reading
   * `new Date()` at construction time is enough for this to keep rolling
   * forward release over release. */
  readonly minIso = `${new Date().getFullYear() - 10}-01-01`;
  readonly maxIso = `${new Date().getFullYear() + 5}-12-31`;

  onChange(ev: Event): void {
    this.dateChange.emit(ev);
  }

  /** Switching the toggle on clears (host handles what "clear" means for its
   * own signal); switching it off opens the calendar right away instead of
   * leaving an ambiguous "off but still no date" state - the very next
   * dateChange naturally un-sets isUnset on the host's side once a real date
   * is picked, so there's nothing else to do here for that direction. */
  onUnsetToggle(ev: Event): void {
    const checked = (ev as CustomEvent<{ checked: boolean }>).detail.checked;
    this.unsetToggle.emit(checked);
    if (!checked) {
      this.isOpen.set(true);
    }
  }

  /** "Hoy" shortcut (Google Calendar's own date pickers offer the same) -
   * ion-datetime's reset(startDate) "resets the internal state... but does
   * not update the value" (per its own docs), which is exactly "jump the
   * grid to today's month" without selecting/applying today as the actual
   * picked date - the modal stays open and Aplicar/Cancelar still work on
   * whatever the user taps next, same as any other navigation. */
  goToToday(): void {
    const todayIso = new Date().toISOString().slice(0, 10);
    this.pickerRef?.reset(todayIso);
  }

  /** Confirms the wheel/grid picker, then re-emits its now-confirmed .value
   * directly instead of only relying on ionChange - for presentation="date"
   * wheel/grid pickers, ionChange only fires from inside confirm() itself,
   * and re-reading .value afterward guarantees the host sees the update even
   * on the odd tick where that event doesn't land before this sheet closes
   * (harmless if it does land too - the host just gets the same value twice). */
  async apply(): Promise<void> {
    await this.pickerRef?.confirm(false);
    const value = this.pickerRef?.value;
    if (typeof value === 'string') {
      this.dateChange.emit(new CustomEvent('ionChange', { detail: { value } }) as unknown as Event);
    }
    this.isOpen.set(false);
  }

  cancel(): void {
    this.pickerRef?.cancel(false);
    this.isOpen.set(false);
  }
}
