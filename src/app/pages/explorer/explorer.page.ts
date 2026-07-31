import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonIcon,
  IonButton,
  IonModal,
  IonSpinner,
  IonDatetime,
  IonDatetimeButton,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { GoogleMap, MapMarker, MapCircle } from '@angular/google-maps';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  optionsOutline,
  navigateOutline,
  close,
  addOutline,
  removeOutline,
  calendarOutline,
} from 'ionicons/icons';
import { DisciplineService } from '../../services/discipline.service';
import { EventTypeService } from '../../services/event-type.service';
import { EventService } from '../../services/event.service';
import { GoogleMapsLoaderService } from '../../shared/google-maps-loader.service';
import { Discipline, DISCIPLINE_NAMES, EventType, EVENT_TYPE_NAMES, EventStatus, EVENT_STATUSES, PriceOption, Event as DanceEvent } from '../../models';
import { disciplineIconUrl, eventTypeIconUrl, statusIconUrl, sortByNameOrder, STATUS_LABEL_KEYS } from '../../shared/icon-catalog';
import { LocationFilterButtonComponent } from '../../shared/location-filter-button/location-filter-button.component';
import { DateQuickOption, ExplorerFiltersService } from './explorer-filters.service';

const STATUS_OPTIONS = EVENT_STATUSES.map((id) => ({ id, labelKey: STATUS_LABEL_KEYS[id] }));
const PRICE_OPTIONS: { id: PriceOption; labelKey: string }[] = [
  { id: 'free', labelKey: 'explorer.priceFreeOption' },
  { id: 'paid', labelKey: 'explorer.pricePaidOption' },
];
const DEFAULT_LATITUDE = 41.3874;
const DEFAULT_LONGITUDE = 2.1686;
const MARKER_ICON_SIZE = 34;

interface MapMarkerData {
  event: DanceEvent;
  position: google.maps.LatLngLiteral;
  options: google.maps.MarkerOptions;
}

/** google.maps.Marker only takes a single icon image, but an event can now
 * have more than one discipline - this composites all of them side by side
 * into one small SVG (each icon shrinks a bit as more are added) instead of
 * only ever showing the first one. A single discipline keeps using its plain
 * static icon URL directly (the pre-existing, known-good path) - only 2+
 * disciplines go through the generated data: URI, so a bug in the
 * compositing code can't take down every marker, just multi-discipline ones. */
