import { Component, EventEmitter, Output, input } from '@angular/core';
import { IonButton, IonIcon, IonModal } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { todayOutline, repeatOutline } from 'ionicons/icons';
import { FilterSheetHeaderComponent } from '../filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../filter-actions-row/filter-actions-row.component';

/** Shown instead of immediately toggling the heart when the event being
 * (un)favorited is part of a recurring series (has a seriesId) - lets the
 * host page ask "just this occurrence, or the whole series?" instead of
 * silently only ever affecting the one instance tapped. Purely presentational
 * (no FavoriteService call of its own) - each host page owns the isOpen
 * signal and does its own single-instance vs. whole-series API call from the
 * dayOnly/wholeSeries outputs, since each already has its own attend-busy
 * bookkeeping (attendBusyIds, attendedEventIds, etc.) this would otherwise
 * have to duplicate or reach back into. */
@Component({
  selector: 'app-series-attend-confirm',
  standalone: true,
  templateUrl: './series-attend-confirm.component.html',
  styleUrl: './series-attend-confirm.component.scss',
  imports: [IonModal, IonButton, IonIcon, TranslatePipe, FilterSheetHeaderComponent, FilterActionsRowComponent],
})
export class SeriesAttendConfirmComponent {
  constructor() {
    addIcons({ todayOutline, repeatOutline });
  }

  readonly isOpen = input.required<boolean>();
  /** true = the tap is un-attending (removing from favorites) - only changes
   * which title/body copy is shown, not which buttons are offered. */
  readonly removing = input(false);

  @Output() readonly dayOnly = new EventEmitter<void>();
  @Output() readonly wholeSeries = new EventEmitter<void>();
  @Output() readonly cancelled = new EventEmitter<void>();
}
