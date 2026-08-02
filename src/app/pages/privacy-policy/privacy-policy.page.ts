import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

interface LegalSection {
  titleKey: string;
  bodyKey: string;
}

const SECTIONS: LegalSection[] = [
  { titleKey: 'privacyPolicy.section1Title', bodyKey: 'privacyPolicy.section1Body' },
  { titleKey: 'privacyPolicy.section2Title', bodyKey: 'privacyPolicy.section2Body' },
  { titleKey: 'privacyPolicy.section3Title', bodyKey: 'privacyPolicy.section3Body' },
  { titleKey: 'privacyPolicy.section4Title', bodyKey: 'privacyPolicy.section4Body' },
  { titleKey: 'privacyPolicy.section5Title', bodyKey: 'privacyPolicy.section5Body' },
  { titleKey: 'privacyPolicy.section6Title', bodyKey: 'privacyPolicy.section6Body' },
  { titleKey: 'privacyPolicy.section7Title', bodyKey: 'privacyPolicy.section7Body' },
  { titleKey: 'privacyPolicy.section8Title', bodyKey: 'privacyPolicy.section8Body' },
];

/** Content is tailored to what the app actually does (see the User model and
 * NotificationService/GeocodingService) rather than generic boilerplate -
 * keep it in sync if the real data collected/used ever changes. */
@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  templateUrl: './privacy-policy.page.html',
  styleUrl: './privacy-policy.page.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, TranslatePipe],
})
export class PrivacyPolicyPage {
  readonly sections = SECTIONS;
}
