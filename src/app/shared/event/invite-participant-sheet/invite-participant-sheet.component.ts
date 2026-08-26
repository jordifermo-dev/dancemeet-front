import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonModal, IonToggle } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline } from 'ionicons/icons';
import { ChatHistoryAccess, EventManagerRole } from '../../../models';
import { FilterSheetHeaderComponent } from '../../filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../filters/filter-actions-row/filter-actions-row.component';

/** Small confirmation step inserted before an invite actually goes out (see
 * follow-list.page.ts's inviteActionsFor) - lets the inviter choose whether
 * the new participant gets the xat's full history or only messages from
 * the moment they accept. A plain Sí/No confirm dialog would have been
 * misleading here (it reads as "are you sure?", not "pick an option"), so
 * this is its own small sheet with a real ion-toggle instead - same
 * component/style already used for Profile's privacy toggles and the
 * event form's own allowAttendeePhotos toggle. */
@Component({
  selector: 'app-invite-participant-sheet',
  standalone: true,
  templateUrl: './invite-participant-sheet.component.html',
  styleUrl: './invite-participant-sheet.component.scss',
  imports: [IonModal, IonToggle, IonItem, IonButton, IonIcon, TranslatePipe, FilterSheetHeaderComponent, FilterActionsRowComponent],
})
export class InviteParticipantSheetComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() userName = '';
  @Input({ required: true }) role!: EventManagerRole;
  @Output() readonly confirmed = new EventEmitter<ChatHistoryAccess>();
  @Output() readonly cancelled = new EventEmitter<void>();

  /** Starting point only, not a hard rule - a co-organizer probably should
   * see everything, a plain attendee probably shouldn't, but the inviter can
   * always flip it before confirming. */
  readonly fullHistory = signal(true);

  constructor() {
    addIcons({ checkmarkOutline, closeOutline });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.fullHistory.set(this.role === 'manager');
    }
  }

  onToggleChange(checked: boolean): void {
    this.fullHistory.set(checked);
  }

  confirm(): void {
    this.confirmed.emit(this.fullHistory() ? 'full' : 'fromJoin');
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
