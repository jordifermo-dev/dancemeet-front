import { Component, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { IonModal, IonIcon, IonButton } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  ellipseOutline,
  bulbOutline,
  cameraOutline,
  chevronBackOutline,
  chevronForwardOutline,
  checkmarkOutline,
} from 'ionicons/icons';
import { OnboardingService } from '../../services/onboarding.service';
import { LanguageService } from '../../services/language.service';
import { EventCardComponent } from '../event-card/event-card.component';
import { FilterSheetHeaderComponent } from '../filter-sheet-header/filter-sheet-header.component';
import { EventCardView } from '../event-card/event-card.model';
import { DISCIPLINE_ICON_FILES, EVENT_TYPE_ICON_FILES, STATUS_ICON_FILES, STATUS_LABEL_KEYS } from '../icon-catalog';
import { mapEmbedUrl } from '../maps';
import { DISCIPLINE_NAMES, EVENT_STATUSES, EVENT_TYPE_NAMES } from '../../models';

// Central Barcelona - a real, recognizable place, at a zoom wide enough to
// show a real chunk of the metro area (matching the reference screenshot),
// not a single tight block.
const EXPLORER_MAP_LAT = 41.3874;
const EXPLORER_MAP_LNG = 2.1686;
const EXPLORER_MAP_ZOOM = 11;

export type WelcomeSlideKind = 'explorer' | 'events' | 'favorites' | 'profile' | 'tips';

interface WelcomeSlide {
  kind: WelcomeSlideKind;
  icon: string;
  titleKey: string;
  descriptionKey: string;
}

const SLIDES: WelcomeSlide[] = [
  { kind: 'explorer', icon: 'assets/icons/tabs/explorer.svg', titleKey: 'welcome.exploreTitle', descriptionKey: 'welcome.exploreBody' },
  { kind: 'events', icon: 'assets/icons/tabs/events.svg', titleKey: 'welcome.eventsTitle', descriptionKey: 'welcome.eventsBody' },
  { kind: 'favorites', icon: 'assets/icons/tabs/favorites.svg', titleKey: 'welcome.favoritesTitle', descriptionKey: 'welcome.favoritesBody' },
  { kind: 'profile', icon: 'assets/icons/tabs/profile.svg', titleKey: 'welcome.profileTitle', descriptionKey: 'welcome.profileBody' },
  { kind: 'tips', icon: '', titleKey: 'welcome.tipsTitle', descriptionKey: 'welcome.tipsSubtitle' },
];

/** Renders through the real <app-event-card>, so the tour always matches
 * whatever that component actually looks like - image, organizer, tags,
 * date/address, price - instead of a hand-drawn stand-in that drifts out of
 * sync the next time event-card changes. Icons point at the app's real
 * discipline/event-type/status assets (see icon-catalog.ts); the photo uses
 * picsum.photos, the same placeholder-photo service the app's own seed
 * events use for imageUrl. */
function demoEventCard(
  id: string,
  photoId: number,
  title: string,
  creatorName: string,
  disciplineName: keyof typeof DISCIPLINE_ICON_FILES,
  eventTypeName: keyof typeof EVENT_TYPE_ICON_FILES,
  dateLabel: string,
  address: string,
  city: string,
  isFree: boolean,
  price: number,
  relationLabelKey?: string,
): EventCardView {
  return {
    isOwnEvent: relationLabelKey === 'favorites.relationCreatorBadge',
    // Organizing an event means attending it too (the backend creates a real
    // Favorite record for the creator on createEvent()), so the heart shows
    // filled for both demo cards, not just the attendee one.
    isAttending: relationLabelKey === 'favorites.relationCreatorBadge' || relationLabelKey === 'favorites.relationFavoriteBadge',
    id,
    imageUrl: `https://picsum.photos/1200/800?${photoId}`,
    title,
    creatorId: 'demo',
    creatorName,
    creatorProfileLink: ['/users', 'demo'],
    eventTypeTags: [{ name: eventTypeName, iconUrl: `/assets/icons/eventtypes/${EVENT_TYPE_ICON_FILES[eventTypeName]}` }],
    disciplineTags: [{ name: disciplineName, iconUrl: `/assets/icons/disciplines/${DISCIPLINE_ICON_FILES[disciplineName]}` }],
    status: 'published',
    statusLabelKey: STATUS_LABEL_KEYS['published'],
    statusIconUrl: `/assets/icons/status/${STATUS_ICON_FILES['published']}`,
    dateLabel,
    address,
    city,
    isFree,
    price,
    isFaded: false,
    relationLabelKey,
    // Derived from relationLabelKey - this is what actually drives the
    // badge's color (see event-card.component.scss's .tag-relation-* rules
    // and EventCardView.relation's own doc comment); relationLabelKey alone
    // only supplies the text, so without this the demo badges rendered
    // colorless instead of matching the real event-card ones.
    relation:
      relationLabelKey === 'favorites.relationCreatorBadge'
        ? 'creator'
        : relationLabelKey === 'favorites.relationFavoriteBadge'
          ? 'favorite'
          : undefined,
  };
}

