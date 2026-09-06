import { Injectable, signal } from '@angular/core';
import { EventListViewMode } from '../../shared/event/view-mode-menu/view-mode-menu.component';

/** Remembers the last view mode chosen on the merged Explorer tab (mapa/
 * lista/calendario/fotos), same criterion as SortPreferenceService - purely
 * in-memory for the session, not a saved preference, so no backend field is
 * involved and it resets on app restart. Kept separate from
 * SortPreferenceService rather than added there - sort order and render mode
 * are different concerns, and this one is only ever read/written by the
 * merged Explorer page (Favoritos/Mis Events reuse ViewModeMenuComponent too,
 * but never the 'map' mode, see its own showMap input). */
@Injectable({ providedIn: 'root' })
export class ViewModePreferenceService {
  readonly exploreViewMode = signal<EventListViewMode>('map');
}
