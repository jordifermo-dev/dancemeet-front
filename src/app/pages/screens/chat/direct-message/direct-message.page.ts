import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonButton,
  IonSpinner,
  IonModal,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { arrowUndoOutline, copyOutline, createOutline, trashOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';
import { AuthService } from '../../../../services/core/auth.service';
import { LanguageService } from '../../../../services/core/language.service';
import { DirectMessageService } from '../../../../services/chat/direct-message.service';
import { DirectMessageSocketService } from '../../../../services/chat/direct-message-socket.service';
import { EventListRefreshService } from '../../../../services/event/event-list-refresh.service';
import { ConversationDetailed, DirectMessage, MessageReactionSummary } from '../../../../models';
import { formatEventDateOnly, formatTimeOnly, isSameDay } from '../../../../shared/calendar/event-date-format';
import { MessageBubbleComponent } from '../../../../shared/chat/message-bubble/message-bubble.component';
import { ChatComposeBarComponent, ChatComposeBanner } from '../../../../shared/chat/chat-compose-bar/chat-compose-bar.component';
import { FilterSheetHeaderComponent } from '../../../../shared/filters/filter-sheet-header/filter-sheet-header.component';
import { FilterActionsRowComponent } from '../../../../shared/filters/filter-actions-row/filter-actions-row.component';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface ChatDisplayItem {
  message: DirectMessage;
  isMine: boolean;
  showHeader: boolean;
  dateSeparatorLabel: string | null;
}

/** The 1:1 xat screen - mirrors event-detail's xat tab (same message-bubble/
 * compose-bar components, same interaction model), but as its own standalone
 * page rather than a tab within a bigger detail page, since a conversation
 * has no other content to sit alongside (see 15_tab-chats-implementacion.md,
 * Punto 5). */
@Component({
  selector: 'app-direct-message',
  standalone: true,
  templateUrl: './direct-message.page.html',
  styleUrl: './direct-message.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonFooter,
    IonIcon,
    IonButton,
    IonSpinner,
    IonModal,
    TranslatePipe,
    MessageBubbleComponent,
    ChatComposeBarComponent,
    FilterSheetHeaderComponent,
    FilterActionsRowComponent,
  ],
})
export class DirectMessagePage implements ViewWillEnter, ViewWillLeave {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly directMessageService = inject(DirectMessageService);
  private readonly socketService = inject(DirectMessageSocketService);
  private readonly refreshNotifier = inject(EventListRefreshService);

  private readonly ionContentRef = viewChild(IonContent);

  readonly conversation = signal<ConversationDetailed | null>(null);
  readonly loading = signal(true);

  readonly quickReactions = QUICK_REACTIONS;
  readonly chatDraft = signal('');
  readonly reactionPickerMessageId = signal<string | null>(null);
  readonly replyingTo = signal<DirectMessage | null>(null);
  readonly editingMessageId = signal<string | null>(null);
  readonly messageActionsFor = signal<DirectMessage | null>(null);
  readonly confirmDeleteMessage = signal<DirectMessage | null>(null);

  private connectedForConversationId: string | null = null;

