import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline } from 'ionicons/icons';
import { DisciplineService } from '../../services/discipline.service';
import { EventTypeService } from '../../services/event-type.service';
import { Discipline, DISCIPLINE_NAMES, EventType, EVENT_TYPE_NAMES, EventStatus, EVENT_STATUSES, PriceOption } from '../../models';
import { sortByNameOrder, STATUS_LABEL_KEYS } from '../../shared/icon-catalog';
import { ExplorerFiltersService, DateQuickOption } from '../explorer/explorer-filters.service';
import { createApplyFlash } from '../../shared/success-flash';
import { FilterAllChipEvent, FilterAllComponent } from '../../shared/filter-all/filter-all.component';
import { FilterSheetHeaderComponent } from '../../shared/filter-sheet-header/filter-sheet-header.component';
import {
  disciplineChipItems,
  eventTypeChipItems,
  priceChipItems,
  quickDateChipItems,
  statusChipItems,
} from '../../shared/chip-grid/chip-grid-presets';

const STATUS_OPTIONS = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));
const PRICE_OPTIONS: { id: PriceOption; labelKey: string }[] = [
  { id: 'free', labelKey: 'explorer.priceFreeOption' },
  { id: 'paid', labelKey: 'explorer.pricePaidOption' },
];

@Component({
  selector: 'app-explorer-filters',
  standalone: true,
  templateUrl: 'explorer-filters.page.html',
  styleUrls: ['explorer-filters.page.scss'],
  imports: [IonContent, FilterAllComponent, FilterSheetHeaderComponent],
})
export class ExplorerFiltersPage implements OnInit {
  private readonly location = inject(Location);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  readonly filters = inject(ExplorerFiltersService);

  readonly disciplines = signal<Discipline[]>([]);
  readonly eventTypes = signal<EventType[]>([]);
  readonly statusOptions = STATUS_OPTIONS;
  readonly priceOptions = PRICE_OPTIONS;

  readonly eventTypeChips = computed(() => eventTypeChipItems(this.eventTypes(), this.filters.draftEventTypeIds()));
  readonly disciplineChips = computed(() => disciplineChipItems(this.disciplines(), this.filters.draftDisciplineIds()));
  readonly statusChips = computed(() => statusChipItems(this.statusOptions, this.filters.draftStatuses()));
  readonly priceChips = computed(() => priceChipItems(this.priceOptions, this.filters.draftPriceOptions()));
  readonly quickDateChips = computed(() => quickDateChipItems(this.filters.draftActiveQuickDate()));
  /** Fallback seed for <app-filter-all>'s date fields when draftDateFrom/
   * draftDateTo are both unset ("Sin límite" both ends). */
  readonly nowTimestamp = Date.now();

  constructor() {
    addIcons({ calendarOutline });
  }

  ngOnInit(): void {
    // Applied values are already kept in sync with the profile reactively
    // (see ExplorerFiltersService) - just copy them into the draft for editing.
    this.filters.syncDraftFromApplied();

    this.disciplineService.getAll().subscribe({
      next: (disciplines) => {
        if (disciplines.length) {
          this.disciplines.set(sortByNameOrder(disciplines, DISCIPLINE_NAMES));
        }
      },
    });
    this.eventTypeService.getAll().subscribe({
      next: (eventTypes) => {
        if (eventTypes.length) {
          this.eventTypes.set(sortByNameOrder(eventTypes, EVENT_TYPE_NAMES));
        }
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  onChipToggle(event: FilterAllChipEvent): void {
    switch (event.category) {
      case 'eventTypes':
        this.filters.toggleDraftEventTypeId(event.id);
        break;
      case 'disciplines':
        this.filters.toggleDraftDisciplineId(event.id);
        break;
      case 'statuses':
        this.filters.toggleDraftStatusId(event.id as EventStatus);
        break;
      case 'price':
        this.filters.toggleDraftPriceOption(event.id as PriceOption);
        break;
      case 'quickDate':
        this.filters.setDraftQuickDate(event.id as DateQuickOption);
        break;
    }
  }

  onDraftDateFromChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    this.filters.setDraftDateFromIso(iso);
  }

  onDraftDateToChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    this.filters.setDraftDateToIso(iso);
  }

  clearDraftDateTo(): void {
    this.filters.draftDateTo.set(undefined);
  }

  readonly applyAllFlash = createApplyFlash(() => this.goBack(), 900);

  applyAll(): void {
    this.filters.applyAll();
    this.applyAllFlash.trigger();
  }

  resetAll(): void {
    this.filters.resetAll();
    this.goBack();
  }

  saveAll(): void {
    this.filters.saveAll();
    this.goBack();
  }
}
