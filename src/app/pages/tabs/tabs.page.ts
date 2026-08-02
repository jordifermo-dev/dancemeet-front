import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonLabel } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-tabs',
  standalone: true,
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonLabel, TranslatePipe],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
}