function buildDisciplineMarkerIcon(disciplines: Discipline[]): { url: string; size: google.maps.Size } {
  if (disciplines.length === 1) {
    return { url: disciplineIconUrl(disciplines[0]), size: new google.maps.Size(MARKER_ICON_SIZE, MARKER_ICON_SIZE) };
  }
  const iconSize = Math.max(18, MARKER_ICON_SIZE * 0.7);
  const gap = 2;
  const width = disciplines.length * iconSize + (disciplines.length - 1) * gap;
  const images = disciplines
    .map((discipline, index) => {
      const x = index * (iconSize + gap);
      return `<image href="${disciplineIconUrl(discipline)}" x="${x}" y="0" width="${iconSize}" height="${iconSize}" />`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${iconSize}">${images}</svg>`;
  // Standard percent-encoded data URI (no ";utf8" parameter, which is
  // non-standard and not reliably accepted by Google Maps' own icon loader).
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, size: new google.maps.Size(width, iconSize) };
}

@Component({
  selector: 'app-explorer',
  standalone: true,
  templateUrl: 'explorer.page.html',
  styleUrls: ['explorer.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonIcon,
    IonButton,
    IonModal,
    IonSpinner,
    IonDatetime,
    IonDatetimeButton,
    GoogleMap,
    MapMarker,
    MapCircle,
    TranslatePipe,
    LocationFilterButtonComponent,
  ],
})
export class ExplorerPage implements OnInit, ViewWillEnter {
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly eventService = inject(EventService);
  private readonly mapsLoader = inject(GoogleMapsLoaderService);
  private readonly router = inject(Router);
  readonly filters = inject(ExplorerFiltersService);

  private searchInputTimer: ReturnType<typeof setTimeout> | null = null;

  readonly loading = signal(true);
  readonly mapReady = signal(false);
  readonly mapError = signal(false);
  readonly events = signal<DanceEvent[]>([]);
  readonly searchTerm = signal('');

  readonly disciplines = signal<Discipline[]>([]);
  readonly disciplinesById = computed(() => new Map(this.disciplines().map((d) => [d.id, d])));
  readonly eventTypes = signal<EventType[]>([]);
  readonly statusOptions = STATUS_OPTIONS;
  readonly priceOptions = PRICE_OPTIONS;

  readonly locatingMe = signal(false);

  /** An empty discipline or event-type selection now filters down to zero
   * events (see explorer-filters.service.ts) rather than being ignored, so an
   * empty result needs a distinct, actionable message pointing at the
   * filters instead of the generic "no events around here" one. */
  readonly noCategorySelected = computed(
    () => this.filters.appliedDisciplineIds().length === 0 || this.filters.appliedEventTypeIds().length === 0,
  );

  readonly mapCenter = computed<google.maps.LatLngLiteral>(() => ({
    lat: this.filters.appliedLatitude() ?? DEFAULT_LATITUDE,
    lng: this.filters.appliedLongitude() ?? DEFAULT_LONGITUDE,
  }));
  readonly mapZoom = signal(12);
  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
  };

  // Visualizes the user's saved distance radius as a translucent circle
  // around the search center, so the search area is visible, not just a number.
  readonly radiusCircleOptions = computed<google.maps.CircleOptions>(() => ({
    center: this.mapCenter(),
    radius: this.filters.appliedDistanceRange() * 1000,
    strokeColor: '#106568',
    strokeOpacity: 0.6,
    strokeWeight: 1.5,
    fillColor: '#106568',
    fillOpacity: 0.08,
    clickable: false,
  }));

  readonly markers = computed<MapMarkerData[]>(() => {
    const byId = this.disciplinesById();
    return this.events().map((event) => {
      const disciplines = event.disciplineIds.map((id) => byId.get(id)).filter((d): d is Discipline => !!d);
      if (!disciplines.length) {
        return { event, position: { lat: event.latitude, lng: event.longitude }, options: {} };
      }
      const icon = buildDisciplineMarkerIcon(disciplines);
      return {
        event,
        position: { lat: event.latitude, lng: event.longitude },
        options: { icon: { url: icon.url, scaledSize: icon.size } },
      };
    });
  });

  readonly isEventTypeModalOpen = signal(false);
  readonly isDisciplineModalOpen = signal(false);
  readonly isStatusModalOpen = signal(false);
  readonly isPriceModalOpen = signal(false);
  readonly isDateModalOpen = signal(false);

  readonly disciplineIconUrl = disciplineIconUrl;
  readonly eventTypeIconUrl = eventTypeIconUrl;
  readonly statusIconUrl = statusIconUrl;

  constructor() {
    addIcons({
      optionsOutline,
      navigateOutline,
      close,
      addOutline,
      removeOutline,
      calendarOutline,
    });

    // Re-run the search whenever any applied filter, the location, the radius
    // or the search term changes - all in one effect so every trigger stays in sync.
    effect(() => {
      this.filters.appliedDisciplineIds();
      this.filters.appliedEventTypeIds();
      this.filters.appliedStatuses();
      this.filters.appliedPriceOptions();
      this.filters.appliedDateFrom();
      this.filters.appliedDateTo();
      this.filters.appliedDistanceRange();
      this.filters.appliedLatitude();
      this.filters.appliedLongitude();
      const term = this.searchTerm();
      untracked(() => this.loadEvents(term));
    });
  }

  ngOnInit(): void {
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

    this.mapsLoader
      .load()
      .then(() => this.mapReady.set(true))
      .catch(() => this.mapError.set(true));
  }

  /** Ionic keeps this tab's instance alive, so re-fetch every time it's
   * re-entered - otherwise editing an event on its detail page and coming
   * back here would still show the stale, pre-edit marker/card data. */
  ionViewWillEnter(): void {
    this.loadEvents(this.searchTerm());
  }

  private loadEvents(search: string): void {
    this.loading.set(true);
    this.eventService
      .search({
        disciplineIds: this.filters.appliedDisciplineIds(),
        typeIds: this.filters.appliedEventTypeIds(),
        statuses: this.filters.appliedStatuses(),
        priceOptions: this.filters.appliedPriceOptions(),
        dateFrom: this.filters.appliedDateFrom(),
        dateTo: this.filters.appliedDateTo(),
        latitude: this.filters.appliedLatitude() ?? DEFAULT_LATITUDE,
        longitude: this.filters.appliedLongitude() ?? DEFAULT_LONGITUDE,
        radius: this.filters.appliedDistanceRange() * 1000,
        search: search.trim() || undefined,
      })
      .subscribe({
        next: (events) => {
          this.events.set(events);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onSearchChange(value: string | null | undefined): void {
    const term = value ?? '';
    if (this.searchInputTimer) {
      clearTimeout(this.searchInputTimer);
    }
    this.searchInputTimer = setTimeout(() => this.searchTerm.set(term), 300);
  }

  goToEvent(eventId: string): void {
    this.router.navigate(['/events', eventId]);
  }

  goToFullFilters(): void {
    this.router.navigateByUrl('/explorer-filters');
  }

  /** The floating "locate me" button on the map - an instant recenter, not
   * part of the location filter's draft/apply flow (see the modal's own
   * useCurrentLocation() below, which only edits the draft). */
  centerOnMyLocation(): void {
    if (!navigator.geolocation) {
      return;
    }
    this.locatingMe.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.filters.appliedLatitude.set(position.coords.latitude);
        this.filters.appliedLongitude.set(position.coords.longitude);
        this.filters.draftLatitude.set(position.coords.latitude);
        this.filters.draftLongitude.set(position.coords.longitude);
        this.locatingMe.set(false);
      },
      () => this.locatingMe.set(false),
    );
  }

  // --- Individual quick filter modals ----------------------------------

  openEventTypeModal(): void {
    this.filters.draftEventTypeIds.set([...this.filters.appliedEventTypeIds()]);
    this.isEventTypeModalOpen.set(true);
  }

  openDisciplineModal(): void {
    this.filters.draftDisciplineIds.set([...this.filters.appliedDisciplineIds()]);
    this.isDisciplineModalOpen.set(true);
  }

  openStatusModal(): void {
    this.filters.draftStatuses.set([...this.filters.appliedStatuses()]);
    this.isStatusModalOpen.set(true);
  }

  openPriceModal(): void {
    this.filters.draftPriceOptions.set([...this.filters.appliedPriceOptions()]);
    this.isPriceModalOpen.set(true);
  }

  openDateModal(): void {
    this.filters.draftDateFrom.set(this.filters.appliedDateFrom());
    this.filters.draftDateTo.set(this.filters.appliedDateTo());
    this.isDateModalOpen.set(true);
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
    this.filters.draftDateFrom.set(this.filters.startOfDayFromIso(iso));
  }

  onDraftDateToChange(event: Event): void {
    const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
    const iso = Array.isArray(value) ? value[0] : value;
    if (!iso) {
      return;
    }
    this.filters.draftDateTo.set(this.filters.endOfDayFromIso(iso));
  }

  clearDraftDateTo(): void {
    this.filters.draftDateTo.set(undefined);
  }

  applyEventTypeFilter(): void {
    this.filters.applyEventTypes();
    this.isEventTypeModalOpen.set(false);
  }

  clearEventTypeFilter(): void {
    this.filters.clearEventTypes(this.eventTypes().map((e) => e.id));
    this.isEventTypeModalOpen.set(false);
  }

  resetEventTypeFilter(): void {
    this.filters.resetEventTypes();
    this.isEventTypeModalOpen.set(false);
  }

  saveEventTypeFilter(): void {
    this.filters.saveEventTypes();
    this.isEventTypeModalOpen.set(false);
  }

  applyDisciplineFilter(): void {
    this.filters.applyDisciplines();
    this.isDisciplineModalOpen.set(false);
  }

  clearDisciplineFilter(): void {
    this.filters.clearDisciplines(this.disciplines().map((d) => d.id));
    this.isDisciplineModalOpen.set(false);
  }

  resetDisciplineFilter(): void {
    this.filters.resetDisciplines();
    this.isDisciplineModalOpen.set(false);
  }

  saveDisciplineFilter(): void {
    this.filters.saveDisciplines();
    this.isDisciplineModalOpen.set(false);
  }

  applyStatusFilter(): void {
    this.filters.applyStatuses();
    this.isStatusModalOpen.set(false);
  }

  clearStatusFilter(): void {
    this.filters.clearStatuses();
    this.isStatusModalOpen.set(false);
  }

  resetStatusFilter(): void {
    this.filters.resetStatuses();
    this.isStatusModalOpen.set(false);
  }

  saveStatusFilter(): void {
    this.filters.saveStatuses();
    this.isStatusModalOpen.set(false);
  }

  applyPriceFilter(): void {
    this.filters.applyPriceOptions();
    this.isPriceModalOpen.set(false);
  }

  clearPriceFilter(): void {
    this.filters.clearPriceOptions();
    this.isPriceModalOpen.set(false);
  }

  applyDateFilter(): void {
    this.filters.applyDate();
    this.isDateModalOpen.set(false);
  }

  clearDateFilter(): void {
    this.filters.clearDate();
    this.isDateModalOpen.set(false);
  }

  resetDateFilter(): void {
    this.filters.resetDate();
    this.isDateModalOpen.set(false);
  }

  saveDateFilter(): void {
    this.filters.saveDate();
    this.isDateModalOpen.set(false);
  }
}
