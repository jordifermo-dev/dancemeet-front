import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/core/auth.service';
import { LanguageService } from '../services/core/language.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const authService = inject(AuthService);
  const languageService = inject(LanguageService);
  const lang = languageService.currentLang();

  return from(authService.getIdToken()).pipe(
    switchMap((token) => {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (lang) {
        headers['Accept-Language'] = lang;
      }
      return next(Object.keys(headers).length ? req.clone({ setHeaders: headers }) : req);
    }),
  );
};
