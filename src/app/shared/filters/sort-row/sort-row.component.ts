import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { chevronDownOutline } from 'ionicons/icons';

@Component({
  selector: 'app-sort-row',
  standalone: true,
  templateUrl: './sort-row.component.html',
  styleUrl: './sort-row.component.scss',
  imports: [IonIcon, TranslatePipe],
})
export class SortRowComponent {
  @Input({ required: true }) titleKey!: string;
  @Input({ required: true }) valueLabelKey!: string;
  @Output() readonly opened = new EventEmitter<void>();

  constructor() {
    addIcons({ chevronDownOutline });
  }
}
