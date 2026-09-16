/**
 * Human file size.
 *
 * Whole numbers below a megabyte, one decimal above — `840 KB` and `2.4 MB` both read as a
 * size at a glance, while `0.8 MB` and `2457 KB` make the reader do arithmetic.
 *
 * Its own module because both the public form and the admin show file sizes, and the two
 * must agree: the sender is told a file is 2.4 MB and whoever receives the enquiry should
 * see the same number, not a differently rounded one.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
