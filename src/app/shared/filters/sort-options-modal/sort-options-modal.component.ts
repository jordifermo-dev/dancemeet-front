import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonIcon, IonModal } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { FilterActionsRowComponent } from '../filter-actions-row/filter-actions-row.component';
import { FilterSheetHeaderComponent } from '../filter-sheet-header/filter-sheet-header.component';

export interface SortOption {
  id: string;
  labelKey: string;
}

@Component({
  selector: 'app-sort-options-modal',
  standalone: true,
  templateUrl: './sort-options-modal.component.html',
  styleUrl: './sort-options-modal.component.scss',
  imports: [IonModal, IonButton, IonIcon, TranslatePipe, FilterSheetHeaderComponent, FilterActionsRowComponent],
})
export class SortOptionsModalComponent {
  @Input({ required: true }) titleKey!: string;
  @Input({ required: true }) options: SortOption[] = [];
  @Input({ required: true }) selected!: string;
  @Input({ required: true }) isOpen = false;
  @Output() readonly optionSelected = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();

  constructor() {
    addIcons({ closeOutline });
  }
}
