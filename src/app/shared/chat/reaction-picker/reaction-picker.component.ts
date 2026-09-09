import { Component, EventEmitter, Input, Output } from '@angular/core';

/** The quick-emoji bar that appears under a message when its "+" button is
 * tapped - a fixed set (not a free emoji picker), shared by event-chat and
 * the 1:1 xat (see MessageBubbleComponent, which hosts this internally).
 * Purely presentational - the host/MessageBubbleComponent decides when it's
 * visible and what picking an emoji actually does (add vs remove). */
@Component({
  selector: 'app-reaction-picker',
  standalone: true,
  template: `
    <div class="reaction-picker">
      @for (emoji of emojis; track emoji) {
        <button type="button" (click)="pick.emit(emoji)">{{ emoji }}</button>
      }
    </div>
  `,
  styleUrl: './reaction-picker.component.scss',
})
export class ReactionPickerComponent {
  @Input() emojis: string[] = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  @Output() readonly pick = new EventEmitter<string>();
}
