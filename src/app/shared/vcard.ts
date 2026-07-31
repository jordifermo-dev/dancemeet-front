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

/** Triggers the OS's own vCard handoff (Contacts app on iOS/Android) via a
 * throwaway Blob URL - no native plugin or contacts permission needed, since
 * we're not writing to the address book ourselves.
 *
 * Deliberately NOT using the `download` attribute: that forces a plain file
 * save everywhere (Files app on iOS, Downloads on Android/desktop) instead of
 * letting the OS recognize the vCard mime type and hand it to Contacts - which
 * only happens on a normal, undecorated navigation to the blob URL. */
export function downloadVCard(vcard: string): void {
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
