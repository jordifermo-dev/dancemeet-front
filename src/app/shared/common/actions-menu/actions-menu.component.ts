import { Component, Input, signal } from '@angular/core';
import { IonButton, IonIcon, IonPopover } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { ellipsisVerticalOutline } from 'ionicons/icons';

export interface MenuAction {
  labelKey: string;
  icon: string;
  onClick: () => void;
  color?: 'danger';
  /** Same guard the equivalent on-screen button already uses (e.g.
   * isEventOver()/attendLoading()) - the menu must never offer an action the
   * direct button wouldn't currently allow. */
  disabled?: boolean;
  /** Small "+" corner badge on the icon, matching .add-photo-toolbar-button's
   * own badge (event-detail.page.scss) - for actions whose icon alone (e.g.
   * a bare camera) could otherwise read as "open"/"view" rather than "add". */
  iconBadge?: boolean;
}

/** Generic "⋮" action catalog - not tied to any one domain, unlike
 * ViewModeMenuComponent (list/calendar/gallery only). Same popover mechanics
 * as that component though (copied deliberately, not extended/inherited):
 * positioning off the click event itself rather than an id-matched trigger,
 * since Ionic keeps several instances of a given tab page alive off-screen,
 * where a fixed id could bind to another instance's button.
 *
 * The point of this menu isn't replacing the page's own buttons/pills - it's
 * cross-tab reach: e.g. event-detail's "Añadir al calendario" only lives in
 * the Información tab today, so reaching it while on Xat means switching
 * tabs first. This menu (living in the toolbar, visible regardless of which
 * tab is active) reuses the exact same handlers those buttons already call,
 * just reachable from anywhere on the page.
 *
 * `groups` (not a flat list) - a divider renders between each group, mirroring
 * however the equivalent buttons are already grouped/ordered on the page
 * itself (e.g. "Añadir al calendario"/"Compartir" in one row, "Eliminar
 * evento"/"Editar evento" in another) rather than one undifferentiated list. */
@Component({
  selector: 'app-actions-menu',
  standalone: true,
  templateUrl: './actions-menu.component.html',
  styleUrl: './actions-menu.component.scss',
  imports: [IonButton, IonIcon, IonPopover, TranslatePipe],
})
export class ActionsMenuComponent {
  @Input({ required: true }) groups!: MenuAction[][];

  readonly isOpen = signal(false);
  readonly popoverEvent = signal<Event | undefined>(undefined);

  /** Set by select(), fired from onDidDismiss() instead of immediately -
   * same fix as photo-lightbox.component.ts's own onCaptionTap/onDidDismiss:
   * firing an action that navigates (e.g. router.navigate) in the same tick
   * as requesting the popover close races its dismiss animation against the
   * page tearing down/replacing itself, which can orphan the popover's
   * overlay mid-animation - visible as a "ghost" menu still floating on top
   * of whatever page it just navigated to. Waiting for the real dismissal
   * first removes that race entirely. */
  private pendingAction: (() => void) | null = null;

  constructor() {
    addIcons({ ellipsisVerticalOutline });
  }

  openMenu(event: Event): void {
    this.popoverEvent.set(event);
    this.isOpen.set(true);
  }

  select(action: MenuAction): void {
    if (action.disabled) {
      return;
    }
    this.pendingAction = action.onClick;
    this.isOpen.set(false);
  }

  onDidDismiss(): void {
    this.isOpen.set(false);
    const action = this.pendingAction;
    this.pendingAction = null;
    action?.();
  }
}
