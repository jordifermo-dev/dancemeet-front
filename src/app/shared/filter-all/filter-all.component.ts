import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline, bookmarkOutline, refreshOutline, checkmarkOutline } from 'ionicons/icons';
import { MinSelectionWarningService } from '../min-selection-warning.service';
import { FilterSectionComponent } from '../filter-section/filter-section.component';
import { FilterActionsRowComponent } from '../filter-actions-row/filter-actions-row.component';
import { ChipGridComponent, ChipGridItem } from '../chip-grid/chip-grid.component';
import { DatePickerFieldComponent } from '../date-picker-field/date-picker-field.component';

export type FilterAllCategory = 'eventTypes' | 'disciplines' | 'statuses' | 'price' | 'quickDate' | 'relation';

export interface FilterAllChipEvent {
  category: FilterAllCategory;
  id: string;
}

/** The "Filtrar todo" body shared by Explorer/Events' dedicated page and
 * Favorites/User-events' generic filter sheet - same 5 categories in the
 * same order (Tipos de evento, Disciplinas, Estado, Precio, Fecha), with
 * "Guardar como preferencias" and "Relación" each shown only where they
 * apply. The host page keeps owning all the actual filter state/logic
 * (draft signals, chip computeds, apply/reset/save) and the date pickers'
 * own <ion-modal>/<ion-datetime> - this only renders the shared layout and
 * bubbles interactions back up, the same division of responsibility
 * <app-filter-actions-row> already uses for its buttons. */
@Component({
  selector: 'app-filter-all',
  standalone: true,
  templateUrl: './filter-all.component.html',
  styleUrl: './filter-all.component.scss',
  imports: [TranslatePipe, IonButton, IonIcon, FilterSectionComponent, FilterActionsRowComponent, ChipGridComponent, DatePickerFieldComponent],
})
export class FilterAllComponent {
  readonly minSelectionWarning = inject(MinSelectionWarningService);

  constructor() {
    addIcons({ closeOutline, bookmarkOutline, refreshOutline, checkmarkOutline });
  }

  /** Explorer/Events only - lets the current selection be saved as the
   * user's profile preferences, not just applied to this session. */
  @Input() showSaveAsPreference = false;
  /** Favorites/User-events only - filters by the viewer's relation to the
   * event (organizer/attendee), meaningless when browsing events at large. */
  @Input() showRelation = false;

  @Input({ required: true }) eventTypeChips: ChipGridItem[] = [];
  @Input({ required: true }) disciplineChips: ChipGridItem[] = [];
  @Input({ required: true }) statusChips: ChipGridItem[] = [];
  @Input({ required: true }) priceChips: ChipGridItem[] = [];
  @Input({ required: true }) quickDateChips: ChipGridItem[] = [];
  @Input() relationChips: ChipGridItem[] = [];

  /** Seed timestamps for the Desde/Hasta <app-date-picker-field>s - the host
   * page still owns the actual draft signals and their onDraftDate*Change
   * handlers, this just passes the current value through. */
  @Input({ required: true }) dateFromValue!: number;
  @Input({ required: true }) dateToValue!: number;
  /** "Desde" can have no lower bound (search/filter every event regardless
   * of how old), same "unset" placeholder pattern Hasta already had - without
   * it, an unbound picker just falls back to showing whatever today's date
   * happens to be, which reads as a real applied filter value instead of "no
   * filter". */
  @Input() dateFromIsUnset = false;
  @Input() dateToIsUnset = false;

  /** Drives the Aplicar/Aplicado✓ label on the primary button. */
  @Input() applied = false;

  @Output() readonly chipToggle = new EventEmitter<FilterAllChipEvent>();
  @Output() readonly dateFromChange = new EventEmitter<Event>();
  @Output() readonly dateToChange = new EventEmitter<Event>();
  @Output() readonly clearDateFrom = new EventEmitter<void>();
  @Output() readonly clearDateTo = new EventEmitter<void>();
  @Output() readonly saveAsPreference = new EventEmitter<void>();
  @Output() readonly reset = new EventEmitter<void>();
  @Output() readonly apply = new EventEmitter<void>();
}
