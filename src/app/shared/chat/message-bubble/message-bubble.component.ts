import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { happyOutline, ellipsisHorizontalOutline } from 'ionicons/icons';
import { ChatBubbleMessage, ChatBubbleReaction, ChatBubbleAttachedPhoto } from './message-bubble.model';
import { ReactionPickerComponent } from '../reaction-picker/reaction-picker.component';

/** One row of a xat's message list - shared by event-detail's group xat and
 * the 1:1 xat (direct-message.page.ts), extracted from what used to be
 * event-detail-only inline markup. Purely presentational: the host owns the
 * actual message list/state and every action here (react/reply/edit/delete/
 * open sender profile) is just an output - see this component's own outputs
 * for exactly which host method each one used to be wired to directly. */
@Component({
  selector: 'app-message-bubble',
  standalone: true,
  templateUrl: './message-bubble.component.html',
  styleUrl: './message-bubble.component.scss',
  imports: [IonIcon, TranslatePipe, ReactionPickerComponent],
})
export class MessageBubbleComponent {
  @Input({ required: true }) message!: ChatBubbleMessage;
  @Input() isMine = false;
  /** Only the first message of a consecutive run from the same sender shows
   * the avatar/name/time header - same grouping convention as Discord/Slack. */
  @Input() showHeader = true;
  @Input() timeLabel = '';
  @Input() quickReactions: string[] = [];
  /** At most one bubble in the whole list has this true at a time - the host
   * owns that single-selection state (see event-detail.page.ts's own
   * reactionPickerMessageId), not this component. */
  @Input() reactionPickerOpen = false;

  @Output() readonly senderTap = new EventEmitter<void>();
  @Output() readonly attachedPhotoTap = new EventEmitter<ChatBubbleAttachedPhoto>();
  @Output() readonly reactionPickerToggle = new EventEmitter<void>();
  @Output() readonly reactionPick = new EventEmitter<string>();
  @Output() readonly reactionChipToggle = new EventEmitter<ChatBubbleReaction>();
  @Output() readonly moreTap = new EventEmitter<void>();

  constructor() {
    addIcons({ happyOutline, ellipsisHorizontalOutline });
  }
}