// Invented data throughout (names, places, titles) - purely illustrative,
// not tied to any real user or event.
const DEMO_CARDS = {
  eventsRockRoll: demoEventCard(
    'demo-events-1', 21, 'Rock&Roll Bàsic', 'Kevin Torres', 'Rock&Roll', 'Curso',
    'Sáb 18:00 - 20:00', 'Carrer Major 10', 'Vilanova i la Geltrú', true, 0,
  ),
  eventsHipHop: demoEventCard(
    'demo-events-2', 22, 'Hip-Hop Cypher Jam', 'Laura Ferrer', 'Hip-Hop', 'Jam',
    'Dom 19:00 - 21:00', 'Avinguda Diagonal 220', 'Barcelona', false, 5,
  ),
  favoriteOrganizer: demoEventCard(
    'demo-fav-1', 23, 'Swing Night al Passeig', 'Jordina', 'Swing', 'Party',
    'Vie 22:00 - 23:30', 'Passeig de Gràcia 45', 'Barcelona', true, 0,
    'favorites.relationCreatorBadge',
  ),
  favoriteAttendee: demoEventCard(
    'demo-fav-2', 24, 'Hip-Hop Battle', 'Aisha Khan', 'Hip-Hop', 'Competición',
    'Dis 19:00 - 22:00', 'Rambla Sant Francesc 8', 'Vilafranca del Penedès', false, 6,
    'favorites.relationFavoriteBadge',
  ),
};

// Profile's real "Preferences" section (event types / disciplines / statuses
// / language chips) - same real icons/labels as profile.page.html, with a
// plausible subset pre-selected just for illustration.
const SELECTED_EVENT_TYPES = new Set(['Curso', 'Taller', 'Jam']);
const PROFILE_EVENT_TYPES = EVENT_TYPE_NAMES.map((name) => ({
  name,
  iconUrl: `/assets/icons/eventtypes/${EVENT_TYPE_ICON_FILES[name]}`,
  selected: SELECTED_EVENT_TYPES.has(name),
}));

const SELECTED_DISCIPLINES = new Set(['Swing', 'Rock&Roll']);
const PROFILE_DISCIPLINES = DISCIPLINE_NAMES.map((name) => ({
  name,
  iconUrl: `/assets/icons/disciplines/${DISCIPLINE_ICON_FILES[name]}`,
  selected: SELECTED_DISCIPLINES.has(name),
}));

const PROFILE_STATUSES = EVENT_STATUSES.map((id) => ({
  id,
  iconUrl: `/assets/icons/status/${STATUS_ICON_FILES[id]}`,
  labelKey: STATUS_LABEL_KEYS[id],
  selected: id === 'published',
}));

// Same native-name-always behavior as the real Profile page (LANGUAGE_NATIVE_NAMES
// in profile.page.ts) - a language's own name doesn't translate, so someone who
// switched language by mistake can still recognize their own.
const PROFILE_LANGUAGE_LABELS: Record<string, string> = { es: 'Español', ca: 'Català', en: 'English' };
const PROFILE_LANGUAGE_CODES = ['ca', 'en', 'es'];

