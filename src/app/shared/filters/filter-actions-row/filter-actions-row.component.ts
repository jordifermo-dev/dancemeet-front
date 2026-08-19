import { Component, Input, ViewEncapsulation } from '@angular/core';

/** Thin wrapper around a row of 1-2 <ion-button>s at the bottom of a filter
 * sheet (Guardar / Reestablecer+Aplica / Elimina+Aplica...) - the buttons
 * and their click handlers stay page-owned (projected via <ng-content>),
 * this only fixes the row's own layout/spacing/font-size in one place so
 * every button lines up and reads at the same size everywhere, instead of
 * each page hand-rolling (and occasionally drifting on) the same CSS.
 * ViewEncapsulation.None so its styles reach the projected <ion-button>s -
 * Emulated encapsulation would otherwise scope them out. */
@Component({
  selector: 'app-filter-actions-row',
  standalone: true,
  templateUrl: './filter-actions-row.component.html',
  styleUrl: './filter-actions-row.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class FilterActionsRowComponent {
  /** Second/lower row in a two-row footer (Guardar above, Reestablecer+Aplica
   * below) - just a smaller top margin so the two rows sit closer together. */
  @Input() secondary = false;
}
