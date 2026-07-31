/** Toggles `id` in/out of a multi-select filter list, refusing to remove the
 * last remaining selection - every multi-select filter in the app (Explorer's
 * discipline/event-type/status chips, the profile preferences editor, and any
 * future tab that adds its own) must always have at least one item selected,
 * since an empty selection is treated as "match nothing" everywhere search
 * is built from it. When the toggle would empty the list, `onBlocked()` fires
 * (typically to flash a brief warning) and the list is returned unchanged. */
export function toggleWithMinimum<T>(current: readonly T[], id: T, onBlocked: () => void): T[] {
  if (current.includes(id)) {
    if (current.length <= 1) {
      onBlocked();
      return [...current];
    }
    return current.filter((existing) => existing !== id);
  }
  return [...current, id];
}
