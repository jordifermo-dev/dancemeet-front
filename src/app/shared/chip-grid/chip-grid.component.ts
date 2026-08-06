import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

export interface ChipGridItem {
  id: string;
  /** Pre-resolved plain text (e.g. discipline.name) - takes priority over labelKey. */
  label?: string;
  /** i18n key, translated inside the component so language switches stay live. */
  labelKey?: string;
  /** Icon as an image URL (disciplines/event types/status icons). */
  iconUrl?: string;
  /** Icon as an ionicon name, for chips that don't have a per-item image asset. */
  iconName?: string;
  selected: boolean;
  /** Shows a small "disabled" badge next to the label (e.g. muted notification types). */
  disabled?: boolean;
  disabledBadgeKey?: string;
}

@Component({
  selector: 'app-chip-grid',
  standalone: true,
  templateUrl: './chip-grid.component.html',
  styleUrl: './chip-grid.component.scss',
  imports: [IonIcon, TranslatePipe],
})
export class ChipGridComponent {
  @Input({ required: true }) items: ChipGridItem[] = [];
  /** Set to false for read-only display (e.g. viewing another user's selections). */
  @Input() interactive = true;
  @Output() readonly chipClick = new EventEmitter<string>();
}
