import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

interface LegalSection {
  titleKey: string;
  bodyKey: string;
}

const SECTIONS: LegalSection[] = [
  { titleKey: 'termsOfUse.section1Title', bodyKey: 'termsOfUse.section1Body' },
  { titleKey: 'termsOfUse.section2Title', bodyKey: 'termsOfUse.section2Body' },
  { titleKey: 'termsOfUse.section3Title', bodyKey: 'termsOfUse.section3Body' },
  { titleKey: 'termsOfUse.section4Title', bodyKey: 'termsOfUse.section4Body' },
  { titleKey: 'termsOfUse.section5Title', bodyKey: 'termsOfUse.section5Body' },
  { titleKey: 'termsOfUse.section6Title', bodyKey: 'termsOfUse.section6Body' },
  { titleKey: 'termsOfUse.section7Title', bodyKey: 'termsOfUse.section7Body' },
  { titleKey: 'termsOfUse.section8Title', bodyKey: 'termsOfUse.section8Body' },
];

@Component({
  selector: 'app-terms-of-use',
  standalone: true,
  templateUrl: './terms-of-use.page.html',
  styleUrl: './terms-of-use.page.scss',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, TranslatePipe],
})
export class TermsOfUsePage {
  readonly sections = SECTIONS;
}
