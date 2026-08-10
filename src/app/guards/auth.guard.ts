import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.authReady;

  if (authService.isLoggedIn()) {
    return true;
  }
  return router.parseUrl('/login');
};

export const publicGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.authReady;

  if (!authService.isLoggedIn()) {
    return true;
  }
  return router.parseUrl('/tabs/home');
};
