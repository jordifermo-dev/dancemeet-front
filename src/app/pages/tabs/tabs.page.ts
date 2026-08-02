import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonLabel } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { WelcomeModalComponent } from '../../shared/welcome-modal/welcome-modal.component';

@Component({
  selector: 'app-tabs',
  standalone: true,
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonLabel, TranslatePipe, WelcomeModalComponent],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
}
