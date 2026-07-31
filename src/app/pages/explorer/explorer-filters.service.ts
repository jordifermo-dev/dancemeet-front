import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EVENT_STATUSES, EventStatus, PriceOption, UpdateUserPayload, User } from '../../models';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { DisciplineService } from '../../services/discipline.service';
import { EventTypeService } from '../../services/event-type.service';
import { MinSelectionWarningService } from '../../shared/min-selection-warning.service';
import { toggleWithMinimum } from '../../shared/min-selection';

export type DateQuickOption = 'today' | 'week' | 'weekend' | 'month';

const ALL_PRICE_OPTIONS: PriceOption[] = ['free', 'paid'];

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Shared filter state between the Explorer map page and the full
 * "Filtrar todo" page (they're really two views onto the same draft/applied
 * state), plus the location filter's distance/lat/lng.
 *
 * Explorer's filters are session-local: opening Explorer for the first time
 * after login seeds them from the user's profile, but from then on they only
 * change through explicit user action here - applying/clearing a filter
 * changes what's shown on the map only, it does NOT touch the profile. Two
 * explicit actions bridge back to the profile on purpose:
 *   - "Reestablecer filtros" (resetX()) discards local changes and re-pulls
 *     whatever's currently saved on the profile.
 *   - "Guardar filtros" (saveX()) writes the current selection back to the
 *     profile - only the category actually being saved (e.g. saving just the
 *     discipline filter leaves eventTypes/status/distance untouched).
 * The date range follows the same pattern via eventDateFrom/eventDateTo
 * on the profile - resetDate()/saveDate(). */
@Injectable({ providedIn: 'root' })
export class ExplorerFiltersService {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly disciplineService = inject(DisciplineService);
  private readonly eventTypeService = inject(EventTypeService);
  private readonly minSelectionWarning = inject(MinSelectionWarningService);
  private seededForUserId: string | null = null;

  readonly appliedDisciplineIds = signal<string[]>([]);
  readonly draftDisciplineIds = signal<string[]>([]);

  readonly appliedEventTypeIds = signal<string[]>([]);
  readonly draftEventTypeIds = signal<string[]>([]);

  readonly appliedStatuses = signal<EventStatus[]>(['published']);
  readonly draftStatuses = signal<EventStatus[]>(['published']);

  /** Not tied to any profile field - session-only, like Favorites' relation
   * filter. Defaults to both selected, i.e. no constraint. */
  readonly appliedPriceOptions = signal<PriceOption[]>([...ALL_PRICE_OPTIONS]);
  readonly draftPriceOptions = signal<PriceOption[]>([...ALL_PRICE_OPTIONS]);

  readonly appliedDistanceRange = signal(25);
  readonly draftDistanceRange = signal(25);

  readonly appliedLatitude = signal<number | null>(null);
  readonly appliedLongitude = signal<number | null>(null);
  readonly draftLatitude = signal<number | null>(null);
  readonly draftLongitude = signal<number | null>(null);

  readonly appliedCity = signal<string>('');
  readonly draftCity = signal<string>('');

  private readonly initialRange = this.quickDateRange('week');
  readonly appliedDateFrom = signal<number>(this.initialRange.from);
  readonly appliedDateTo = signal<number | undefined>(this.initialRange.to);
  readonly draftDateFrom = signal<number>(this.initialRange.from);
  readonly draftDateTo = signal<number | undefined>(this.initialRange.to);

  /** Whether the "at least one must stay selected" hint should show next to
   * the given category's chip-grid right now ('disciplines' | 'eventTypes' |
   * 'statuses'). */
  isMinSelectionWarningActive(key: string): boolean {
    return this.minSelectionWarning.isActive(key);
  }

  /** <ion-datetime> bindings for the "Desde"/"Hasta" calendar pickers - kept
   * as computed ISO strings so the templates don't need to convert. */
  readonly draftDateFromIso = computed(() => this.toDateOnlyIso(this.draftDateFrom()));
  readonly draftDateToIso = computed(() => {
    const to = this.draftDateTo();
    return to !== undefined ? this.toDateOnlyIso(to) : null;
  });

