import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';

/** Escapes vCard's reserved characters (RFC 6350) in a field value. */
function escapeVCardValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/** Builds a minimal VCARD 3.0 text block - name + phone, with email only if
 * given (the user may have their phone visible but not their email, or
 * neither). Opening it hands off to the device's own "add contact" screen,
 * where the person can review, edit, or discard it before it's actually saved -
 * we never touch the address book directly. */
export function buildVCard(name: string, phone: string, email?: string): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${escapeVCardValue(name)};;;`,
    `FN:${escapeVCardValue(name)}`,
    `TEL;TYPE=CELL:${escapeVCardValue(phone)}`,
  ];
  if (email) {
    lines.push(`EMAIL:${escapeVCardValue(email)}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/** Triggers the OS's own vCard handoff (Contacts app on iOS/Android) - no
 * contacts permission needed, since we're not writing to the address book
 * ourselves, only handing the file to whichever app the OS/user picks. */
export async function downloadVCard(vcard: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Blob URLs and the download-attribute trick below don't cross the
    // WebView-to-native boundary - write a real file the OS can see, then
    // *open* it (not share it): opening fires an ACTION_VIEW intent, which
    // lets Android's Contacts app claim .vcf files directly and jump
    // straight to its own "add contact" screen. Share.share() instead fires
    // ACTION_SEND, which only offers Contacts as one pick among every other
    // share target (WhatsApp, Drive...) - not what "save contact" means here.
    const { uri } = await Filesystem.writeFile({
      path: 'contact.vcf',
      data: vcard,
      directory: Directory.Cache,
      encoding: 'utf8' as never,
    });
    await FileOpener.open({ filePath: uri, contentType: 'text/x-vcard' });
    return;
  }

  // Web fallback - deliberately NOT using the `download` attribute: that
  // forces a plain file save everywhere (Files app on iOS, Downloads on
  // Android/desktop) instead of letting the OS recognize the vCard mime type
  // and hand it to Contacts - which only happens on a normal, undecorated
  // navigation to the blob URL.
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