/** Explorer's real map marks each event with its discipline icon (see
 * buildDisciplineMarkerIcon in explorer.page.ts) - these mimic that with a
 * handful of scattered badges over the real map instead of live markers.
 * Kept to the map's left/upper half (inland Barcelonès) - the coastline
 * runs roughly bottom-left to top-right at this center/zoom, so anything
 * further right/down would land in the sea. */
const EXPLORER_MAP_PINS = (['Swing', 'Rock&Roll', 'Hip-Hop', 'Swing'] as const).map((disciplineName, index) => ({
  iconUrl: `/assets/icons/disciplines/${DISCIPLINE_ICON_FILES[disciplineName]}`,
  left: [15, 32, 46, 22][index],
  top: [22, 40, 28, 62][index],
}));

/** First-run "how the app works" tour - one slide per tab, each with a
 * mockup preview of that screen. See OnboardingService for when it opens.
 * The close (X) and "don't show again" toggle stay visible on every slide,
 * per the user's request, instead of being tucked away as a single checkbox
 * only reachable from the last step. */
@Component({
  selector: 'app-welcome-modal',
  standalone: true,
  templateUrl: './welcome-modal.component.html',
  styleUrl: './welcome-modal.component.scss',
  imports: [IonModal, IonIcon, IonButton, TranslatePipe, EventCardComponent, FilterSheetHeaderComponent],
})
export class WelcomeModalComponent {
  private readonly onboarding = inject(OnboardingService);
  private readonly languageService = inject(LanguageService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly isOpen = this.onboarding.isWelcomeModalOpen;
  // Real Google Maps tiles (Maps Embed API, same helper as event-detail's/
  // user-detail's location preview) - a CSS-drawn stand-in never looked
  // convincingly like an actual map, so this uses the real thing instead.
  readonly explorerMapUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    mapEmbedUrl(EXPLORER_MAP_LAT, EXPLORER_MAP_LNG, EXPLORER_MAP_ZOOM, 'roadmap'),
  );
  readonly demoCards = DEMO_CARDS;
  readonly explorerMapPins = EXPLORER_MAP_PINS;
  readonly profileEventTypes = PROFILE_EVENT_TYPES;
  readonly profileDisciplines = PROFILE_DISCIPLINES;
  readonly profileStatuses = PROFILE_STATUSES;
  // Selection still follows the active language - only the labels themselves
  // stay native-name-always, matching the real Profile page.
  readonly profileLanguages = computed(() => {
    const current = this.languageService.currentLang();
    return PROFILE_LANGUAGE_CODES.map((code) => ({
      code,
      label: PROFILE_LANGUAGE_LABELS[code],
      selected: code === current,
    }));
  });
  readonly slides = SLIDES;
  readonly totalSlides = SLIDES.length;
  readonly currentSlide = signal(0);
  readonly dontShowAgain = signal(false);

  constructor() {
    addIcons({
      checkmarkCircle,
      ellipseOutline,
      bulbOutline,
      cameraOutline,
      chevronBackOutline,
      chevronForwardOutline,
      checkmarkOutline,
    });
    // Every fresh open starts at slide 1, unchecked - whether it's a new
    // login (maybeShowWelcome) or a manual replay from Profile (openWelcome).
    effect(() => {
      if (this.isOpen()) {
        this.currentSlide.set(0);
        this.dontShowAgain.set(false);
      }
    });
  }

  goNext(): void {
    this.currentSlide.update((i) => Math.min(i + 1, this.totalSlides - 1));
  }

  goBack(): void {
    this.currentSlide.update((i) => Math.max(i - 1, 0));
  }

  goToSlide(index: number): void {
    this.currentSlide.set(index);
  }

  toggleDontShowAgain(): void {
    this.dontShowAgain.update((value) => !value);
  }

  /** The X, always available regardless of which slide is showing. */
  close(): void {
    this.onboarding.closeWelcome(this.dontShowAgain());
  }
}