  constructor() {
    // Seeds once per login/user switch, not continuously - otherwise
    // unrelated profile activity (e.g. authService.syncProfile() called
    // after following someone) would silently overwrite in-progress local
    // filter changes. A real profile preference update while Explorer is
    // open is picked up next time the user presses "Reestablecer filtros".
    effect(() => {
      const user = this.authService.currentUser();
      if (user && user.id !== this.seededForUserId) {
        untracked(() => {
          this.seededForUserId = user.id;
          this.seedDisciplinesFromProfile(user);
          this.seedEventTypesFromProfile(user);
          this.seedStatusesFromProfile(user);
          this.seedLocationFromProfile(user);
          this.seedDateFromProfile(user);
        });
      } else if (!user) {
        this.seededForUserId = null;
      }
    });
  }

  /** Formats a timestamp as a local (not UTC) YYYY-MM-DD date, for binding to
   * an <ion-datetime> - toISOString() would shift the day across midnight
   * for any timezone ahead of UTC. */
  toDateOnlyIso(timestamp: number): string {
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Start of the given local date (00:00:00.000). */
  startOfDayFromIso(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  /** End of the given local date (23:59:59.999), so a "to" date still
   * includes events happening on that day. */
  endOfDayFromIso(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }

  /** "today" means from today onward with no upper bound (upcoming events),
   * not just the 24h window of today - only "week"/"weekend"/"month" are
   * bounded ranges. */
  quickDateRange(option: DateQuickOption): { from: number; to?: number } {
    const today = startOfToday();
    if (option === 'today') {
      return { from: today.getTime() };
    }
    if (option === 'week') {
      // Monday 00:00 through end of Sunday of the current week (today's
      // weekday, shifted back to that week's Monday), not "today + 7 days".
      const daysSinceMonday = (today.getDay() + 6) % 7;
      const monday = new Date(today);
      monday.setDate(monday.getDate() - daysSinceMonday);
      const from = monday.getTime();
      return { from, to: from + 7 * 24 * 60 * 60 * 1000 - 1 };
    }
    if (option === 'month') {
      // Day 1 00:00 through the last day of the current month, 23:59:59.999.
      const from = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
      const to = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      return { from, to };
    }
    // Upcoming Saturday 00:00 through end of Sunday.
    const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
    const saturday = new Date(today);
    saturday.setDate(saturday.getDate() + daysUntilSaturday);
    const from = saturday.getTime();
    return { from, to: from + 2 * 24 * 60 * 60 * 1000 - 1 };
  }

  // --- Date range (Desde/Hasta) -------------------------------------------

  /** Keeps "hasta" always on/after "desde" - shared by Explorer's full filter
   * page and Events' date modal, which both edit these draft signals
   * directly from their <ion-datetime> (ionChange) handlers. Whichever end
   * the user just touched wins; the other snaps to match instead of
   * silently allowing an inverted range that matches zero events. */
  setDraftDateFromIso(iso: string): void {
    const from = this.startOfDayFromIso(iso);
    this.draftDateFrom.set(from);
    const to = this.draftDateTo();
    if (to !== undefined && to < from) {
      this.draftDateTo.set(this.endOfDayFromIso(iso));
    }
  }

  setDraftDateToIso(iso: string): void {
    const to = this.endOfDayFromIso(iso);
    this.draftDateTo.set(to);
    if (to < this.draftDateFrom()) {
      this.draftDateFrom.set(this.startOfDayFromIso(iso));
    }
  }

  applyDate(): void {
    this.appliedDateFrom.set(this.draftDateFrom());
    this.appliedDateTo.set(this.draftDateTo());
  }

  /** Like clearLocation(), there's no "no filter" state for dates either -
   * clearing just goes back to the app's neutral baseline (this week),
   * regardless of what's saved as the profile default. */
  clearDate(): void {
    const { from, to } = this.quickDateRange('week');
    this.draftDateFrom.set(from);
    this.draftDateTo.set(to);
    this.appliedDateFrom.set(from);
    this.appliedDateTo.set(to);
  }

  resetDate(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.seedDateFromProfile(user);
    }
  }

  saveDate(): void {
    const from = this.draftDateFrom();
    const to = this.draftDateTo();
    this.appliedDateFrom.set(from);
    this.appliedDateTo.set(to);
    this.persistToProfile({ eventDateFrom: from, eventDateTo: to ?? null });
  }

  /** No saved eventDateFrom means the user never set a preference, so the
   * default is "this week" rather than an unbounded "today onward". */
  private seedDateFromProfile(user: User): void {
    if (user.eventDateFrom !== undefined && user.eventDateFrom !== null) {
      const from = user.eventDateFrom;
      const to = user.eventDateTo ?? undefined;
      this.appliedDateFrom.set(from);
      this.draftDateFrom.set(from);
      this.appliedDateTo.set(to);
      this.draftDateTo.set(to);
      return;
    }
    const { from, to } = this.quickDateRange('week');
    this.appliedDateFrom.set(from);
    this.draftDateFrom.set(from);
    this.appliedDateTo.set(to);
    this.draftDateTo.set(to);
  }

  // --- Disciplines ------------------------------------------------------

  toggleDraftDisciplineId(id: string): void {
    this.draftDisciplineIds.update((ids) =>
      toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('disciplines')),
    );
  }