  readonly chatDisplayItems = computed<ChatDisplayItem[]>(() => {
    const me = this.authService.currentUser();
    const messages = this.socketService.messages();
    const lang = this.languageService.currentLang();
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      return {
        message,
        isMine: message.senderId === me?.id,
        showHeader: !previous || previous.senderId !== message.senderId,
        dateSeparatorLabel:
          !previous || !isSameDay(previous.createdAt, message.createdAt) ? formatEventDateOnly(message.createdAt, lang) : null,
      };
    });
  });

  readonly chatTypingLabel = computed(() => {
    if (!this.socketService.typingPeer()) {
      return '';
    }
    return this.translate.instant('chat.typingOne', { name: this.conversation()?.peerName ?? '' });
  });

  /** A pending request only shows its accept/decline banner to the person
   * who *didn't* start it - the requester just sees their own message
   * waiting, same as an event join request. */
  readonly showRequestBanner = computed(() => {
    const conversation = this.conversation();
    return !!conversation && conversation.status === 'pending' && conversation.requestedBy !== this.authService.currentUser()?.id;
  });

  readonly chatComposeBanner = computed<ChatComposeBanner | null>(() => {
    if (this.editingMessageId()) {
      return { text: this.translate.instant('chat.editingBanner') };
    }
    const replying = this.replyingTo();
    if (replying) {
      return { text: this.translate.instant('chat.replyingTo', { name: replying.senderName }) };
    }
    return null;
  });

  constructor() {
    addIcons({ arrowUndoOutline, copyOutline, createOutline, trashOutline, checkmarkOutline, closeOutline });

    // Same "wait for this tick's items to paint" scroll-pinning as
    // event-detail.page.ts's own chatDisplayItems effect. Also bumps the
    // Chats tab's refresh signal on every change here (sent, received,
    // edited, deleted, reacted) - ionViewWillEnter alone doesn't reliably
    // re-fire there on a plain back-navigation into an already-instantiated
    // tab (see EventListRefreshService's own doc comment), so without this
    // the inbox kept showing a stale preview/order until a hard tab-switch.
    effect(() => {
      const items = this.chatDisplayItems();
      if (items.length) {
        setTimeout(() => this.ionContentRef()?.scrollToBottom(0), 0);
      }
      this.refreshNotifier.notifyChanged();
    });
  }

  ionViewWillEnter(): void {
    const conversationId = this.route.snapshot.paramMap.get('conversationId');
    if (!conversationId) {
      return;
    }
    this.loading.set(true);
    this.directMessageService.getConversation(conversationId).subscribe({
      next: (conversation) => {
        this.conversation.set(conversation);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        void this.router.navigate(['/tabs/chats']);
      },
    });
    if (this.connectedForConversationId === conversationId) {
      return;
    }
    this.connectedForConversationId = conversationId;
    this.socketService.connect().then(() => {
      this.socketService.joinConversation(conversationId);
      this.socketService.markRead();
      this.directMessageService.getMessages(conversationId).subscribe({
        next: (history) => this.socketService.setInitialHistory(history),
      });
    });
  }

  ionViewWillLeave(): void {
    this.socketService.disconnect();
    this.connectedForConversationId = null;
  }

  chatMessageTime(message: DirectMessage): string {
    return formatTimeOnly(message.createdAt, this.languageService.currentLang());
  }

  onChatDraftChange(value: string): void {
    this.chatDraft.set(value);
    if (value.trim()) {
      this.socketService.sendTyping();
    } else {
      this.socketService.sendStopTyping();
    }
  }

  sendChatMessage(): void {
    const text = this.chatDraft().trim();
    if (!text) {
      return;
    }
    const editingId = this.editingMessageId();
    if (editingId) {
      this.socketService.editMessage(editingId, text);
      this.editingMessageId.set(null);
      this.chatDraft.set('');
      return;
    }
    this.socketService.sendMessage(text, this.replyingTo()?.id);
    this.socketService.sendStopTyping();
    this.chatDraft.set('');
    this.replyingTo.set(null);
  }

  onChatBannerCancel(): void {
    if (this.editingMessageId()) {
      this.cancelEditMessage();
    } else if (this.replyingTo()) {
      this.cancelReply();
    }
  }

  openMessageActions(message: DirectMessage): void {
    this.messageActionsFor.set(message);
  }

  closeMessageActions(): void {
    this.messageActionsFor.set(null);
  }

  replyToMessage(message: DirectMessage): void {
    this.editingMessageId.set(null);
    this.replyingTo.set(message);
    this.messageActionsFor.set(null);
  }

  cancelReply(): void {
    this.replyingTo.set(null);
  }

  async copyMessageText(message: DirectMessage): Promise<void> {
    this.messageActionsFor.set(null);
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(message.text);
    }
  }

  startEditMessage(message: DirectMessage): void {
    this.replyingTo.set(null);
    this.editingMessageId.set(message.id);
    this.chatDraft.set(message.text);
    this.messageActionsFor.set(null);
  }

  cancelEditMessage(): void {
    this.editingMessageId.set(null);
    this.chatDraft.set('');
  }

  requestDeleteMessage(message: DirectMessage): void {
    this.messageActionsFor.set(null);
    this.confirmDeleteMessage.set(message);
  }

  cancelDeleteMessage(): void {
    this.confirmDeleteMessage.set(null);
  }

  deleteMessageConfirmed(): void {
    const message = this.confirmDeleteMessage();
    if (!message) {
      return;
    }
    this.socketService.deleteMessage(message.id);
    this.confirmDeleteMessage.set(null);
  }

  isOwnChatMessage(message: DirectMessage): boolean {
    return message.senderId === this.authService.currentUser()?.id;
  }

  toggleReactionPicker(messageId: string): void {
    this.reactionPickerMessageId.update((current) => (current === messageId ? null : messageId));
  }

  pickReaction(messageId: string, emoji: string): void {
    const message = this.socketService.messages().find((m) => m.id === messageId);
    const alreadyReacted = message?.reactions.some((r) => r.emoji === emoji && r.reactedByMe);
    if (alreadyReacted) {
      this.socketService.removeReaction(messageId, emoji);
    } else {
      this.socketService.reactToMessage(messageId, emoji);
    }
    this.reactionPickerMessageId.set(null);
  }

  toggleReactionChip(messageId: string, reaction: MessageReactionSummary): void {
    if (reaction.reactedByMe) {
      this.socketService.removeReaction(messageId, reaction.emoji);
    } else {
      this.socketService.reactToMessage(messageId, reaction.emoji);
    }
  }

  acceptRequest(): void {
    const conversation = this.conversation();
    if (!conversation) {
      return;
    }
    this.directMessageService.acceptConversation(conversation.id).subscribe({
      next: () => this.conversation.update((current) => (current ? { ...current, status: 'accepted' } : current)),
    });
  }

  declineRequest(): void {
    const conversation = this.conversation();
    if (!conversation) {
      return;
    }
    this.directMessageService.declineConversation(conversation.id).subscribe({
      next: () => void this.router.navigate(['/tabs/chats']),
    });
  }
}
