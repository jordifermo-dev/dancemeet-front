import { Component, EventEmitter, Output, ViewChild, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonDatetime, IonIcon, IonModal } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline } from 'ionicons/icons';
import { LanguageService } from '../../../services/core/language.service';
import { INTL_LOCALES } from '../event-date-format';
import { FilterSheetHeaderComponent } from '../../filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../filters/filter-actions-row/filter-actions-row.component';

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatTimeInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Inicio and Fin time-of-day, both editable in the same sheet (ToGoodToGo's
 * combined pickup-window screen) instead of two separate modals - each
 * <ion-datetime> still emits its own raw ionChange, forwarded untouched via
 * fromChange/toChange so callers reuse the exact onTimeFromChange/
 * onTimeToChange handlers TimePickerFieldComponent already used. */
@Component({
  selector: 'app-time-range-picker',
  standalone: true,
  templateUrl: './time-range-picker.component.html',
  styleUrl: './time-range-picker.component.scss',
  imports: [IonModal, IonDatetime, IonButton, IonIcon, TranslatePipe, FilterSheetHeaderComponent, FilterActionsRowComponent],
})
export class TimeRangePickerComponent {
  private readonly languageService = inject(LanguageService);

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  // Signal inputs (not plain @Input) so fromLabel()/toLabel()/fromIso()/
  // toIso() below - all computed() - actually see a tracked dependency and
  // recompute when the caller passes a new value; a plain @Input() property
  // read inside computed() registers no dependency at all, silently
  // freezing the trigger's displayed time (and the wheel's seed value on
  // reopen) at whatever it was on first read.
  readonly valueFrom = input.required<number>();
  readonly valueTo = input.required<number>();
  readonly titleKey = input.required<string>();
  @Output() readonly fromChange = new EventEmitter<Event>();
  @Output() readonly toChange = new EventEmitter<Event>();

  @ViewChild('fromPicker') private readonly fromPickerRef?: IonDatetime;
  @ViewChild('toPicker') private readonly toPickerRef?: IonDatetime;

  readonly isOpen = signal(false);
  readonly fromLabel = computed(() => formatTimeInputValue(this.valueFrom()));
  readonly toLabel = computed(() => formatTimeInputValue(this.valueTo()));
  readonly fromIso = computed(() => `1970-01-01T${this.fromLabel()}:00`);
  readonly toIso = computed(() => `1970-01-01T${this.toLabel()}:00`);
  /** ion-datetime's hour-cycle (12h/24h) formatting follows its own `locale`
   * input, which defaults to the device's system locale rather than the
   * app's own language selection - keep it in sync the same way the date
   * pickers are. */
  readonly localeTag = computed(() => INTL_LOCALES[this.languageService.currentLang() ?? 'es']);

  onFromChange(ev: Event): void {
    this.fromChange.emit(ev);
  }

  onToChange(ev: Event): void {
    this.toChange.emit(ev);
  }

  /** Confirming with closeOverlay=true (like every single-field picker's own
   * Aplicar button does) makes ion-datetime look for and dismiss the nearest
   * ion-modal itself - fine with one picker, but with two in the same sheet
   * the first confirm(true) could start closing the modal before the second
   * picker's own confirm has a chance to fire its ionChange, silently
   * dropping that half of the change. Confirming both with closeOverlay
   * left false and closing the sheet ourselves afterward avoids the race.
   * Belt-and-suspenders: also re-emits each picker's now-confirmed .value
   * directly afterward, so the host is guaranteed to see both updates even
   * if an ionChange landed on a tick this component's own listener missed -
   * harmless if it already had the right value (same value emitted twice). */
  async apply(): Promise<void> {
    await this.fromPickerRef?.confirm(false);
    await this.toPickerRef?.confirm(false);
    const fromValue = this.fromPickerRef?.value;
    if (typeof fromValue === 'string') {
      this.fromChange.emit(new CustomEvent('ionChange', { detail: { value: fromValue } }) as unknown as Event);
    }
    const toValue = this.toPickerRef?.value;
    if (typeof toValue === 'string') {
      this.toChange.emit(new CustomEvent('ionChange', { detail: { value: toValue } }) as unknown as Event);
    }
    this.isOpen.set(false);
  }

  cancel(): void {
    this.fromPickerRef?.cancel(false);
    this.toPickerRef?.cancel(false);
    this.isOpen.set(false);
  }
}
