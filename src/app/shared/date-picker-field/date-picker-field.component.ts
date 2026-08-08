import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { IonButton, IonDatetime, IonIcon, IonModal } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline } from 'ionicons/icons';
import { LanguageService } from '../../services/language.service';
import { formatEventDateOnly } from '../event-date-format';
import { FilterSheetHeaderComponent } from '../filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../filter-actions-row/filter-actions-row.component';

/** A single Desde/Hasta date field: a plain button showing the picked date
 * (or an "unset" placeholder), opening a controlled ion-modal calendar with
 * Cancelar/Aplicar to pick a new one. Replaces <ion-datetime-button>, used
 * to be the native trigger everywhere a date filter shows one - its native
 * dropdown popup is drawn by the browser itself (not app CSS) and can render
 * clipped near a screen edge or inside a scrolling container, the same
 * reliability problem event-detail.page.ts's own date/time pickers hit
 * earlier and fixed the same way. Forwards ion-datetime's own ionChange
 * event untouched via dateChange, so callers can keep using whatever
 * (event: Event) => void handler they already had wired to their old
 * <ion-datetime>. */
@Component({
  selector: 'app-date-picker-field',
  standalone: true,
  templateUrl: './date-picker-field.component.html',
  styleUrl: './date-picker-field.component.scss',
  imports: [IonModal, IonDatetime, IonButton, IonIcon, TranslatePipe, FilterSheetHeaderComponent, FilterActionsRowComponent],
})
export class DatePickerFieldComponent {
  private readonly languageService = inject(LanguageService);

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  /** Seed timestamp - the date the calendar opens on. When isUnset is true
   * this still needs to be a real timestamp (e.g. Date.now() or the paired
   * "desde" value) purely to seed the picker; it's never shown. */
  @Input({ required: true }) value!: number;
  /** Shows unsetLabel instead of the formatted value (e.g. Favorites/Events'
   * "Hasta: sin límite" placeholder for an unbounded date range). */
  @Input() isUnset = false;
  @Input() unsetLabel = '';
  @Input({ required: true }) titleKey!: string;
  @Output() readonly dateChange = new EventEmitter<Event>();

  readonly isOpen = signal(false);
  readonly valueIso = computed(() => new Date(this.value).toISOString());
  readonly label = computed(() => formatEventDateOnly(this.value, this.languageService.currentLang()));

  onChange(ev: Event): void {
    this.dateChange.emit(ev);
  }
}
