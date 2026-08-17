import { Component, computed, inject, model } from '@angular/core';
import { ChipGridComponent, ChipGridItem } from '../chip-grid/chip-grid.component';
import { LanguageService } from '../../services/language.service';
import { weekdayShortLabels } from '../event-calendar/calendar-date-utils';

/** Thin wrapper around the shared chip grid, seeded with the app's own
 * localized Mon-first short weekday labels (weekdayShortLabels - already
 * used by the calendar view's header row) so a recurrence rule's weekday
 * picker matches the rest of the app instead of hand-rolling its own L M X
 * J V S D chips. */
@Component({
  selector: 'app-weekday-picker',
  standalone: true,
  templateUrl: './weekday-picker.component.html',
  imports: [ChipGridComponent],
})
export class WeekdayPickerComponent {
  private readonly languageService = inject(LanguageService);

  /** 0=Monday..6=Sunday. */
  readonly selectedWeekdays = model.required<number[]>();

  readonly items = computed<ChipGridItem[]>(() => {
    const labels = weekdayShortLabels(this.languageService.currentLang());
    const selected = this.selectedWeekdays();
    return labels.map((label, index) => ({
      id: String(index),
      label,
      selected: selected.includes(index),
    }));
  });

  toggle(id: string): void {
    const index = Number(id);
    this.selectedWeekdays.update((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index].sort((a, b) => a - b),
    );
  }
}