  applyDisciplines(): void {
    this.appliedDisciplineIds.set(this.draftDisciplineIds());
  }

  /** There's no "no filter" state once an empty selection means "match
   * nothing" (see EventRepository.findFiltered) - "Eliminar filtro" selects
   * every available discipline instead, which is filter-equivalent to no
   * constraint at all. */
  clearDisciplines(allIds: string[]): void {
    this.draftDisciplineIds.set([...allIds]);
    this.appliedDisciplineIds.set([...allIds]);
  }

  resetDisciplines(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.seedDisciplinesFromProfile(user);
    }
  }

  saveDisciplines(): void {
    const ids = this.draftDisciplineIds();
    this.appliedDisciplineIds.set(ids);
    this.persistToProfile({ disciplineIds: ids });
  }

  /** No saved preference defaults to "every discipline" rather than an empty
   * selection, which would otherwise match zero events (see clearDisciplines()). */
  private seedDisciplinesFromProfile(user: User): void {
    const ids = [...(user.disciplineIds ?? [])];
    if (ids.length > 0) {
      this.appliedDisciplineIds.set(ids);
      this.draftDisciplineIds.set([...ids]);
      return;
    }
    this.disciplineService.getAll().subscribe({
      next: (disciplines) => {
        const allIds = disciplines.map((d) => d.id);
        this.appliedDisciplineIds.set(allIds);
        this.draftDisciplineIds.set([...allIds]);
      },
    });
  }

  // --- Event types --------------------------------------------------------

  toggleDraftEventTypeId(id: string): void {
    this.draftEventTypeIds.update((ids) =>
      toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('eventTypes')),
    );
  }

  applyEventTypes(): void {
    this.appliedEventTypeIds.set(this.draftEventTypeIds());
  }

  /** Same reasoning as clearDisciplines(): selects every event type instead
   * of none. */
  clearEventTypes(allIds: string[]): void {
    this.draftEventTypeIds.set([...allIds]);
    this.appliedEventTypeIds.set([...allIds]);
  }

  resetEventTypes(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.seedEventTypesFromProfile(user);
    }
  }

  saveEventTypes(): void {
    const ids = this.draftEventTypeIds();
    this.appliedEventTypeIds.set(ids);
    this.persistToProfile({ eventTypeIds: ids });
  }

  /** No saved preference defaults to "every event type" - see
   * seedDisciplinesFromProfile(). */
  private seedEventTypesFromProfile(user: User): void {
    const ids = [...(user.eventTypeIds ?? [])];
    if (ids.length > 0) {
      this.appliedEventTypeIds.set(ids);
      this.draftEventTypeIds.set([...ids]);
      return;
    }
    this.eventTypeService.getAll().subscribe({
      next: (eventTypes) => {
        const allIds = eventTypes.map((e) => e.id);
        this.appliedEventTypeIds.set(allIds);
        this.draftEventTypeIds.set([...allIds]);
      },
    });
  }

  // --- Status -------------------------------------------------------------

  toggleDraftStatusId(id: EventStatus): void {
    this.draftStatuses.update((ids) => toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('statuses')));
  }

  applyStatuses(): void {
    this.appliedStatuses.set(this.draftStatuses());
  }

  /** Same reasoning as clearDisciplines(): selects every status instead of
   * none. */
  clearStatuses(): void {
    this.draftStatuses.set([...EVENT_STATUSES]);
    this.appliedStatuses.set([...EVENT_STATUSES]);
  }

  resetStatuses(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.seedStatusesFromProfile(user);
    }
  }

  saveStatuses(): void {
    const statuses = this.draftStatuses();
    this.appliedStatuses.set(statuses);
    this.persistToProfile({ statusIds: statuses });
  }

  /** No saved preference defaults to just "published" (not every status),
   * matching what most users actually want to see. */
  private seedStatusesFromProfile(user: User): void {
    const statuses = (user.statusIds?.length ? [...user.statusIds] : ['published']) as EventStatus[];
    this.appliedStatuses.set(statuses);
    this.draftStatuses.set([...statuses]);
  }

  // --- Price (free/paid) --------------------------------------------------

  toggleDraftPriceOption(id: PriceOption): void {
    this.draftPriceOptions.update((ids) =>
      toggleWithMinimum(ids, id, () => this.minSelectionWarning.flash('priceOptions')),
    );
  }

  applyPriceOptions(): void {
    this.appliedPriceOptions.set(this.draftPriceOptions());
  }

  /** Same reasoning as clearDisciplines(): selects both options instead of
   * none, which is filter-equivalent to no constraint at all. */
  clearPriceOptions(): void {
    this.draftPriceOptions.set([...ALL_PRICE_OPTIONS]);
    this.appliedPriceOptions.set([...ALL_PRICE_OPTIONS]);
  }

  // --- Location (distance + lat/lng) --------------------------------------

  setDraftDistanceRange(value: number): void {
    this.draftDistanceRange.set(value);
  }

  setDraftLocation(latitude: number, longitude: number, city?: string): void {
    this.draftLatitude.set(latitude);
    this.draftLongitude.set(longitude);
    if (city !== undefined) {
      this.draftCity.set(city);
    }
  }

  applyLocation(): void {
    this.appliedDistanceRange.set(this.draftDistanceRange());
    this.appliedLatitude.set(this.draftLatitude());
    this.appliedLongitude.set(this.draftLongitude());
    this.appliedCity.set(this.draftCity());
  }

  /** There's no "no location" state for a geo search, so clearing this filter
   * just widens the radius to the max instead of leaving it empty. */
  clearLocation(): void {
    this.draftDistanceRange.set(100);
    this.appliedDistanceRange.set(100);
  }

  resetLocation(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.seedLocationFromProfile(user);
    }
  }

  saveLocation(): void {
    const distanceRange = this.draftDistanceRange();
    const latitude = this.draftLatitude();
    const longitude = this.draftLongitude();
    const city = this.draftCity();
    this.appliedDistanceRange.set(distanceRange);
    this.appliedLatitude.set(latitude);
    this.appliedLongitude.set(longitude);
    this.appliedCity.set(city);
    this.persistToProfile({
      distanceRange,
      ...(latitude !== null ? { latitude } : {}),
      ...(longitude !== null ? { longitude } : {}),
      ...(city ? { city } : {}),
    });
  }

  private seedLocationFromProfile(user: User): void {
    const distanceRange = user.distanceRange || 25;
    const latitude = user.latitude || null;
    const longitude = user.longitude || null;
    const city = user.city || '';
    this.appliedDistanceRange.set(distanceRange);
    this.draftDistanceRange.set(distanceRange);
    this.appliedLatitude.set(latitude);
    this.draftLatitude.set(latitude);
    this.appliedLongitude.set(longitude);
    this.draftLongitude.set(longitude);
    this.appliedCity.set(city);
    this.draftCity.set(city);
  }

  // --- Full "Filtrar todo" page (discipline + eventType + status + date) --

  applyAll(): void {
    this.appliedDisciplineIds.set(this.draftDisciplineIds());
    this.appliedEventTypeIds.set(this.draftEventTypeIds());
    this.appliedStatuses.set(this.draftStatuses());
    this.appliedPriceOptions.set(this.draftPriceOptions());
    this.appliedDateFrom.set(this.draftDateFrom());
    this.appliedDateTo.set(this.draftDateTo());
  }

  /** Same reasoning as clearDisciplines()/clearEventTypes(): selects every
   * discipline/event type/status/price option instead of none, since empty
   * means "match nothing" everywhere search is built from these. */
  clearAll(allDisciplineIds: string[], allEventTypeIds: string[]): void {
    this.draftDisciplineIds.set([...allDisciplineIds]);
    this.appliedDisciplineIds.set([...allDisciplineIds]);
    this.draftEventTypeIds.set([...allEventTypeIds]);
    this.appliedEventTypeIds.set([...allEventTypeIds]);
    this.draftStatuses.set([...EVENT_STATUSES]);
    this.appliedStatuses.set([...EVENT_STATUSES]);
    this.draftPriceOptions.set([...ALL_PRICE_OPTIONS]);
    this.appliedPriceOptions.set([...ALL_PRICE_OPTIONS]);
    const { from, to } = this.quickDateRange('week');
    this.draftDateFrom.set(from);
    this.draftDateTo.set(to);
    this.appliedDateFrom.set(from);
    this.appliedDateTo.set(to);
  }

  /** Resets discipline/eventType/status/date to whatever's saved on the
   * profile - distance/location are a separate screen with their own reset/save. */
  resetAll(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.seedDisciplinesFromProfile(user);
      this.seedEventTypesFromProfile(user);
      this.seedStatusesFromProfile(user);
      this.seedDateFromProfile(user);
    }
  }

  /** Saves discipline/eventType/status/date together. */
  saveAll(): void {
    const disciplineIds = this.draftDisciplineIds();
    const eventTypeIds = this.draftEventTypeIds();
    const statuses = this.draftStatuses();
    const dateFrom = this.draftDateFrom();
    const dateTo = this.draftDateTo();
    this.appliedDisciplineIds.set(disciplineIds);
    this.appliedEventTypeIds.set(eventTypeIds);
    this.appliedStatuses.set(statuses);
    this.appliedDateFrom.set(dateFrom);
    this.appliedDateTo.set(dateTo);
    this.persistToProfile({
      disciplineIds,
      eventTypeIds,
      statusIds: statuses,
      eventDateFrom: dateFrom,
      eventDateTo: dateTo ?? null,
    });
  }

  syncDraftFromApplied(): void {
    this.draftDisciplineIds.set([...this.appliedDisciplineIds()]);
    this.draftEventTypeIds.set([...this.appliedEventTypeIds()]);
    this.draftStatuses.set([...this.appliedStatuses()]);
    this.draftPriceOptions.set([...this.appliedPriceOptions()]);
    this.draftDateFrom.set(this.appliedDateFrom());
    this.draftDateTo.set(this.appliedDateTo());
  }

  /** Writes the given fields back to the user's profile - only ever called
   * from an explicit "Guardar filtros" action, never automatically. */
  private persistToProfile(payload: UpdateUserPayload): void {
    const user = this.authService.currentUser();
    if (!user) {
      return;
    }
    firstValueFrom(this.userService.updateUser(user.id, payload)).then(() => {
      if (this.authService.currentUser()?.id === user.id) {
        this.authService.syncProfile({ ...user, ...payload });
      }
    });
  }
}
