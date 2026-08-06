import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { IonButton, IonIcon, IonDatetimeButton } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { MinSelectionWarningService } from '../min-selection-warning.service';
import { FilterSectionComponent } from '../filter-section/filter-section.component';
import { FilterActionsRowComponent } from '../filter-actions-row/filter-actions-row.component';
import { ChipGridComponent, ChipGridItem } from '../chip-grid/chip-grid.component';

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
  imports: [TranslatePipe, IonButton, IonIcon, IonDatetimeButton, FilterSectionComponent, FilterActionsRowComponent, ChipGridComponent],
})
export class FilterAllComponent {
  readonly minSelectionWarning = inject(MinSelectionWarningService);

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

  /** DOM ids linking each <ion-datetime-button> to its <ion-modal>/
   * <ion-datetime> pair, which stays declared in the host page - those ids
   * must be unique per page instance, so the host provides them. */
  @Input({ required: true }) dateFromId!: string;
  @Input({ required: true }) dateToId!: string;
  /** User-events only - unlike everywhere else, its date range can genuinely
   * have no lower bound (defaults to showing every past+upcoming event), so
   * its "Desde" button needs the same "unset" placeholder Hasta already has -
   * without it, an unbound <ion-datetime> just falls back to showing
   * whatever today's date happens to be, which reads as a real applied
   * filter value instead of "no filter". */
  @Input() dateFromIsUnset = false;
  @Input() dateToIsUnset = false;

  /** Drives the Aplicar/Aplicado✓ label on the primary button. */
  @Input() applied = false;

  @Output() readonly chipToggle = new EventEmitter<FilterAllChipEvent>();
  @Output() readonly clearDateTo = new EventEmitter<void>();
  @Output() readonly saveAsPreference = new EventEmitter<void>();
  @Output() readonly reset = new EventEmitter<void>();
  @Output() readonly apply = new EventEmitter<void>();
}
