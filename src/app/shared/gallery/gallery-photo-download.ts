import { Capacitor } from '@capacitor/core';
import { Media } from '@capacitor-community/media';

// All downloaded photos land in one dedicated album rather than dumping
// them loose into the camera roll - created once per install, then reused
// (the identifier is cached in memory only; a fresh app process just looks
// it up again by name via getAlbums(), a cheap call).
const ALBUM_NAME = 'DanceMeet';
let cachedAlbumId: string | null = null;

async function resolveAlbumId(): Promise<string> {
  if (cachedAlbumId) {
    return cachedAlbumId;
  }
  const { albums } = await Media.getAlbums();
  const existing = albums.find((album) => album.name === ALBUM_NAME);
  if (existing) {
    cachedAlbumId = existing.identifier;
    return cachedAlbumId;
  }
  await Media.createAlbum({ name: ALBUM_NAME });
  const { albums: refreshed } = await Media.getAlbums();
  const created = refreshed.find((album) => album.name === ALBUM_NAME);
  // Falls through with an empty string only if album creation itself
  // silently failed - savePhoto would then just error out, surfaced to the
  // caller same as any other failure (no separate handling needed here).
  cachedAlbumId = created?.identifier ?? '';
  return cachedAlbumId;
}

/** Saves a gallery photo to the device - actually into the system Photos/
 * Gallery app (via @capacitor-community/media's MediaStore-backed
 * savePhoto), not just a temp file handed to a viewer. Filesystem+FileOpener
 * (still used for vCards, see vcard.ts) only ever lands in this app's own
 * private cache and opens a viewer on top of it - it never reaches the
 * user's actual Gallery, which is what "download" needs to mean here. */
export async function downloadGalleryPhoto(photoUrl: string, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const albumIdentifier = await resolveAlbumId();
    // savePhoto's fileName must NOT include the extension - the native side
    // appends one itself, so passing "name.jpg" produced "name.jpg.jpg" on
    // disk (confirmed via on-device logcat).
    const nameWithoutExtension = fileName.replace(/\.[^./]+$/, '');
    // savePhoto accepts a plain web URL directly - no manual fetch/base64
    // conversion needed, unlike the Filesystem-based approach this replaced.
    await Media.savePhoto({ path: photoUrl, albumIdentifier, fileName: nameWithoutExtension });
    return;
  }

  // Web: the `download` attribute forces a real save-as-file instead of
  // navigating to/opening the blob URL in a new tab (which is what
  // target="_blank" without it does for an image - the vCard/ICS download
  // helpers deliberately skip `download` to get an OS mime-type handoff
  // instead, but a plain image has no such handoff to rely on).
  const response = await fetch(photoUrl);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
