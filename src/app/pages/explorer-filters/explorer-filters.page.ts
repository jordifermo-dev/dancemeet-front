import { Component, OnInit, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import {
  IonContent,
  IonIcon,
  IonButton,
  IonModal,
  IonDatetime,
  IonDatetimeButton,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { chevronBack, calendarOutline, close } from 'ionicons/icons';
import { DisciplineService } from '../../services/discipline.service';
import { EventTypeService } from '../../services/event-type.service';
import { Discipline, DISCIPLINE_NAMES, EventType, EVENT_TYPE_NAMES, EventStatus, EVENT_STATUSES, PriceOption } from '../../models';
import { disciplineIconUrl, eventTypeIconUrl, statusIconUrl, sortByNameOrder, STATUS_LABEL_KEYS } from '../../shared/icon-catalog';
import { DateQuickOption, ExplorerFiltersService } from '../explorer/explorer-filters.service';

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
  imports: [IonContent, IonIcon, IonButton, IonModal, IonDatetime, IonDatetimeButton, TranslatePipe],
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

  readonly disciplineIconUrl = disciplineIconUrl;
  readonly eventTypeIconUrl = eventTypeIconUrl;
  readonly statusIconUrl = statusIconUrl;

  constructor() {
    addIcons({ chevronBack, calendarOutline, close });
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

  toggleDraftEventType(id: string): void {
    this.filters.toggleDraftEventTypeId(id);
  }

  toggleDraftDiscipline(id: string): void {
    this.filters.toggleDraftDisciplineId(id);
  }

  toggleDraftStatus(id: EventStatus): void {
    this.filters.toggleDraftStatusId(id);
  }

  toggleDraftPriceOption(id: PriceOption): void {
    this.filters.toggleDraftPriceOption(id);
  }

  setDraftQuickDate(option: DateQuickOption): void {
    const { from, to } = this.filters.quickDateRange(option);
    this.filters.draftDateFrom.set(from);
    this.filters.draftDateTo.set(to);
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

  clearAll(): void {
    this.filters.clearAll(
      this.disciplines().map((d) => d.id),
      this.eventTypes().map((e) => e.id),
    );
    this.goBack();
  }

  applyAll(): void {
    this.filters.applyAll();
    this.goBack();
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
