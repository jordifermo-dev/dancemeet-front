import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon, IonTextarea } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline, sendOutline, checkmarkOutline } from 'ionicons/icons';

/** The banner shown above the input when the compose bar is in a special
 * state - editing an existing message, replying to one, or (event-chat only)
 * mentioning a gallery photo. Mutually exclusive - the host owns which one
 * (if any) is currently active, same as event-detail.page.ts always did. */
export interface ChatComposeBanner {
  text: string;
  thumbnailUrl?: string;
}

/** The message input row (+ optional banner above it) shared by event-chat
 * and the 1:1 xat - extracted from what used to be event-detail-only inline
 * footer markup. The host still owns the actual draft text/send/typing
 * logic (each socket service differs) - this component is just the input
 * field, the send button and the banner, wired up via outputs. */
@Component({
  selector: 'app-chat-compose-bar',
  standalone: true,
  templateUrl: './chat-compose-bar.component.html',
  styleUrl: './chat-compose-bar.component.scss',
  imports: [IonIcon, IonTextarea, TranslatePipe],
})
export class ChatComposeBarComponent {
  @Input() draft = '';
  @Input() placeholder = '';
  @Input() banner: ChatComposeBanner | null = null;
  /** Swaps the send icon for a confirm-edit checkmark - the compose bar
   * reuses the same input for editing rather than a separate inline-edit UI
   * (see event-detail.page.ts's own startEditMessage doc comment). */
  @Input() editing = false;
  @Input() sendDisabled = false;

  @Output() readonly draftChange = new EventEmitter<string>();
  @Output() readonly send = new EventEmitter<void>();
  @Output() readonly bannerCancel = new EventEmitter<void>();

  constructor() {
    addIcons({ closeOutline, sendOutline, checkmarkOutline });
  }
}
