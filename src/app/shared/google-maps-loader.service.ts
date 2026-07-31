import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/** Loads the Google Maps JavaScript API using Google's official "Dynamic
 * Library Import" bootstrap loader (developers.google.com/maps/documentation/javascript/load-maps-js-api).
 * A plain <script src=".../js?key=..."> tag does NOT define
 * `google.maps.importLibrary`, which @angular/google-maps' <google-map>
 * component calls internally - without this bootstrap it throws
 * "importLibrary is not a function". Only the Explorer map needs this (it's
 * a separate, billed API from Maps Embed), so it must not be pulled in
 * globally via index.html. */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private bootstrapped = false;
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.ensureBootstrap().then(() =>
        (window as unknown as { google: typeof google }).google.maps
          .importLibrary('maps')
          .then(() => undefined),
      );
    }
    return this.loadPromise;
  }

  private ensureBootstrap(): Promise<void> {
    const win = window as unknown as { google?: { maps?: { importLibrary?: unknown } } };
    if (win.google?.maps?.importLibrary) {
      return Promise.resolve();
    }
    if (!this.bootstrapped) {
      this.bootstrapped = true;
      const script = document.createElement('script');
      // Verbatim (re-formatted for readability, string-concatenated instead
      // of template literals to avoid escaping headaches) copy of Google's
      // own inline bootstrap snippet - do not "simplify" this, the recursive
      // importLibrary reassignment is how it hands off to the real API once
      // the actual script has loaded.
      script.textContent =
        '(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;' +
        'b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,' +
        'u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));' +
        'e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);' +
        'e.set("callback",c+".maps."+q);a.src="https://maps."+c+"apis.com/maps/api/js?"+e;d[q]=f;' +
        'a.onerror=()=>h=n(Error(p+" could not load."));' +
        'a.nonce=m.querySelector(\'script[nonce]\')?.nonce||"";m.head.append(a)}));' +
        'd[l]?console.warn(p+" only loads once. Ignoring:",g):' +
        'd[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})(' +
        JSON.stringify({ key: environment.googleMapsJsApiKey, v: 'weekly' }) +
        ');';
      document.head.appendChild(script);
    }
    return Promise.resolve();
  }
}
