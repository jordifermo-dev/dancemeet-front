import { Component, computed, input, model, signal } from '@angular/core';
import { IonButton, IonIcon, IonModal } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline } from 'ionicons/icons';
import { RecurrenceRule } from '../../../models';
import { FilterSheetHeaderComponent } from '../../filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../filters/filter-actions-row/filter-actions-row.component';
import { RecurrenceEditorComponent } from '../recurrence-editor/recurrence-editor.component';

const DAY_MS = 24 * 60 * 60 * 1000;

type QuickPreset = 'none' | 'weekly' | 'monthly' | 'custom';

function defaultRule(frequency: RecurrenceRule['frequency'], anchor: number): RecurrenceRule {
  const anchorDate = new Date(anchor);
  const dateFrom = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate()).getTime();
  const anchorWeekday = (anchorDate.getDay() + 6) % 7;
  return {
    frequency,
    interval: 1,
    weekdays: frequency === 'weekly' ? [anchorWeekday] : undefined,
    nthWeekdays: frequency === 'monthlyNthWeekday' ? [{ nth: 1, weekday: anchorWeekday }] : undefined,
    dateFrom,
    dateTo: dateFrom + 90 * DAY_MS,
  };
}

/** The "Repetir" field shown on the create-event form (Google Calendar's
 * Capa 1): a one-line summary that opens a bottom sheet with quick presets
 * (No se repite / Cada semana / Cada mes / Personalizar…) - "Personalizar…"
 * opens the full RecurrenceEditorComponent (Capa 2) in its own sheet.
 * `recurrence` is null while "No se repite" is selected - null is what
 * event-detail.page.ts checks to decide createEvent() vs createSeries(). */
@Component({
  selector: 'app-recurrence-quick-picker',
  standalone: true,
  templateUrl: './recurrence-quick-picker.component.html',
  styleUrl: './recurrence-quick-picker.component.scss',
  imports: [
    IonButton,
    IonIcon,
    IonModal,
    TranslatePipe,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
    RecurrenceEditorComponent,
  ],
})
export class RecurrenceQuickPickerComponent {
  constructor() {
    addIcons({ checkmarkOutline, closeOutline });
  }

  readonly recurrence = model.required<RecurrenceRule | null>();
  /** Seeds the default rule's weekday/"Desde" - the event's own date when
   * editing an existing single event (so "Desde" doesn't default to today
   * while attachRecurrenceToEvent will actually anchor to the event's real
   * day server-side regardless), Date.now() when creating a new one. */
  readonly anchorDate = input<number>(Date.now());

  readonly isPresetOpen = signal(false);
  readonly isCustomOpen = signal(false);

  /** Static label reflecting the current frequency - not a full dynamic
   * sentence like Capa 2's own live preview, kept simple since the user can
   * always tap in to see/edit the exact rule. */
  summaryKey(): string {
    const rule = this.recurrence();
    if (!rule) {
      return 'eventDetail.repeatNone';
    }
    return rule.frequency === 'weekly' ? 'eventDetail.repeatWeekly' : 'eventDetail.repeatMonthly';
  }

  /** Which preset row shows as selected in the sheet - "Personalizar…" never
   * does (it's an entry point into the same weekly/monthly rule shapes, not
   * a distinct third state), matching summaryKey()'s own simplification. */
  readonly activePreset = computed<QuickPreset>(() => {
    const rule = this.recurrence();
    if (!rule) {
      return 'none';
    }
    return rule.frequency === 'weekly' ? 'weekly' : 'monthly';
  });

  openPresets(): void {
    this.isPresetOpen.set(true);
  }

  selectPreset(preset: QuickPreset): void {
    if (preset === 'none') {
      this.recurrence.set(null);
      this.isPresetOpen.set(false);
      return;
    }
    if (preset === 'custom') {
      if (!this.recurrence()) {
        this.recurrence.set(defaultRule('weekly', this.anchorDate()));
      }
      this.isPresetOpen.set(false);
      this.isCustomOpen.set(true);
      return;
    }
    this.recurrence.set(defaultRule(preset === 'weekly' ? 'weekly' : 'monthlyNthWeekday', this.anchorDate()));
    this.isPresetOpen.set(false);
  }

  closeCustom(): void {
    this.isCustomOpen.set(false);
  }

  onRuleChange(rule: RecurrenceRule): void {
    this.recurrence.set(rule);
  }
}
