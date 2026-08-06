import { Component, Input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** One category inside a filter sheet ("Tipos de evento", "Disciplinas",
 * "Estado"...): its title + whatever content the caller projects (chip-grid,
 * min-selection warning...). Title size/weight is defined once here - this
 * is what was drifting between Explorer/Events' "Filtrar todo" page (1.1rem/
 * 800 h2) and Favorites/User-events/Notifications (0.78rem/600 p) before. */
@Component({
  selector: 'app-filter-section',
  standalone: true,
  templateUrl: './filter-section.component.html',
  styleUrl: './filter-section.component.scss',
  imports: [TranslatePipe],
})
export class FilterSectionComponent {
  @Input({ required: true }) titleKey!: string;
}
