import { CanDeactivateFn } from '@angular/router';

export interface ComponentWithUnsavedChanges {
  canLeave(): Promise<boolean> | boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<ComponentWithUnsavedChanges> = (component) =>
  component.canLeave();
