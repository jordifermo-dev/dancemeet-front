import { Component, model } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CalendarGranularity } from './event-calendar.model';

/** Mes/Semana/Día pill row - split out from <app-event-calendar> itself so
 * the host page can drop it into its own real `slot="fixed"` top-overlay
 * (the same mechanism the search bar/filter pills already use) instead of a
 * hand-rolled CSS `position: sticky`, which turned out unreliable once the
 * calendar's own scrollable content pushed past it (the two elements
 * fighting over the same page-scroll offset let the grid visibly scroll
 * through/behind it rather than staying pinned). Two-way bound to the host
 * page's own granularity signal, which it also feeds into
 * `<app-event-calendar>`'s `[granularity]` input to keep the grid in sync. */
@Component({
  selector: 'app-calendar-granularity-toggle',
  standalone: true,
  templateUrl: './calendar-granularity-toggle.component.html',
  styleUrl: './calendar-granularity-toggle.component.scss',
  imports: [TranslatePipe],
})
export class CalendarGranularityToggleComponent {
  readonly granularity = model.required<CalendarGranularity>();

  select(value: CalendarGranularity): void {
    this.granularity.set(value);
  }
}
